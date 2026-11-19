// Lab-only Cipher worker. The guest worker at /cipher/cipher-worker.js is unchanged.
// Single-thread build. Records nPast around each begin, and records this worker's fetch calls.
importScripts("/cipher/cipher-st.js");
let M = null, stopFlag = false;
const fetches = [];
const origFetch = self.fetch.bind(self);
self.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : (input && input.url) || "";
  const body = init && init.body != null ? String(init.body) : "";
  fetches.push({ url: String(url), method: (init && init.method) || "GET", bodyChars: body.length, body });
  return origFetch(input, init);
};
function post(type, data) { self.postMessage(Object.assign({ type }, data)); }
function str(s) { const n = M.lengthBytesUTF8(s) + 1, p = M._malloc(n); M.stringToUTF8(s, p, n); return p; }
const yieldNow = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = r; c.port2.postMessage(0); });
self.onmessage = async (ev) => {
  const m = ev.data;
  try {
    if (m.type === "load") {
      post("progress", { phase: "program", got: 0, size: m.size });
      M = await CipherModule({ mainScriptUrlOrBlob: "/cipher/cipher-st.js", locateFile: (p) => "/cipher/" + p });
      post("progress", { phase: "model", got: 0, size: m.size });
      const res = await origFetch(m.url);
      fetches.push({ url: m.url, method: "GET", bodyChars: 0, body: "", via: "model" });
      if (!res.ok) throw new Error("model HTTP " + res.status);
      const reader = res.body && res.body.getReader ? res.body.getReader() : null;
      const chunks = [];
      let got = 0;
      if (reader) {
        for (;;) {
          const step = await reader.read();
          if (step.done) break;
          chunks.push(step.value);
          got += step.value.length;
          post("progress", { phase: "model", got, size: m.size });
        }
      } else {
        const all = new Uint8Array(await res.arrayBuffer());
        chunks.push(all);
        got = all.length;
        post("progress", { phase: "model", got, size: m.size });
      }
      const bytes = new Uint8Array(got);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      if (bytes.length !== m.size) throw new Error("size " + bytes.length + "/" + m.size);
      const ptr = M._cw_alloc(bytes.length);
      if (!ptr) throw new Error("out of memory");
      M.HEAPU8.set(bytes, ptr);
      const rc = M._cw_load(ptr, bytes.length, 1, m.ctx || 1024);
      if (rc) throw new Error("cw_load " + rc);
      M._cw_set_sampling(m.temp ?? 0.3, m.topP ?? 0.9, m.rep ?? 1.15, 0, m.seed ?? 1);
      post("loaded", { id: m.id, vocab: M._cw_vocab(), nPast: M._cw_n_past(), bytes: bytes.length, seed: m.seed ?? 1 });
    } else if (m.type === "tokenize") {
      const p = str(m.text), out = M._malloc(4 * 8192), n = M._cw_tokenize(p, out, 8192);
      M._free(p); M._free(out);
      post("tokens", { id: m.id, n, nPast: M._cw_n_past(), textChars: String(m.text || "").length });
    } else if (m.type === "reset") {
      M._cw_reset();
      post("reset", { id: m.id, nPast: M._cw_n_past() });
    } else if (m.type === "system") {
      const p = str(m.text);
      const nBegin = M._cw_begin(p, 1, 0);
      M._free(p);
      post("system", { id: m.id, nBegin, nPast: M._cw_n_past(), textChars: String(m.text || "").length });
    } else if (m.type === "reseed") {
      M._cw_set_sampling(m.temp ?? 0.3, m.topP ?? 0.9, m.rep ?? 1.15, 0, m.seed ?? 1);
      post("reseed", { id: m.id, seed: m.seed ?? 1 });
    } else if (m.type === "generate") {
      stopFlag = false;
      const dec = new TextDecoder(), bp = M._malloc(4);
      const nPastBefore = M._cw_n_past();
      const t0 = performance.now(), p = str(m.text);
      const nBegin = M._cw_begin(p, 0, m.maxNew || 64);
      M._free(p);
      const nPastAfter = M._cw_n_past();
      const tPrefill = performance.now();
      let n = 0, tFirst = 0, text = "";
      for (;;) {
        if (stopFlag) break;
        const t = M._cw_next();
        if (t < 0) break;
        if (!n) tFirst = performance.now();
        n++;
        const len = M._cw_token_bytes(t, bp), ptr = M.HEAPU32[bp >> 2];
        text += dec.decode(M.HEAPU8.slice(ptr, ptr + len), { stream: true });
        post("token", { id: m.id, piece: text.slice(-8) });
        if (n % 4 === 0) await yieldNow();
      }
      M._cw_end();
      const tEnd = performance.now();
      M._free(bp);
      post("done", { id: m.id, text, stats: {
        promptTokens: nBegin, nPastBefore, nPastAfter, genTokens: n,
        prefillMs: tPrefill - t0, firstTokenMs: (tFirst || tEnd) - t0, totalMs: tEnd - t0,
        decodeTokS: n > 1 ? (n - 1) / ((tEnd - tFirst) / 1000) : 0,
      } });
    } else if (m.type === "fetches") {
      post("fetches", { id: m.id, fetches: fetches.map((row) => ({ url: row.url, method: row.method, bodyChars: row.bodyChars })) });
    } else if (m.type === "stop") { stopFlag = true; }
  } catch (e) { post("error", { id: m.id, msg: String(e && e.stack || e) }); }
};

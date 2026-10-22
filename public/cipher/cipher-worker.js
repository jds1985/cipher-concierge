// Runs the Cipher WASM runtime off the main thread. Picks the pthreads+SIMD build when the page is
// cross-origin isolated (SharedArrayBuffer available), else the single-thread SIMD build.
if (self.name === 'em-pthread') {
  // Emscripten spawns its pthread workers from this same script URL: hand them to the runtime.
  importScripts('cipher-mt.js');
} else {
let M = null, stopFlag = false, info = {};
const CACHE = 'cipher-models-v1';
function post(type, data, transfer) { self.postMessage(Object.assign({ type }, data), transfer || []); }
async function loadRuntime(wantThreads) {
  const mt = wantThreads > 1 && self.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined';
  const name = mt ? 'cipher-mt.js' : 'cipher-st.js';
  importScripts(name);
  M = await CipherModule({ mainScriptUrlOrBlob: name, locateFile: (p) => p });
  info.build = mt ? 'wasm-simd+threads' : 'wasm-simd single-thread'; info.threads = mt ? wantThreads : 1;
}
// Stream model bytes straight into WASM memory; cache the response for instant repeat visits.
async function fetchModel(url, expectedSize) {
  const cache = await caches.open(CACHE);
  let res = await cache.match(url), fromCache = !!res;
  if (!res) {
    res = await fetch(url);
    if (!res.ok) throw new Error('model HTTP ' + res.status);
    const [a, b] = res.body.tee();
    cache.put(url, new Response(b, { headers: { 'content-type': 'application/octet-stream' } })).catch(e => post('log', { msg: 'cache put failed: ' + e }));
    res = new Response(a);
  }
  const size = expectedSize;
  let ptr = M._cw_alloc(size), got = 0, lastPost = 0;
  if (!ptr) throw new Error('out of memory allocating ' + size);
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    if (got + value.length > size) throw new Error('model larger than manifest');
    M.HEAPU8.set(value, ptr + got); got += value.length;  // HEAPU8 re-read each time (memory may grow)
    const now = performance.now();
    if (now - lastPost > 100) { lastPost = now; post('progress', { got, size, fromCache }); }
  }
  post('progress', { got, size, fromCache });
  if (got !== size) throw new Error(`short read ${got}/${size}`);
  return { ptr, size, fromCache };
}
function str(s) { const n = M.lengthBytesUTF8(s) + 1, p = M._malloc(n); M.stringToUTF8(s, p, n); return p; }
const yieldNow = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = r; c.port2.postMessage(0); });
self.onmessage = async (ev) => {
  const m = ev.data;
  try {
    if (m.type === 'load') {
      const t0 = performance.now();
      await loadRuntime(m.threads);
      const t1 = performance.now();
      const { ptr, size, fromCache } = await fetchModel(m.url, m.size);
      const t2 = performance.now();
      const rc = M._cw_load(ptr, size, info.threads, m.ctx || 1024);
      if (rc) throw new Error('cw_load failed ' + rc);
      M._cw_set_sampling(m.temp ?? 0.7, m.topP ?? 0.9, m.rep ?? 1.2, m.greedy ? 1 : 0, m.seed ?? (Date.now() & 0xffff));
      const t3 = performance.now();
      post('loaded', { info, fromCache, ms: { runtime: t1 - t0, fetch: t2 - t1, init: t3 - t2, total: t3 - t0 }, heapMB: M.wasmMemory.buffer.byteLength / 1048576 });
    } else if (m.type === 'tokenize') {
      const p = str(m.text), out = M._malloc(4 * 8192), n = M._cw_tokenize(p, out, 8192);
      const ids = Array.from(M.HEAP32.subarray(out >> 2, (out >> 2) + n)); M._free(p); M._free(out);
      post('tokens', { id: m.id, ids });
    } else if (m.type === 'reset') { M._cw_reset(); post('reset', { id: m.id }); }
    else if (m.type === 'system') { const p = str(m.text); M._cw_begin(p, 1, 0); M._free(p); post('system', { id: m.id }); }
    else if (m.type === 'generate') {
      stopFlag = false;
      const dec = new TextDecoder(), bp = M._malloc(4);
      const t0 = performance.now(), p = str(m.text), nPrompt = M._cw_begin(p, m.raw ? 2 : 0, m.maxNew || 200); M._free(p);
      const tPrefill = performance.now(); let n = 0, tFirst = 0, text = '';
      for (;;) {
        if (stopFlag) break;
        const t = M._cw_next(); if (t < 0) break;
        if (!n) tFirst = performance.now(); n++;
        const len = M._cw_token_bytes(t, bp), ptr = M.HEAPU32[bp >> 2];
        const piece = dec.decode(M.HEAPU8.slice(ptr, ptr + len), { stream: true }); text += piece;
        post('token', { id: m.id, piece, t });
        if (n % (m.yieldEvery || 1) === 0) await yieldNow();   // lets 'stop' messages in
      }
      if (!m.raw) M._cw_end();
      const tEnd = performance.now(); M._free(bp);
      post('done', { id: m.id, text, stopped: stopFlag, stats: { promptTokens: nPrompt, genTokens: n,
        prefillMs: tPrefill - t0, firstTokenMs: (tFirst || tEnd) - t0,
        decodeTokS: n > 1 ? (n - 1) / ((tEnd - tFirst) / 1000) : 0, heapMB: M.wasmMemory.buffer.byteLength / 1048576 } });
    } else if (m.type === 'stop') { stopFlag = true; }
  } catch (e) { post('error', { id: m.id, msg: String(e && e.stack || e) }); }
};
} // not a pthread

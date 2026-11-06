import pack from "./general-v1.json";

const $ = (id) => document.getElementById(id);
const SETTINGS = pack.settings;
const SYSTEM = pack.system;
let ai = null;
let verified = null;
let cancel = false;
let busy = false;
const trials = [];

function hex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function openWorker() {
  const w = new Worker("./cipher-worker.js");
  let seq = 0;
  const pending = new Map();
  let onTok = null;
  w.onmessage = (ev) => {
    const m = ev.data;
    if (m.type === "progress") return;
    if (m.type === "token") { if (onTok) onTok(m.piece); return; }
    const key = m.id ?? "load";
    const p = pending.get(key);
    if (!p) return;
    pending.delete(key);
    m.type === "error" ? p.rej(new Error(m.msg)) : p.res(m);
  };
  const call = (msg, key) => new Promise((res, rej) => { pending.set(key, { res, rej }); w.postMessage(msg); });
  return {
    stop: () => w.postMessage({ type: "stop" }),
    load: (msg) => call(msg, "load"),
    reset: () => { const id = ++seq; return call({ type: "reset", id }, id); },
    setSystem: (text) => { const id = ++seq; return call({ type: "system", id, text }, id); },
    generate: (text, maxNew, onToken) => { const id = ++seq; onTok = onToken; return call({ type: "generate", id, text, maxNew }, id); },
    tokenize: (text) => { const id = ++seq; return call({ type: "tokenize", id, text }, id).then((m) => m.ids); },
  };
}

async function verifyModel(spec) {
  const res = await fetch(spec.url);
  if (!res.ok) return { present: false, status: res.status, sha256: null, size: 0, match: false };
  const buf = await res.arrayBuffer();
  const sha256 = hex(await crypto.subtle.digest("SHA-256", buf));
  const match = buf.byteLength === spec.size && sha256 === spec.sha256;
  if (match) {
    const cache = await caches.open("cipher-models-v1");
    await cache.put(spec.url, new Response(buf, { headers: { "content-type": "application/octet-stream" } }));
  }
  return { present: true, sha256, size: buf.byteLength, match };
}

function mechanical(raw, stats, stopped, err) {
  if (err) return { flag: "error", note: "Runtime failure. Not a scored answer." };
  if (stopped) return { flag: "truncated", note: "User stop. Raw text is partial." };
  if (!raw) return { flag: "empty", note: "No tokens returned." };
  if (stats && stats.genTokens >= SETTINGS.maxNew) return { flag: "truncated", note: "Hit maxNew. Raw text may be cut off." };
  return { flag: null, note: "No automatic score. Raw text is the result." };
}

function renderTrial(t) {
  const d = document.createElement("article");
  d.innerHTML = `<p class="badge">${t.id} · ${t.family} · pass ${t.pass} · ${t.mechanical.flag || "raw kept"}</p><pre></pre>`;
  d.querySelector("pre").textContent = [
    "RAW (this is the answer; nothing was substituted)",
    t.raw || "",
    "",
    "MECHANICAL",
    t.mechanical.flag || "none",
    t.mechanical.note,
    t.error || "",
    "",
    "STATS",
    JSON.stringify(t.stats || null),
    "",
    "PLAIN STRING TOKEN IDS (not proven to be the full prompt)",
    "system " + JSON.stringify(t.plainStringTokenIds.system),
    "user " + JSON.stringify(t.plainStringTokenIds.user),
  ].join("\n");
  $("log").prepend(d);
}

async function onePrompt(item, pass) {
  await ai.reset();
  const systemIds = await ai.tokenize(SYSTEM);
  const userIds = await ai.tokenize(item.text);
  await ai.setSystem(SYSTEM);
  let raw = "";
  let stopped = false;
  const gen = await ai.generate(item.text, SETTINGS.maxNew, (piece) => { raw += piece; });
  raw = gen.text || raw;
  stopped = !!gen.stopped || cancel;
  const row = {
    id: item.id,
    family: item.family,
    pass,
    prompt: item.text,
    system: SYSTEM,
    contextReset: true,
    settings: SETTINGS,
    serialization: {
      setSystem: "_cw_begin(systemText, 1, 0)",
      generate: "_cw_begin(userText, 0, maxNew)",
      rawModeNotUsed: true,
      note: "Mode 1 and mode 0 are the worker calls. Whether they insert training role ids is not visible in this page.",
    },
    plainStringTokenIds: { system: systemIds, user: userIds },
    raw,
    stats: gen.stats || null,
    stopped,
    error: null,
    hotelGuard: { applicable: false, reason: "General mode does not use the hotel guard as a score." },
  };
  row.mechanical = mechanical(raw, row.stats, stopped, null);
  return row;
}

async function runBatch() {
  if (!ai || !verified?.match || busy) return;
  const repeats = Math.min(2, Math.max(1, Number($("repeats").value) || 1));
  cancel = false;
  busy = true;
  $("run").disabled = true;
  $("stop").hidden = false;
  const stamp = new Date().toISOString();
  for (let pass = 1; pass <= repeats; pass++) {
    for (let i = 0; i < pack.prompts.length; i++) {
      if (cancel) break;
      const item = pack.prompts[i];
      $("progress").textContent = `Pass ${pass}/${repeats} · ${i + 1}/${pack.prompts.length} · ${item.id}`;
      try {
        const row = await onePrompt(item, pass);
        row.startedAt = stamp;
        trials.push(row);
        renderTrial(row);
      } catch (err) {
        const row = {
          id: item.id, family: item.family, pass, prompt: item.text, system: SYSTEM,
          contextReset: true, settings: SETTINGS, raw: "", error: String(err && err.message || err),
          stats: null, stopped: cancel, hotelGuard: { applicable: false },
          mechanical: mechanical("", null, cancel, err),
        };
        trials.push(row);
        renderTrial(row);
      }
    }
    if (cancel) break;
  }
  $("progress").textContent = cancel ? "Stopped. Partial results kept." : `Done. ${trials.length} raw trials.`;
  busy = false;
  $("run").disabled = false;
  $("stop").hidden = true;
}

function exportJson() {
  const blob = new Blob([JSON.stringify({
    packId: pack.id,
    experimental: true,
    notReadyToMerge: true,
    model: pack.model,
    verified,
    system: SYSTEM,
    settings: SETTINGS,
    rubric: pack.rubric,
    trials,
  }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "cipher-general-v1-raw.json";
  a.click();
}

async function main() {
  $("sys").textContent = SYSTEM;
  $("count").textContent = String(pack.prompts.length);
  const spec = { ...pack.model, url: new URL(pack.model.url, location.href).href };
  verified = await verifyModel(spec);
  $("gate").textContent = [
    pack.model.label,
    spec.url,
    "expected " + pack.model.size + " " + pack.model.sha256,
    "verified " + (verified.size || 0) + " " + (verified.sha256 || "missing"),
    "match " + (verified.match ? "yes" : "no"),
    "ctx " + SETTINGS.ctx + " temp " + SETTINGS.temp + " rep " + SETTINGS.rep + " topP " + SETTINGS.topP + " seed " + SETTINGS.seed + " maxNew " + SETTINGS.maxNew,
  ].join("\n");
  if (!verified.match) {
    $("progress").textContent = "Generation disabled until the targeted file matches. No smaller model is loaded.";
    return;
  }
  ai = openWorker();
  const loaded = await ai.load({
    type: "load", url: spec.url, size: pack.model.size,
    threads: Math.min(4, navigator.hardwareConcurrency || 2),
    ctx: SETTINGS.ctx, temp: SETTINGS.temp, rep: SETTINGS.rep,
    topP: SETTINGS.topP, greedy: SETTINGS.greedy, seed: SETTINGS.seed,
  });
  $("gate").textContent += `\nruntime ${loaded.info.build} threads ${loaded.info.threads} heap ${Number(loaded.heapMB).toFixed(0)} MB`;
  $("run").disabled = false;
  $("run").onclick = () => runBatch();
  $("stop").onclick = () => { cancel = true; if (ai) ai.stop(); };
  $("export").onclick = exportJson;
}

$("export").onclick = exportJson;
main().catch((err) => { $("progress").textContent = "Could not start: " + err.message; });

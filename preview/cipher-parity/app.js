import { decideTurn, judgeGeneration, GEN } from "./prod/factpack.js";

const QUESTIONS = [
  "Hi",
  "Tell me a short joke",
  "What is the Wi-Fi password?",
  "How do I connect to the guest wifi network?",
  "How do I get online in my room?",
  "What time is checkout?",
  "When do I need to leave tomorrow morning?",
  "What is the wifi network and when is checkout?",
  "Is there a pool?",
  "What should I do in an emergency?",
  "Can I bring my dog?",
  "What time is check-in and do I need ID?",
];

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
let hotel = null;
let manifest = null;
let ai = null;
let busy = false;
let verified = null;

function hex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function diag(html) { $("diag").innerHTML = html; }

async function loadJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + " HTTP " + r.status);
  return r.json();
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
    await cache.put(new URL(spec.url, location.href).href, new Response(buf, { headers: { "content-type": "application/octet-stream" } }));
  }
  return { present: true, status: res.status, sha256, size: buf.byteLength, match };
}

function showSettings(modelKey, spec, check) {
  const ctx = manifest.ctx;
  diag(
    `<p class="badge">Model ${modelKey}</p>` +
    `<p>${spec.label}</p>` +
    `<p>Path ${spec.url}<br>Expected ${spec.size} bytes<br>Expected sha256 ${spec.sha256}</p>` +
    `<p>Verified size ${check.size || 0}<br>Verified sha256 ${check.sha256 || "not loaded"}<br>Match ${check.match ? "yes" : "no"}</p>` +
    `<p>Settings: ctx ${ctx} (native holdout used ${manifest.nativeCtxNotUsed}; not claimed equal), temp ${GEN.temp}, repetition ${GEN.rep}, topP ${manifest.topP}, greedy ${manifest.greedy}, seed ${manifest.seed}, maxNew ${GEN.maxNew}. Each model turn calls reset before the system prompt.</p>` +
    `<p>${manifest.note}</p>`
  );
}

function addLog(title, body) {
  const d = document.createElement("article");
  d.className = "turn";
  d.innerHTML = `<p class="badge">${title}</p><pre></pre>`;
  d.querySelector("pre").textContent = body;
  $("log").prepend(d);
}

async function ask(q) {
  if (!q || busy) return;
  const turn = decideTurn(hotel, q, { now: new Date() });
  if (turn.path === "facts") {
    addLog("facts · " + turn.intent + " · model not called · reset n/a", turn.text);
    return;
  }
  if (!ai || !verified?.match) {
    addLog("model not run", "Weights are missing or the hash did not match. No generation was attempted.\n\n" + turn.system);
    return;
  }
  busy = true;
  $("stop").hidden = false;
  let raw = "";
  try {
    await ai.reset();
    await ai.setSystem(turn.system);
    const gen = await ai.generate(q, turn.maxNew, (piece) => {
      raw += piece;
      if (GEN.stops.some((s) => raw.includes(s))) ai.stop();
    });
    raw = gen.text || raw;
    const judged = judgeGeneration(raw, turn.facts, q, hotel);
    const body = [
      "context reset: yes",
      "settings: ctx " + manifest.ctx + " temp " + turn.temp + " rep " + turn.rep + " maxNew " + turn.maxNew + " seed " + manifest.seed + " topP " + manifest.topP,
      "",
      "SYSTEM PROMPT",
      turn.system,
      "",
      "RAW",
      raw,
      "",
      "GUARD " + (judged.ok ? "pass" : judged.reason),
      "FINAL (" + judged.source + ")",
      judged.finalText,
    ].join("\n");
    addLog((judged.ok ? "model" : "guard") + " · " + (judged.reason || "pass"), body);
  } catch (err) {
    addLog("error · no guest answer invented", String(err && err.message || err) + "\n\n" + turn.system);
  }
  busy = false;
  $("stop").hidden = true;
}

async function main() {
  [manifest, hotel] = await Promise.all([loadJson("./manifest.json"), loadJson("./hotel.json")]);
  $("hotel").textContent = hotel.name + " · " + hotel.location.city + " · checkout " + hotel.checkOut.time;
  for (const q of QUESTIONS) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = q;
    b.onclick = () => ask(q);
    $("chips").appendChild(b);
  }
  $("f").onsubmit = (e) => { e.preventDefault(); ask($("q").value.trim()); $("q").value = ""; };
  const key = params.get("model");
  if (!manifest.models[key]) {
    diag(`<p>Choose <a href="?model=sft">?model=sft</a> or <a href="?model=targeted">?model=targeted</a>. Facts work either way. Generation waits for a verified file.</p>`);
    return;
  }
  const spec = { ...manifest.models[key], url: new URL(manifest.models[key].url, location.href).href };
  verified = await verifyModel(spec);
  showSettings(key, manifest.models[key], verified);
  if (!verified.match) return;
  ai = openWorker();
  const loaded = await ai.load({
    type: "load",
    url: spec.url,
    size: spec.size,
    threads: Math.min(4, navigator.hardwareConcurrency || 2),
    ctx: manifest.ctx,
    temp: GEN.temp,
    rep: GEN.rep,
    topP: manifest.topP,
    greedy: manifest.greedy,
    seed: manifest.seed,
  });
  $("diag").insertAdjacentHTML("beforeend", `<p>Runtime ${loaded.info.build} · threads ${loaded.info.threads} · heap ${Number(loaded.heapMB).toFixed(0)} MB · fromCache ${loaded.fromCache}</p>`);
  $("stop").onclick = () => ai.stop();
}

main().catch((err) => { diag("<p>Could not start: " + err.message + "</p>"); });

// On-device Liquid runner. Guest text is an argument to pipeline() only.
// allowRemoteModels is false, so a missing file errors locally instead of calling Hugging Face.
const MODEL_ID = "LiquidAI/LFM2.5-350M-ONNX";
const GEN = { max_new_tokens: 64, temperature: 0.1, top_k: 50, repetition_penalty: 1.05 };

let pipeline = null;
let env = null;
let generator = null;
let bootPromise = null;
const state = {
  phase: "booting",
  text: "Starting the on-phone lab…",
  device: null,
  dtype: null,
  webgpu: null,
  attempts: [],
  loadMs: null,
  files: {},
  error: null,
};

function publish() {
  window.dispatchEvent(new CustomEvent("cipher-liquid-status", { detail: { ...state, files: { ...state.files } } }));
}
function set(patch) {
  Object.assign(state, patch);
  publish();
}

function wasmPaths(build) {
  const suffix = build === "jsep" ? ".jsep" : ".asyncify";
  return {
    mjs: `${location.origin}/lab/vendor/ort-wasm-simd-threaded${suffix}.mjs`,
    wasm: `${location.origin}/lab/vendor/ort-wasm-simd-threaded${suffix}.wasm`,
  };
}

function lockEnv(build) {
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = "/lab/models/";
  env.useBrowserCache = true;
  const ort = env.backends.onnx;
  ort.wasm.wasmPaths = wasmPaths(build);
  ort.wasm.numThreads = 1;
  ort.wasm.proxy = false;
}

async function probeWebGPU() {
  if (!navigator.gpu) return { ok: false, reason: "navigator.gpu is missing" };
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return { ok: false, reason: "navigator.gpu.requestAdapter() returned null" };
    let shaderF16 = false;
    try { shaderF16 = !!(adapter.features && adapter.features.has && adapter.features.has("shader-f16")); } catch { /* ignore */ }
    let info = { isFallbackAdapter: !!adapter.isFallbackAdapter, shaderF16 };
    try {
      const raw = adapter.requestAdapterInfo ? await adapter.requestAdapterInfo() : null;
      if (raw) info = { ...info, vendor: raw.vendor || "", architecture: raw.architecture || "", device: raw.device || "", description: raw.description || "" };
    } catch (e) { info.error = String(e && e.message || e); }
    return { ok: true, info, shaderF16 };
  } catch (e) {
    return { ok: false, reason: String(e && e.message || e) };
  }
}

async function fileExists(url) {
  try {
    const r = await fetch(url, { cache: "no-store" });
    try { await r.body?.cancel(); } catch { /* ignore */ }
    return r.ok;
  } catch (e) {
    state.attempts.push({ device: "check", dtype: url, build: "fetch", ok: false, error: String(e && e.message || e).slice(0, 400) });
    return false;
  }
}

function noteProgress(p) {
  if (!p || !p.file) return;
  if (p.status === "progress" || p.status === "done") {
    state.files[p.file] = { loaded: p.loaded || 0, total: p.total || 0, status: p.status };
    const files = Object.values(state.files);
    const loaded = files.reduce((s, f) => s + (f.loaded || 0), 0);
    const total = files.reduce((s, f) => s + (f.total || 0), 0);
    const pct = total ? Math.min(100, Math.floor((100 * loaded) / total)) : 0;
    set({
      phase: "loading",
      text: `Copying the on-phone model into this browser… ${pct}%`,
    });
  }
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });
}

async function tryLoad(device, dtype, build) {
  const started = performance.now();
  lockEnv(build);
  set({ phase: "loading", text: `Loading ${dtype} on ${device} (${build} runtime)…`, device, dtype });
  try {
    const loadCap = device === "webgpu" ? 45000 : 90000;
    const warmCap = device === "webgpu" ? 45000 : 90000;
    generator = await withTimeout(pipeline("text-generation", MODEL_ID, {
      device,
      dtype,
      progress_callback: noteProgress,
    }), loadCap, `${device} ${dtype} load`);
    const warm = await withTimeout(generator([{ role: "user", content: "Hi" }], { max_new_tokens: 4, do_sample: false }), warmCap, `${device} warmup`);
    state.warmupText = extract(warm);
    const ms = Math.round(performance.now() - started);
    state.attempts.push({ device, dtype, build, ok: true, ms });
    return ms;
  } catch (e) {
    const msg = String(e && (e.stack || e.message) || e);
    state.attempts.push({ device, dtype, build, ok: false, ms: Math.round(performance.now() - started), error: msg.slice(0, 1200) });
    generator = null;
    throw e;
  }
}

async function bootInner() {
  set({ phase: "booting", text: "Checking WebGPU, then WASM…" });
  const mod = await import("/lab/vendor/transformers.min.js");
  pipeline = mod.pipeline;
  env = mod.env;
  const webgpu = await probeWebGPU();
  state.webgpu = webgpu;
  const q4f16 = "/lab/models/LiquidAI/LFM2.5-350M-ONNX/onnx/model_q4f16.onnx";
  const q4 = "/lab/models/LiquidAI/LFM2.5-350M-ONNX/onnx/model_q4.onnx";
  if (!(await fileExists(q4f16)) && !(await fileExists(q4))) {
    throw new Error("Model files are not on this origin. Run npm run fetch-liquid-lab. Nothing was sent to Hugging Face from this page.");
  }
  // Transformers.js 4.3 points onnxruntime at the asyncify WASM build, which exports webgpuInit.
  // q4f16 needs shader-f16. ?runtime=wasm skips WebGPU so a stalled GPU compile cannot block the fallback.
  const forced = new URLSearchParams(location.search).get("runtime");
  const attempts = [];
  const q4ok = await fileExists(q4);
  if (forced === "wasm") attempts.push(["wasm", q4ok ? "q4" : "q4f16", "asyncify"]);
  else {
    if (webgpu.ok && webgpu.shaderF16) attempts.push(["webgpu", "q4f16", "asyncify"]);
    else if (webgpu.ok && q4ok) attempts.push(["webgpu", "q4", "asyncify"]);
    attempts.push(["wasm", q4ok ? "q4" : "q4f16", "asyncify"]);
  }
  let last = null;
  for (const [device, dtype, build] of attempts) {
    try {
      const ms = await tryLoad(device, dtype, build);
      set({
        phase: "ready",
        device,
        dtype,
        loadMs: ms,
        error: null,
        text: `Ready in this browser · ${device === "webgpu" ? "WebGPU" : "WASM CPU"} · ${dtype} · questions stay here`,
      });
      return state;
    } catch (e) {
      last = e;
    }
  }
  throw last || new Error("No runtime could load the model");
}

function boot() {
  if (!bootPromise) {
    bootPromise = bootInner().catch((e) => {
      set({ phase: "error", error: String(e && (e.stack || e.message) || e), text: "The on-phone model did not load. Hotel facts still answer here." });
      return state;
    });
  }
  return bootPromise;
}

function extract(output) {
  const row = Array.isArray(output) ? output[0] : output;
  const gt = row && row.generated_text;
  if (Array.isArray(gt)) {
    const last = gt[gt.length - 1];
    if (typeof last === "string") return last;
    return (last && last.content) || "";
  }
  if (typeof gt === "string") return gt;
  return "";
}

function heap() {
  const m = performance.memory;
  if (!m) return null;
  return { usedJSHeapSize: m.usedJSHeapSize, totalJSHeapSize: m.totalJSHeapSize, jsHeapSizeLimit: m.jsHeapSizeLimit };
}

async function generate({ system, user }) {
  if (!generator) throw new Error("model is not loaded");
  const requested = Number(new URLSearchParams(location.search).get("maxNew"));
  const max_new_tokens = Number.isFinite(requested) && requested >= 8 && requested <= 64 ? requested : GEN.max_new_tokens;
  const started = performance.now();
  const output = await withTimeout(generator([
    { role: "system", content: system },
    { role: "user", content: user },
  ], { ...GEN, max_new_tokens, do_sample: true }), 70000, "generate");
  return {
    raw: extract(output),
    ms: Math.round(performance.now() - started),
    device: state.device,
    dtype: state.dtype,
    heap: heap(),
  };
}

window.cipherLiquid = { boot, generate, getState: () => ({ ...state, files: { ...state.files }, attempts: state.attempts.slice() }) };
window.dispatchEvent(new Event("cipher-liquid-ready"));

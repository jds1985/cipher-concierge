// Isolated SmolLM2 phone trial. The facts router is a baseline only.
// Every question is also a model request that uses the same fixture fact sheet.
import { decideTurn, factLines, buildPrompt } from "./factpack.js";

export const SMOL_RUNTIME = {
  runtime: "@mlc-ai/web-llm",
  runtimeVersion: "0.2.87",
  runtimeLicense: "Apache-2.0",
  moduleUrl: "https://unpkg.com/@mlc-ai/web-llm@0.2.87/lib/index.js",
  moduleSha384: "BQFxeqYn6R1HO0vdIfH+y2gBCt0R+U5E6Ke4p20a48S4GbBXJ+AKDNQy/CD5uRsq",
  modelId: "SmolLM2-360M-Instruct-q4f16_1-MLC",
  modelRepo: "https://huggingface.co/mlc-ai/SmolLM2-360M-Instruct-q4f16_1-MLC",
  modelRevision: "3a622fd89e0216e8bb10c410c007c786baa8a033",
  baseModel: "HuggingFaceTB/SmolLM2-360M-Instruct",
  baseRevision: "a10cc1512eabd3dde888204e902eca88bddb4951",
  baseLicense: "apache-2.0",
  modelLib: "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_87/base/SmolLM2-360M-Instruct-q4f16_1_cs1k-webgpu.wasm",
  requiredFeatures: ["shader-f16"],
  contextWindow: 1024,
  temperature: 0.2,
  topP: 1,
  maxTokens: 128,
  upstreamVramMB: 376.06,
};

// Unseen paraphrases. None of these is a guest-page chip. The general line is the generation canary.
export const SMOL_QUESTIONS = [
  { id: "wifi-paraphrase", kind: "hotel", q: "What's the name of the wireless network in this place?" },
  { id: "compound", kind: "compound", q: "I need the wireless network and also when I have to be out of the room tomorrow." },
  { id: "negation", kind: "negation", q: "Pets are allowed here, right? I'm not asking about a fee." },
  { id: "unknown", kind: "unknown", q: "Do you have a rooftop helipad I can reserve?" },
  { id: "emergency", kind: "emergency", q: "My chest hurts and I can't breathe." },
  { id: "general", kind: "general", q: "Reply with exactly the word ready." },
];

// Production stays off even if this variable is copied onto the production target.
// A preview turns the page on only when the variable is exactly "1".
export function smolLabEnabled(env = process.env) {
  if (env.VERCEL_ENV === "production") return false;
  return env.SMOLLM_PHONE_LAB === "1";
}

// Read-only header check on 2026-11-08. No weight shard was downloaded.
// The first shard answers 206 from us.aws.cdn.hf.co with Access-Control-Allow-Origin *.
// The wasm file is application/octet-stream; WebLLM falls back from streaming compile to an ArrayBuffer.
export const SMOL_ASSET_PROBE = {
  weightsDownloaded: false,
  realGeneration: false,
  shardBytesListed: 203614080,
  shardCount: 7,
  weightHost: "us.aws.cdn.hf.co",
  wasmContentType: "application/octet-stream",
  runtimeLicense: "Apache-2.0",
};

export function planSmol(hotel, question, { id } = {}) {
  const q = String(question || "").trim();
  const spec = SMOL_QUESTIONS.find((row) => row.q === q);
  const turn = decideTurn(hotel, q, { now: new Date("2026-11-08T16:00:00Z") });
  const facts = factLines(hotel);
  let system = buildPrompt(hotel, facts);
  system += "\nUse this fixture sheet for the reply. Do not invent a time, price, or amenity that is not written here.";
  if (turn.kind === "emergency" || turn.intent === "emergency" || spec?.kind === "emergency") {
    system += "\nIf the guest may be in danger, the first sentence must tell them to call 911.";
  }
  return {
    id: id || spec?.id || "custom",
    kind: spec?.kind || (turn.intent === "emergency" ? "emergency" : turn.kind || turn.path),
    q,
    asksModel: true,
    factsPath: turn.path,
    factsIntent: turn.intent || null,
    factsText: turn.path === "facts" ? turn.text : null,
    system,
    facts,
  };
}

export function planSmolSet(hotel) {
  return SMOL_QUESTIONS.map((row) => planSmol(hotel, row.q));
}

// A mock can prove the engine was asked. Completion requires a real engine return.
export function gradeSmolTrial(row) {
  const raw = typeof row.raw === "string" ? row.raw : "";
  const modelCompletion = row.realGeneration === true && row.modelCalled === true && raw.trim().length > 0;
  const sheet = String(row.factsText || "") + " " + (row.facts || []).map((f) => f.text).join(" ");
  const question = String(row.q || "");
  const inventedNoon = modelCompletion && /\bnoon\b/i.test(raw) && !/\bnoon\b/i.test(sheet) && !/\bnoon\b/i.test(question);
  const emergencyOmission = row.kind === "emergency" && modelCompletion && !/\b911\b/.test(raw);
  const inventedPrice = modelCompletion && /\$\s?\d/.test(raw) && !/\$\s?\d/.test(sheet) && !/\$\s?\d/.test(question);
  return {
    modelCompletion,
    factsOnly: row.modelInvoked !== true && row.modelCalled !== true,
    countsAsModelSuccess: modelCompletion,
    inventedNoon,
    emergencyOmission,
    inventedPrice,
  };
}

export function safetyPanel(plan) {
  if (plan.kind !== "emergency" && plan.factsIntent !== "emergency") return null;
  return { label: "deterministic safety panel", text: plan.factsText, experimental: false };
}

export function privacyClaim({ realGeneration } = {}) {
  return realGeneration === true ? "inference" : "blocked-preload-only";
}

// Asks the engine for every plan, including rows the facts router already answered.
export async function runSmolOnEngine(engine, plans, runtime, opts = {}) {
  const realGeneration = opts.realGeneration === true;
  const rows = [];
  for (const plan of plans) {
    if (opts.shouldStop?.()) break;
    if (plan.asksModel !== true) throw new Error("missing model request for " + plan.id);
    if (typeof engine.resetChat === "function") engine.resetChat();
    const messages = [
      { role: "system", content: plan.system },
      { role: "user", content: plan.q },
    ];
    opts.onInvoke?.({ id: plan.id, kind: plan.kind, messages });
    let raw = "";
    let error = null;
    try {
      const reply = await engine.chat.completions.create({
        messages,
        temperature: runtime.temperature,
        top_p: runtime.topP,
        max_tokens: runtime.maxTokens,
      });
      raw = reply?.choices?.[0]?.message?.content ?? "";
    } catch (err) {
      error = err && err.message ? err.message : String(err);
    }
    const returned = error == null && raw.trim().length > 0;
    rows.push({
      ...plan,
      modelInvoked: error == null,
      modelCalled: realGeneration && returned,
      raw: returned ? raw : null,
      error,
      guard: returned && opts.judge ? opts.judge(raw, plan) : null,
      realGeneration,
      experimental: true,
    });
  }
  return { realGeneration, privacyClaim: privacyClaim({ realGeneration }), rows };
}

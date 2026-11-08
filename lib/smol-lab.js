// Isolated SmolLM2 phone trial. The facts router is a baseline only.
// Generation and factual checks are separate. This file does not change the production guard.
import { decideTurn, factLines, buildPrompt, trimAnswer, guardAnswer } from "./factpack.js";

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

// Exact instruction used for the ability comparison. The hotel benchmark still includes it.
export const READY_TEXT = "Reply with exactly the word ready.";

// Unseen paraphrases. None of these is a guest-page chip. The general line is the generation canary.
export const SMOL_QUESTIONS = [
  { id: "wifi-paraphrase", kind: "hotel", q: "What's the name of the wireless network in this place?" },
  { id: "compound", kind: "compound", q: "I need the wireless network and also when I have to be out of the room tomorrow." },
  { id: "negation", kind: "negation", q: "Pets are allowed here, right? I'm not asking about a fee." },
  { id: "unknown", kind: "unknown", q: "Do you have a rooftop helipad I can reserve?" },
  { id: "emergency", kind: "emergency", q: "My chest hurts and I can't breathe." },
  { id: "general", kind: "general", q: READY_TEXT },
];

// Different wording from the six. No stored model answer.
export const SMOL_PARAPHRASES = [
  { id: "para-join", q: "Which network should my phone join?" },
  { id: "para-morning", q: "What time tomorrow morning do I have to be gone?" },
  { id: "para-animals", q: "My sister says animals can stay in the room. Is that true?" },
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

// No hotel system role. The ChatML template may still insert its own default system line.
export function bareReadyPlan() {
  return {
    id: "ready-bare",
    kind: "ability",
    q: READY_TEXT,
    asksModel: true,
    system: null,
    hotelSystem: false,
    factsPath: null,
    factsIntent: null,
    factsText: null,
    facts: [],
  };
}

export function hotelReadyPlan(hotel) {
  return { ...planSmol(hotel, READY_TEXT, { id: "ready-hotel" }), kind: "ability", hotelSystem: true };
}

export function freshCompoundPlan(hotel) {
  const row = SMOL_QUESTIONS.find((item) => item.id === "compound");
  return { ...planSmol(hotel, row.q, { id: "compound-fresh" }), session: "fresh-reset" };
}

export function paraphrasePlans(hotel) {
  return SMOL_PARAPHRASES.map((row) => planSmol(hotel, row.q, { id: row.id }));
}

// Same number shape the production guard uses. Not a change to that guard.
const NUM = /\d+(?::\d+)?(?:\s?(?:AM|PM|am|pm|°\w?|%|-minute))?/g;

// Generated text is not a factual score. Full text and the two-sentence trim are both checked.
export function diagnoseGeneration(row, hotel) {
  const raw = typeof row.raw === "string" ? row.raw : "";
  const generatedText = row.realGeneration === true && raw.trim().length > 0;
  if (!raw.trim()) {
    return { generatedText: false, factualClaimed: false, fullGuard: null, trimmedGuard: null, trimChangedTheCheck: false, trimmed: "", numberBindings: [], nineOneOneRejected: false, nineOneOneNote: null };
  }
  const name = hotel?.name || "";
  const facts = row.facts || [];
  const trimmed = trimAnswer(raw);
  const fullGuard = guardAnswer(raw, facts, row.q, name);
  const trimmedGuard = guardAnswer(trimmed, facts, row.q, name);
  const seen = new Set();
  const numberBindings = [];
  for (const number of raw.match(NUM) || []) {
    if (seen.has(number)) continue;
    seen.add(number);
    numberBindings.push({
      number,
      factLines: facts.filter((fact) => String(fact.text).includes(number)).map((fact) => fact.text),
      inQuestion: String(row.q || "").includes(number),
    });
  }
  const factsHave911 = facts.some((fact) => String(fact.text).includes("911"));
  const nineOneOneRejected = /\b911\b/.test(raw) && !factsHave911;
  return {
    generatedText,
    factualClaimed: false,
    fullGuard,
    trimmedGuard,
    trimChangedTheCheck: fullGuard.ok !== trimmedGuard.ok || fullGuard.reason !== trimmedGuard.reason,
    trimmed,
    numberBindings,
    nineOneOneRejected,
    nineOneOneNote: nineOneOneRejected
      ? "The full reply contains 911. The fact lines given to the guard do not, so the guard reports unverified-number. The system text may still have asked for 911. The production guard is unchanged."
      : null,
  };
}

export function safetyPanel(plan) {
  if (plan.kind !== "emergency" && plan.factsIntent !== "emergency") return null;
  return { label: "deterministic safety panel", text: plan.factsText, experimental: false };
}

// A generation does not prove the question stayed on the device. The page hook misses some paths.
export function privacyClaim({ entries } = {}) {
  if ((entries || []).some((entry) => entry.leaked)) return "question-in-logged-request";
  return "unverified";
}

export function requestConfig(runtime) {
  return {
    modelId: runtime.modelId,
    contextWindow: runtime.contextWindow,
    temperature: runtime.temperature,
    topP: runtime.topP,
    maxTokens: runtime.maxTokens,
    repetitionPenaltySent: false,
  };
}

// Each request waits for resetChat, then sends only that request's messages.
export async function runSmolOnEngine(engine, plans, runtime, opts = {}) {
  const realGeneration = opts.realGeneration === true;
  const config = requestConfig(runtime);
  const rows = [];
  for (const plan of plans) {
    if (opts.shouldStop?.()) break;
    if (plan.asksModel !== true) throw new Error("missing model request for " + plan.id);
    const resetStarted = Date.now();
    let resetError = null;
    if (typeof engine.resetChat !== "function") resetError = "resetChat missing";
    else {
      try { await engine.resetChat(); }
      catch (err) { resetError = err && err.message ? err.message : String(err); }
    }
    const messages = plan.system
      ? [{ role: "system", content: plan.system }, { role: "user", content: plan.q }]
      : [{ role: "user", content: plan.q }];
    opts.onInvoke?.({ id: plan.id, messages });
    const started = Date.now();
    let reply = null;
    let error = null;
    let raw = "";
    try {
      reply = await engine.chat.completions.create({
        messages,
        temperature: runtime.temperature,
        top_p: runtime.topP,
        max_tokens: runtime.maxTokens,
      });
      raw = reply?.choices?.[0]?.message?.content ?? "";
    } catch (err) {
      error = err && err.message ? err.message : String(err);
    }
    const choice = reply?.choices?.[0] || null;
    const extra = reply?.usage?.extra || {};
    const row = {
      ...plan,
      messages,
      requestConfig: config,
      resetEvidence: { awaited: true, ok: resetError == null, error: resetError, ms: Date.now() - resetStarted },
      raw,
      modelInvoked: error == null,
      realGeneration,
      experimental: true,
      finishReason: choice?.finish_reason ?? null,
      usage: reply?.usage ? {
        prompt_tokens: reply.usage.prompt_tokens ?? null,
        completion_tokens: reply.usage.completion_tokens ?? null,
        total_tokens: reply.usage.total_tokens ?? null,
        time_to_first_token_s: extra.time_to_first_token_s ?? null,
        e2e_latency_s: extra.e2e_latency_s ?? null,
      } : null,
      clientMs: Date.now() - started,
      error,
    };
    row.diagnosis = diagnoseGeneration(row, opts.hotel);
    rows.push(row);
  }
  return { realGeneration, privacyClaim: "unverified", rows };
}

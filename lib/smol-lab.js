// Isolated SmolLM2 phone trial. Facts routing stays in factpack.js. This file only
// plans the comparison and grades a model transcript. A facts answer is never a model completion.
import { decideTurn, retrieveFacts, buildPrompt } from "./factpack.js";

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

export function smolLabEnabled() {
  return process.env.SMOLLM_PHONE_LAB === "1";
}

export function planSmol(hotel, question) {
  const spec = SMOL_QUESTIONS.find((row) => row.q === question);
  const turn = decideTurn(hotel, question, { now: new Date("2026-11-08T16:00:00Z") });
  const facts = turn.path === "model" ? turn.facts : retrieveFacts(hotel, question);
  let system = buildPrompt(hotel, facts);
  if (turn.kind === "emergency" || turn.intent === "emergency") {
    system += "\nIf the guest may be in danger, the first sentence must tell them to call 911.";
  }
  return {
    id: spec?.id || "custom",
    kind: spec?.kind || turn.kind || turn.path,
    q: question,
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

// modelCalled is true only after the engine returned text. A facts row never counts.
export function gradeSmolTrial(row) {
  const raw = typeof row.raw === "string" ? row.raw : "";
  const modelCompletion = row.modelCalled === true && raw.trim().length > 0;
  const factsText = String(row.factsText || "");
  const question = String(row.q || "");
  const inventedNoon = modelCompletion && /\bnoon\b/i.test(raw) && !/\bnoon\b/i.test(factsText) && !/\bnoon\b/i.test(question);
  const emergencyOmission = row.kind === "emergency" && modelCompletion && !/\b911\b/.test(raw);
  const inventedPrice = modelCompletion && /\$\s?\d/.test(raw) && !/\$\s?\d/.test(factsText) && !/\$\s?\d/.test(question);
  return {
    modelCompletion,
    factsOnly: row.modelCalled !== true,
    countsAsModelSuccess: modelCompletion,
    inventedNoon,
    emergencyOmission,
    inventedPrice,
  };
}

export function guestLine(plan, judged) {
  if (plan.factsIntent === "emergency" || plan.kind === "emergency") {
    return { source: "facts", text: plan.factsText, note: "Emergency stays on the facts line. Raw model text is not the guest reply." };
  }
  if (plan.factsPath === "facts") {
    return { source: "facts", text: plan.factsText, note: "Facts baseline. Not a model answer." };
  }
  if (!judged) return { source: "not-run", text: "", note: "Model has not run." };
  return {
    source: judged.source,
    text: judged.finalText,
    note: judged.ok ? "Guard accepted the model text." : "Guard replaced the model text.",
  };
}

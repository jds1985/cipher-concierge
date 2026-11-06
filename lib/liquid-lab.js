// Isolated browser-lab planner. Facts and emergencies stay deterministic.
// The language model is only asked the leftover general clause, on the guest device.
import { route, retrieveFacts, guardAnswer, trimAnswer } from "./factpack.js";
import { normalize, HOTEL_SPECIFIC } from "./intents.js";

export const LIQUID_EXPERIMENT_ENV = "LIQUID_BROWSER_EXPERIMENT";

// Pinned from the Hugging Face API on 2026-11-06. Weights are not committed.
export const LIQUID_MODEL = {
  repo: "LiquidAI/LFM2.5-350M-ONNX",
  revision: "d11593fd9eb408e322667926656598896c2d5ff9",
  id: "LiquidAI/LFM2.5-350M-ONNX",
  localPath: "/lab/models/",
  license: "LFM Open License v1.0",
  licenseName: "lfm1.0",
  architecture: "Lfm2ForCausalLM",
  transformers: "4.3.2",
  // Liquid's card lists Q4 at about 276 MB. The ~250 MB file is q4f16.
  variants: {
    q4f16: { onnxBytes: 182827, dataBytes: 254965760 },
    q4: { onnxBytes: 183442, dataBytes: 293629952 },
  },
  generation: { temperature: 0.1, top_k: 50, repetition_penalty: 1.05, max_new_tokens: 64 },
};

export function liquidExperimentEnabled(env = process.env) {
  return env[LIQUID_EXPERIMENT_ENV] === "1";
}

export function splitClauses(question) {
  const raw = String(question || "").trim();
  const parts = raw.split(/\s+and\s+/i).map((s) => s.trim()).filter((s) => s.length > 2);
  return parts.length > 1 ? parts : [raw];
}

function knownAnswer(r, parts) {
  return {
    needsModel: false,
    modelQuestion: null,
    facts: [],
    preamble: "",
    source: r.source,
    intent: r.intent,
    kind: r.kind,
    call: !!r.call,
    text: r.text,
    parts,
  };
}

function openAnswer(modelQuestion, facts, preamble, intent, parts) {
  return {
    needsModel: true,
    modelQuestion,
    facts,
    preamble,
    source: "liquid",
    intent,
    kind: "liquid",
    call: false,
    text: "",
    parts,
  };
}

// Emergency on any clause wins and the model is not called.
// Several fact clauses are joined verbatim. Only the unmatched remainder is generated.
export function labPlan(hotel, question, now = new Date()) {
  const q = String(question || "").trim();
  const full = route(hotel, q, { now, openQuestions: true });
  if (full.kind === "emergency" || full.intent === "emergency") return knownAnswer(full, [{ q, ...full }]);
  const clauses = splitClauses(q);
  if (clauses.length < 2) {
    if (!full.needsModel) return knownAnswer(full, [{ q, ...full }]);
    return openAnswer(q, full.facts, "", "open", [{ q, ...full }]);
  }
  const parts = clauses.map((c) => ({ q: c, ...route(hotel, c, { now, openQuestions: true }) }));
  const emergency = parts.find((p) => p.kind === "emergency" || p.intent === "emergency");
  if (emergency) return knownAnswer(emergency, parts);
  const known = parts.filter((p) => !p.needsModel);
  const open = parts.filter((p) => p.needsModel);
  if (!open.length) {
    return {
      needsModel: false,
      modelQuestion: null,
      facts: [],
      preamble: "",
      source: "facts",
      intent: "multi",
      kind: known.some((p) => p.kind === "fallback") ? "fallback" : "fact",
      call: known.some((p) => p.call),
      text: known.map((p) => p.text).join("\n\n"),
      parts,
    };
  }
  const modelQuestion = open.map((p) => p.q).join(". ");
  return openAnswer(modelQuestion, retrieveFacts(hotel, modelQuestion), known.map((p) => p.text).join("\n\n"), known.length ? "multi_open" : "open", parts);
}

export function liquidPrompt(hotel, facts) {
  const lines = facts?.length ? facts.map((f) => "- " + f.text) : ["- (none on file)"];
  return [
    `You are Cipher, the in-room concierge at ${hotel.name} in ${hotel.location.city}.`,
    "Reply in one or two short plain sentences.",
    "For this hotel, use only the facts below. If a time, price, password, policy, or amenity is not listed, say it is not on file. Never invent a spa, pool, shuttle, laundry room, password, or price.",
    "For a general question (weather plans, packing, a joke, a translation), answer directly. Do not tell the guest to call the front desk for those.",
    "Do not say you are an AI or a language model.",
    "Facts:",
    ...lines,
  ].join("\n");
}

const AMENITY = /\b(spa|sauna|steam room|pool|hot tub|jacuzzi|shuttle|laundry room|minibar|room service)\b/gi;
const GENERAL = /\b(joke|pack|hike|hiking|rain|raining|umbrella|spanish|translate|fun fact|bored)\b/i;

export function isGeneralQuestion(question) {
  const q = String(question || "");
  return GENERAL.test(q) && !HOTEL_SPECIFIC.test(normalize(q));
}

export function mentionsDesk(text) {
  return /front desk/i.test(String(text || ""));
}

function blob(facts, question, hotelName) {
  return `${(facts || []).map((f) => f.text).join(" ")} ${question} ${hotelName}`.toLowerCase();
}

export function withholdText() {
  return "I won't guess about the hotel. I can still answer checkout, Wi-Fi, dining, and the other details on file.";
}

// Keep hotel claims on the fact sheet. A harmless general answer may stand without naming the front desk.
export function reviewLiquid(raw, facts, question, hotelName) {
  const original = String(raw || "").trim();
  let text = trimAnswer(original);
  if (!text) text = original.split("\n").map((s) => s.trim()).filter(Boolean)[0] || "";
  text = text.replace(/^["']+|["']+$/g, "").trim();
  if (text.length > 420) text = text.slice(0, 420).replace(/\s+\S*$/, "").trim();
  const known = blob(facts, question, hotelName);
  const invented = [...text.matchAll(AMENITY)].map((m) => m[0].toLowerCase()).filter((w) => !known.includes(w));
  if (invented.length) return { ok: false, reason: "invented-amenity", text, raw: original, invented };
  if (/\bpassword\s*(is|:)\s*\S+/i.test(text) && !/no password/i.test(text)) {
    const secret = (facts || []).some((f) => /password:\s*\S+/i.test(f.text) && !/no password/i.test(f.text));
    if (!secret) return { ok: false, reason: "invented-password", text, raw: original };
  }
  const g = guardAnswer(text, facts || [], question, hotelName);
  if (g.ok) return { ok: true, reason: "guard", text, raw: original };
  const general = isGeneralQuestion(question);
  if (general && g.reason === "unverified-name") {
    const venue = (text.match(/\b[A-Z][a-zA-Z'’-]+/g) || []).some((w) => /hotel|spa|pool|lounge|grill|cafe|bistro/i.test(w) && !known.includes(w.toLowerCase()));
    if (!venue && text.length >= 8) return { ok: true, reason: "general-name", text, raw: original };
  }
  const hard = new Set(["empty", "unverified-number", "wrong-hotel-name", "meta", "unverified-name", "unverified-claim", "repetitive", "invented-amenity", "invented-password"]);
  if (general && !hard.has(g.reason) && text.length >= 8) return { ok: true, reason: "general-" + g.reason, text, raw: original };
  return { ok: false, reason: g.reason || "rejected", text, raw: original };
}

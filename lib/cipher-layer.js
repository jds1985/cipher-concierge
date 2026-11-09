// Correction layer for the Cipher 2.0 135M stand-in. It does not change /stay or the production guard.
import { decideTurn, factLines, buildPrompt } from "./factpack.js";

export const CIPHER_2_STANDIN = {
  displayName: "Cipher 2.0 (135M stand-in)",
  id: "cipher-135m-sft",
  file: "sft.ctern",
  bytes: 73231828,
  sha256: "4f97a2162fd96b899c4bb0398cc288239f2b1963627dca5fcbe1afc02dd51e55",
  provenance: "Cipher_bot docs/BASELINE.md on branch cipher-runtime names this file cipher-135m-sft and Cipher 2.0 (135M stand-in). The concierge release model-sft-135m uses the same size and sha256. It is not cipher2m_concierge_targeted.ctern.",
};

export const CORRECTION_VERSION = 1;

const NUM = /\d+(?::\d+)?(?:\s?(?:AM|PM|am|pm))?/g;

export function emptyCorrections(hotelId) {
  return { version: CORRECTION_VERSION, hotelId, trusted: "vetted-file", corrections: [] };
}

export function approveCorrection(file, entry) {
  if (!entry || entry.source === "guest") throw new Error("Guest statements are not approved corrections.");
  if (!entry.hotelId || !entry.topic || !entry.text || !entry.id) throw new Error("A correction needs an id, hotel, topic, and text.");
  const next = { ...file, corrections: file.corrections.filter((item) => item.id !== entry.id) };
  next.corrections.push({ id: entry.id, hotelId: entry.hotelId, topic: entry.topic, text: entry.text, approved: true, source: "vetted" });
  return next;
}

export function resetCorrections(file) {
  return emptyCorrections(file.hotelId);
}

export function exportCorrections(file) {
  return JSON.stringify(file, null, 2);
}

function sentences(raw) {
  return String(raw || "").split(/\n+|(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
}

function askedTopics(question) {
  const q = String(question || "").toLowerCase();
  const topics = [];
  if (/\b(wi-?fi|wireless|network)\b/.test(q)) topics.push("wifi");
  if (/\b(check-?out|leave|be gone)\b/.test(q)) topics.push("checkout");
  if (/\b(pets|animals|dogs|cats)\b/.test(q)) topics.push("pets");
  return topics;
}

export function findMissing(hotel, question, raw) {
  const turn = decideTurn(hotel, question, { now: new Date("2026-11-08T16:00:00Z") });
  if (turn.path === "model") return [];
  const facts = factLines(hotel);
  const text = String(raw || "");
  const out = [];
  for (const topic of askedTopics(question)) {
    if (topic === "wifi") {
      const line = facts.find((fact) => /wifi/.test(fact.topic));
      const name = line && (line.text.match(/Wi-Fi network: ([^.]+)/) || [])[1];
      if (name && !text.includes(name)) out.push({ id: "missing-fact", detail: "The question asks for the wireless network. The model text does not include " + name + "." });
    }
    if (topic === "checkout") {
      const line = facts.find((fact) => /check out/.test(fact.topic));
      const time = line && (line.text.match(/Check-out is at ([^.]+)/) || [])[1];
      if (time && !text.includes(time)) out.push({ id: "missing-fact", detail: "The question asks when the guest leaves. The model text does not include " + time + "." });
    }
    if (topic === "pets") {
      const line = facts.find((fact) => /pets/.test(fact.topic));
      if (line && /not permitted|not allowed/i.test(line.text) && !/\b(not permitted|not allowed|no pets|cannot|can't)\b/i.test(text)) {
        out.push({ id: "missing-fact", detail: "The question asks about pets. The model text does not say they are not permitted." });
      }
    }
  }
  return out;
}

export function findContradictions(hotel, raw) {
  const facts = factLines(hotel);
  const sheet = facts.map((fact) => fact.text).join(" ").toLowerCase();
  const out = [];
  for (const sentence of sentences(raw)) {
    const aboutWifi = /\b(wi-?fi|wireless|network)\b/i.test(sentence);
    for (const number of sentence.match(NUM) || []) {
      const owners = facts.filter((fact) => fact.text.includes(number));
      const checkin = owners.some((fact) => /check in/.test(fact.topic));
      const wifi = owners.some((fact) => /wifi/.test(fact.topic));
      if (aboutWifi && checkin && !wifi) {
        out.push({ id: "time-bound-to-wrong-fact", detail: number + " belongs to check-in in the trusted facts. This sentence uses it for the wireless network." });
      }
    }
  }
  const pets = facts.find((fact) => /pets/.test(fact.topic));
  if (pets && /not permitted|not allowed/i.test(pets.text)) {
    const aboutPets = /\b(pets|animals|dogs|cats)\b/i.test(raw);
    const allows = /\b(permitted|allowed|can stay|yes)\b/i.test(raw);
    const denies = /\b(not permitted|not allowed|no pets|cannot|can't)\b/i.test(raw);
    if (aboutPets && allows && !denies) out.push({ id: "pets-polarity", detail: "Trusted facts say pets are not permitted. The model text allows them." });
  }
  const offer = String(raw).match(/\boffers (?:a |an )?([a-z][a-z -]{2,40})/i);
  if (offer) {
    const name = offer[1].split(/[.,]/)[0].trim().toLowerCase();
    if (name && !sheet.includes(name)) out.push({ id: "invented-amenity", detail: "The model says the hotel offers " + name + ", which is not in the trusted facts." });
  }
  if (/\b(I(?:'ll| will)|I am going to)\b/i.test(raw) && /\b(get you|take you|call|alert|send|contact|notify|bring)\b/i.test(raw)) {
    out.push({ id: "action-promise", detail: "The model promises an action. That promise is not accepted." });
  }
  return out;
}

function approvedFor(hotelId, question, file) {
  const q = String(question || "").toLowerCase();
  return (file?.corrections || []).filter((item) => item.approved && item.hotelId === hotelId && item.topic && q.includes(String(item.topic).toLowerCase()));
}

export function groundingSystem(hotel, question, corrections) {
  const base = buildPrompt(hotel, factLines(hotel));
  const extra = approvedFor(hotel.id, question, corrections);
  if (!extra.length) return base;
  return base + "\nApproved corrections:\n" + extra.map((item) => "- " + item.text).join("\n");
}

export function resolveTurn({ hotel, question, raw, corrections }) {
  const turn = decideTurn(hotel, question, { now: new Date("2026-11-08T16:00:00Z") });
  const preserved = String(raw || "");
  if (turn.intent === "emergency") {
    return {
      raw: preserved,
      contradictions: [],
      resolution: { source: "safety", label: "Deterministic safety. Not the model.", text: String(turn.text || "").replaceAll("**", "") },
    };
  }
  const contradictions = [...findContradictions(hotel, preserved), ...findMissing(hotel, question, preserved)];
  const approved = approvedFor(hotel.id, question, corrections)[0] || null;
  if (contradictions.length && approved) {
    return { raw: preserved, contradictions, resolution: { source: "approved-correction", label: "Approved correction. Not the model.", text: approved.text } };
  }
  if (contradictions.length) {
    return { raw: preserved, contradictions, resolution: { source: "withheld", label: "Withheld. Not a front-desk script.", text: contradictions.map((item) => item.detail).join(" ") } };
  }
  return { raw: preserved, contradictions, resolution: { source: "model", label: "Model text.", text: preserved } };
}

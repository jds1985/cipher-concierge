// Browser-safe shared engine pieces (no fs, no crypto): used by the server (/api/chat) AND the on-phone guest page.
import { matchIntent, HOTEL_SPECIFIC, normalize } from "./intents.js";

// Flatten a hotel into short fact lines for retrieval into Cipher's prompt.
export function factLines(h) {
  const L = [];
  const push = (topic, text) => text && L.push({ topic, text });
  push("hotel name location", `${h.name} is on ${h.location.area} in ${h.location.city}.`);
  push("front desk phone call", `Front desk: ${h.frontDesk.inRoom}${h.frontDesk.phoneTel ? ` or call ${h.frontDesk.phoneDisplay}` : ""}.`);
  push("check in arrival", `Check-in is at ${h.checkIn.time}.`);
  push("check out checkout leave", `Check-out is at ${h.checkOut.time}.`);
  if (h.checkOut.late) push("late checkout", h.checkOut.late);
  push("wifi internet network password", `Wi-Fi network: ${h.wifi.network}.${h.wifi.password ? ` Password: ${h.wifi.password}.` : ""} ${h.wifi.notes || ""}`.trim());
  for (const d of h.dining) {
    const meals = Object.entries(d.meals || {}).map(([k, v]) => `${k} ${v}`).join(", ");
    push(`dining food eat restaurant bar drink evening night dinner date romantic relax rainy indoor cocktail ${Object.keys(d.meals || {}).join(" ")}`,
      `${d.name} (${d.type})${d.location ? `, ${d.location}` : ""}${meals ? `: ${meals}` : ""}${d.hours ? `: ${d.hours}` : ""}.`);
  }
  if (h.amenities?.length) push("amenities hotel offer facilities things do relax indoor rainy", `${h.name} offers: ${h.amenities.join("; ")}.`);
  push("parking car valet garage", h.parking);
  push("gym fitness workout exercise", h.fitness);
  push("pool swim", h.pool);
  push("housekeeping towels cleaning", h.housekeeping);
  push("pets dog cat", h.pets);
  push("smoking smoke vape", h.smoking);
  push("quiet hours noise", h.quietHours && `Quiet hours are ${h.quietHours}.`);
  for (const r of h.localRecommendations || [])
    push("nearby local recommend restaurant food walk", `${r.name} (${r.distance}): ${r.description}${r.hours ? ` ${r.hours}.` : ""}`);
  return L;
}

const STOP = new Set("a an the is are was do does did i me my you your we our it of to in on at for and or what when where how can could would will there this that with please any hotel".split(" "));
const words = (s) => String(s).toLowerCase().match(/[a-z0-9]+/g)?.filter((w) => !STOP.has(w) && w.length > 1) || [];

const clip = (t, n = 160) => (t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : t);

// Compact, relevant context for Cipher. Keyword-matched facts first; open questions rarely share words with the
// fact sheet (e.g. "rainy afternoon"), so pad with the hotel's own on-site options instead of sending nothing.
export function retrieveFacts(hotel, question, k = 5) {
  const q = new Set(words(question));
  const all = factLines(hotel).map((f) => ({ ...f, score: words(f.topic + " " + f.text).filter((w) => q.has(w)).length }));
  const picked = all.filter((f) => f.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
  const pad = ["hotel name location", "amenities", "dining"];
  for (const f of all) if (picked.length < k && !picked.includes(f) && pad.some((p) => f.topic.startsWith(p))) picked.push({ ...f, score: 0 });
  return picked.map((f) => ({ ...f, text: clip(f.text) }));
}

export function buildPrompt(hotel, facts) {
  return `You are Cipher, concierge at ${hotel.name}, ${hotel.location.city}. Reply in one or two short, plain sentences. Suggest only places and services named in the facts. Never make up names, times or prices. No poems, stories or lists. If unsure, say the front desk can help.
Facts:
${facts.map((f) => "- " + f.text).join("\n") || "- (none)"}`;
}

// Generation settings shared by the phone (WASM) and server (cipher-serve) paths.
export const GEN = { maxNew: 64, temp: 0.3, rep: 1.15, stops: ["\n\n", "\n1.", "\n-", "\n*", "User:", "Guest:"] };

// Cut at the first stop sequence and keep at most two sentences.
export function trimAnswer(text) {
  let t = String(text || "");
  for (const s of GEN.stops) { const i = t.indexOf(s); if (i >= 0) t = t.slice(0, i); }
  t = t.trim();
  const sents = t.match(/[^.!?]+[.!?]+(\s|$)/g);
  if (sents && sents.length > 2) t = sents.slice(0, 2).join("").trim();
  return t;
}

const ALLOWED_CAPS = new Set("I It's Here's There's That's You'll You're I'm I'd I'll I've You Your We Our The A An It If For On In At And But Or So Yes No Absolutely Sure Enjoy Try Head Ask Please Hello Hi Of Here There This That Feel Check Call TN Tennessee Smokies Great Smoky Mountains".split(" "));
const POEM = /\b(poem|poetry|verse|stanza|once upon|story|tale|symphony|tapestry|melody|whisper\w*|dance[sd]?)\b/i;

// Reject answers that state numbers (times, prices, room numbers) not present in the facts or the question.
export function guardAnswer(answer, facts, question, hotelName = "") {
  const a = (answer || "").trim();
  if (a.length < 12) return { ok: false, reason: "empty" };
  // Numbers must appear verbatim (with any :minutes / unit) in the facts or the question.
  const NUM = /\d+(?::\d+)?(?:\s?(?:AM|PM|am|pm|°\w?|%|-minute))?/g;
  const allowed = new Set(((facts.map((f) => f.text).join(" ") + " " + question).match(NUM)) || []);
  const bad = (a.match(NUM) || []).filter((n) => !allowed.has(n));
  if (bad.length) return { ok: false, reason: "unverified-number" };
  const w = a.toLowerCase().split(/\s+/), seen = new Map();
  for (let i = 0; i + 3 < w.length; i++) { const g = w.slice(i, i + 4).join(" "); seen.set(g, (seen.get(g) || 0) + 1); if (seen.get(g) >= 3) return { ok: false, reason: "repetitive" }; }
  for (const m of a.match(/\b(?:The )?(?:[A-Z][a-z]+ )+Hotel\b/g) || []) if (hotelName && !hotelName.includes(m.replace(/^The /, ""))) return { ok: false, reason: "wrong-hotel-name" };
  if (/\b(as an ai|language model|i cannot browse)\b/i.test(a)) return { ok: false, reason: "meta" };
  // Concierge shape: short, prose, no lists/poems/stories.
  if (a.split(/\s+/).length > 60) return { ok: false, reason: "too-long" };
  if (/\n/.test(a) || /^\s*(\d+\.|[-*•])\s/m.test(a)) return { ok: false, reason: "not-prose" };
  if (POEM.test(a) && !POEM.test(question)) return { ok: false, reason: "off-topic-style" };
  // Never invent names: capitalized words must come from the facts, the question, or a small safe list.
  const known = (facts.map((f) => f.text).join(" ") + " " + question + " " + hotelName).toLowerCase();
  const names = (a.match(/\b[A-Z][a-zA-Z'’-]+/g) || []).filter((w) => !ALLOWED_CAPS.has(w) && !known.includes(w.toLowerCase()));
  if (names.length) return { ok: false, reason: "unverified-name" };
  // Claims about location, distance, price or perks must be on the fact sheet.
  const claims = (a.toLowerCase().match(/\b(outskirts|downtown|located|miles?|km|blocks?|minutes? away|free|complimentary|included|cheap|expensive|famous|award\w*|rooftop|spa|pool|shuttle|view)\b/g) || []).filter((c) => !known.includes(c));
  if (claims.length) return { ok: false, reason: "unverified-claim" };
  // Must stay on topic: share at least one content word with the question or the facts.
  const ctx = new Set(words(known));
  if (!words(a).some((w) => ctx.has(w))) return { ok: false, reason: "off-topic" };
  if (/:\s*$/.test(a)) return { ok: false, reason: "unfinished" };
  // Grounded: point the guest at something on the fact sheet (a named place/service, a listed time) or the front desk.
  // Mentioning only the hotel name is not enough (that is how generic filler slips through).
  const factNames = new Set((facts.map((f) => f.text).join(" ").match(/\b[A-Z][a-zA-Z'’-]{2,}/g) || []).filter((w) => !ALLOWED_CAPS.has(w) && !hotelName.includes(w) && !question.includes(w) && !/^(Knoxville|Nashville|Memphis|Chattanooga)$/.test(w)));
  if (!/front desk/i.test(a) && !(a.match(NUM) || []).length && ![...factNames].some((w) => a.includes(w))) return { ok: false, reason: "ungrounded" };
  return { ok: true };
}


export const deskLine = (h) => `${h.frontDesk.inRoom}${h.frontDesk.phoneTel ? `, or call **${h.frontDesk.phoneDisplay}**` : ""}`;
export const connect = (h, extra = "") => ({ kind: "fallback", call: true, text: `${extra}Let me connect you to the front desk. They can help with that: ${deskLine(h)}.` });

// Deterministic first step shared by server and phone. Returns a final answer, or { needsModel, facts } for an open question.
export function route(hotel, q, { now, openQuestions = true } = {}) {
  const hit = matchIntent(hotel, q, now);
  if (hit) return { source: "facts", ...hit };
  if (HOTEL_SPECIFIC.test(normalize(q))) return { source: "facts", intent: "unknown_hotel_question", ...connect(hotel, "I don't have that on file and I'd rather not guess. ") };
  if (!openQuestions) return { source: "cipher-fallback", intent: "cipher_disabled", ...connect(hotel, "I'm not certain about that. ") };
  return { needsModel: true, facts: retrieveFacts(hotel, q) };
}

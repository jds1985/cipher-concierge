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
    push(`dining food eat restaurant bar drink ${Object.keys(d.meals || {}).join(" ")}`,
      `${d.name} (${d.type})${d.location ? `, ${d.location}` : ""}${meals ? `: ${meals}` : ""}${d.hours ? `: ${d.hours}` : ""}.`);
  }
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

export function retrieveFacts(hotel, question, k = 4) {
  const q = new Set(words(question));
  return factLines(hotel)
    .map((f) => ({ ...f, score: words(f.topic + " " + f.text).filter((w) => q.has(w)).length }))
    .filter((f) => f.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
}

export function buildPrompt(hotel, facts) {
  return `You are Cipher, the private concierge for ${hotel.name} in ${hotel.location.city}. Be warm and brief (2-3 sentences). Use only these hotel facts; if they do not answer the question, say the front desk can help.
Facts:
${facts.map((f) => "- " + f.text).join("\n") || "- (none relevant)"}`;
}

// Reject answers that state numbers (times, prices, room numbers) not present in the facts or the question.
export function guardAnswer(answer, facts, question, hotelName = "") {
  const a = (answer || "").trim();
  if (a.length < 12) return { ok: false, reason: "empty" };
  const allowed = new Set(((facts.map((f) => f.text).join(" ") + " " + question).match(/\d+/g)) || []);
  const bad = (a.match(/\d+/g) || []).filter((n) => !allowed.has(n));
  if (bad.length) return { ok: false, reason: "unverified-number" };
  const w = a.toLowerCase().split(/\s+/), seen = new Map();
  for (let i = 0; i + 3 < w.length; i++) { const g = w.slice(i, i + 4).join(" "); seen.set(g, (seen.get(g) || 0) + 1); if (seen.get(g) >= 3) return { ok: false, reason: "repetitive" }; }
  for (const m of a.match(/\b(?:The )?(?:[A-Z][a-z]+ )+Hotel\b/g) || []) if (hotelName && !hotelName.includes(m.replace(/^The /, ""))) return { ok: false, reason: "wrong-hotel-name" };
  if (/\b(as an ai|language model|i cannot browse)\b/i.test(a)) return { ok: false, reason: "meta" };
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

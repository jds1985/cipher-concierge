// Cipher 2.0 path (cipher-serve, OpenAI-compatible, local). Used only when no deterministic intent matched.
import { factLines } from "./hotels.js";
import { createSSEParser, tokenFromData } from "./sse.js";

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

export async function askCipher(hotel, history, { url = process.env.CIPHER_URL || "http://127.0.0.1:8899/v1/chat/completions", model = process.env.CIPHER_MODEL || "cipher-2.0", timeoutMs = 45000 } = {}) {
  const question = history[history.length - 1].content;
  const facts = retrieveFacts(hotel, question);
  const messages = [{ role: "system", content: buildPrompt(hotel, facts) }, ...history.slice(-3)];
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let text = "";
  try {
    const r = await fetch(url, {
      method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: true, max_tokens: 120, temperature: 0.3 }),
    });
    if (!r.ok || !r.body) return { ok: false, reason: "upstream", facts };
    const dec = new TextDecoder();
    const p = createSSEParser((d) => { text += tokenFromData(d); });
    for await (const chunk of r.body) p.push(dec.decode(chunk, { stream: true }));
    p.end();
  } catch { return { ok: false, reason: "unreachable", facts }; } finally { clearTimeout(timer); }
  const g = guardAnswer(text, facts, question, hotel.name);
  return { ok: g.ok, reason: g.reason, text: text.trim(), facts };
}

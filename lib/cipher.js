// Cipher 2.0 path (cipher-serve, OpenAI-compatible, local). Used only when no deterministic intent matched.
import { retrieveFacts, buildPrompt, guardAnswer } from "./factpack.js";
export { retrieveFacts, buildPrompt, guardAnswer };
import { createSSEParser, tokenFromData } from "./sse.js";

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

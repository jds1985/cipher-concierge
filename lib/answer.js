import { matchIntent, HOTEL_SPECIFIC, normalize } from "./intents.js";
import { askCipher } from "./cipher.js";

export const deskLine = (h) => `${h.frontDesk.inRoom}${h.frontDesk.phoneTel ? `, or call **${h.frontDesk.phoneDisplay}**` : ""}`;
export const connect = (h, extra = "") => ({ kind: "fallback", call: true, text: `${extra}Let me connect you to the front desk. They can help with that: ${deskLine(h)}.` });

// Facts first; Cipher only for open questions; front-desk fallback when unsure.
export async function answer(hotel, messages, opts = {}) {
  const q = messages[messages.length - 1].content;
  const hit = matchIntent(hotel, q, opts.now);
  if (hit) return { source: "facts", ...hit };
  if (HOTEL_SPECIFIC.test(normalize(q))) return { source: "facts", intent: "unknown_hotel_question", ...connect(hotel, "I don't have that on file and I'd rather not guess. ") };
  // CIPHER_OPEN_QUESTIONS=off routes every non-fact question to the front desk (recommended until the 369M model is in).
  if (process.env.CIPHER_OPEN_QUESTIONS === "off") return { source: "cipher-fallback", intent: "cipher_disabled", ...connect(hotel, "I'm not certain about that. ") };
  const c = await (opts.askCipher || askCipher)(hotel, messages);
  if (c.ok) return { source: "cipher", intent: "cipher", kind: "cipher", call: false, text: c.text };
  return { source: "cipher-fallback", intent: "cipher_" + c.reason, ...connect(hotel, "I'm not certain about that. ") };
}

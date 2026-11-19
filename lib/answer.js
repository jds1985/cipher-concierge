import { askCipher } from "./cipher.js";
import { route, connect, deskLine } from "./factpack.js";
import { cipherLayerGuestEnabled, guestLayerReply } from "./guest-facts.js";
export { connect, deskLine };

// Facts first; Cipher only for open questions; front-desk fallback when unsure.
// CIPHER_OPEN_QUESTIONS=off routes every non-fact question to the front desk.
// The guest fact layer runs only when the preview flag is on, and never in production.
export async function answer(hotel, messages, opts = {}) {
  const q = messages[messages.length - 1].content;
  if (cipherLayerGuestEnabled()) {
    const layered = guestLayerReply(hotel, q, "");
    if (layered) return { source: layered.source, intent: layered.intent, kind: layered.kind, call: layered.call, text: layered.content, asksDesk: !!layered.asksDesk };
  }
  const r = route(hotel, q, { now: opts.now, openQuestions: process.env.CIPHER_OPEN_QUESTIONS !== "off" });
  if (!r.needsModel) return r;
  // Hosted preview (no LAN cipher-serve): open questions go straight to the front desk.
  if (process.env.CIPHER_SERVER_MODEL === "off") return { source: "cipher-fallback", intent: "cipher_hosted", ...connect(hotel, "I'm not certain about that. ") };
  const c = await (opts.askCipher || askCipher)(hotel, messages);
  if (c.ok) return { source: "cipher", intent: "cipher", kind: "cipher", call: false, text: c.text };
  return { source: "cipher-fallback", intent: "cipher_" + c.reason, ...connect(hotel, "I'm not certain about that. ") };
}

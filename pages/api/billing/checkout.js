// POST /api/billing/checkout { rooms } — signed-in manager starts a 30-day-trial subscription.
import { sessionFromReq, sameOrigin } from "../../../lib/auth.js";
import { createCheckout, cleanRooms, billingConfigured, billingCheckoutAllowed } from "../../../lib/billing.js";
import { baseUrl } from "../../../lib/admin.js";
import { rateLimit } from "../../../lib/ratelimit.js";

export const config = { api: { bodyParser: { sizeLimit: "2kb" } } };
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!sameOrigin(req)) return res.status(403).json({ error: "Bad origin." });
  const s = await sessionFromReq(req);
  if (!s) return res.status(401).json({ error: "Please sign in again." });
  if (!billingConfigured()) return res.status(503).json({ error: "Billing is not set up yet. Please contact Cipher." });
  if (!billingCheckoutAllowed()) return res.status(403).json({ error: "Checkout opens December 11, 2026." });
  if (!rateLimit("co:" + s.hotelId, { limit: 10, windowMs: 10 * 60_000 }).ok) return res.status(429).json({ error: "Too many tries. Wait a few minutes." });
  const rooms = cleanRooms(req.body?.rooms);
  if (!rooms) return res.status(400).json({ error: "Enter how many guest rooms you have (1–2000)." });
  try {
    const url = await createCheckout({ hotelId: s.hotelId, email: s.email, rooms, baseUrl: baseUrl(req) });
    return res.status(200).json({ url });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    console.error("checkout failed", e?.type, e?.message);
    return res.status(502).json({ error: "Could not start checkout. Try again." });
  }
}

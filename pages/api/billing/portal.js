// POST /api/billing/portal — signed-in manager opens the Stripe customer portal (card, invoices, cancel).
import { sessionFromReq, sameOrigin } from "../../../lib/auth.js";
import { createPortal, billingConfigured } from "../../../lib/billing.js";
import { baseUrl } from "../../../lib/admin.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!sameOrigin(req)) return res.status(403).json({ error: "Bad origin." });
  const s = await sessionFromReq(req);
  if (!s) return res.status(401).json({ error: "Please sign in again." });
  if (!billingConfigured()) return res.status(503).json({ error: "Billing is not set up yet." });
  try {
    return res.status(200).json({ url: await createPortal({ hotelId: s.hotelId, baseUrl: baseUrl(req) }) });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    console.error("portal failed", e?.message);
    return res.status(502).json({ error: "Could not open billing. Try again." });
  }
}

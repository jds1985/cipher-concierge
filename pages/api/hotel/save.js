// POST /api/hotel/save { token?, ...form } (edit token or manager session cookie) — hotel manager saves facts; takes effect immediately.
import { getHotelByEditToken, saveHotel, stripSecrets } from "../../../lib/store.js";
import { sanitizeHotelForm } from "../../../lib/hotel-form.js";
import { rateLimit } from "../../../lib/ratelimit.js";
import { hotelForRequest, clientIp } from "../../../lib/auth.js";

export const config = { api: { bodyParser: { sizeLimit: "64kb" } } };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ip = clientIp(req);
  if (!rateLimit("hotel-save-ip:" + ip, { limit: 30, windowMs: 60 * 60_000 }).ok) {
    return res.status(429).json({ error: "Too many saves. Please wait and try again." });
  }
  const auth = await hotelForRequest(req, { getHotelByEditToken });
  if (!auth.hotel) return res.status(auth.status).json({ error: auth.error });
  if (!rateLimit("hotel-save-" + auth.rlId, { limit: 40, windowMs: 60 * 60_000 }).ok) {
    return res.status(429).json({ error: "Too many saves. Please wait and try again." });
  }
  const existing = auth.hotel;

  // Never allow editing a different hotel by spoofing id in the body
  const { ok, hotelPatch, errors } = sanitizeHotelForm(req.body);
  if (!ok) return res.status(400).json({ error: "Validation failed", errors });

  const merged = {
    ...existing,
    ...hotelPatch,
    id: existing.id, // immutable
    emergency: existing.emergency || "Dial 911 immediately, then let the front desk know.",
    _meta: {
      ...(existing._meta || {}),
      source: "self-setup",
      editKeyHash: existing._meta?.editKeyHash,
      managerEmail: existing._meta?.managerEmail,
      updatedAt: new Date().toISOString(),
    },
  };

  try {
    const saved = await saveHotel(merged);
    return res.status(200).json({ ok: true, hotel: stripSecrets(saved) });
  } catch {
    return res.status(500).json({ error: "Could not save. Please try again." });
  }
}

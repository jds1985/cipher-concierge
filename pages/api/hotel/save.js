// POST /api/hotel/save { token, ...form } — hotel manager saves facts; takes effect immediately.
import { getHotelByEditToken, saveHotel, stripSecrets } from "../../../lib/store";
import { sanitizeHotelForm } from "../../../lib/hotel-form";
import { rateLimit } from "../../../lib/ratelimit";
import { hashSecret } from "../../../lib/store";

export const config = { api: { bodyParser: { sizeLimit: "64kb" } } };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "?";
  const token = req.body?.token;
  if (typeof token !== "string") return res.status(403).json({ error: "Invalid edit link." });

  const tokHash = hashSecret(token).slice(0, 16);
  const rlIp = rateLimit("hotel-save-ip:" + ip, { limit: 30, windowMs: 60 * 60_000 });
  const rlTok = rateLimit("hotel-save-tok:" + tokHash, { limit: 40, windowMs: 60 * 60_000 });
  if (!rlIp.ok || !rlTok.ok) return res.status(429).json({ error: "Too many saves. Please wait and try again." });

  const existing = await getHotelByEditToken(token);
  if (!existing) return res.status(403).json({ error: "Invalid or expired edit link." });

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

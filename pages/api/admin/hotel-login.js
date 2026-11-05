// POST /api/admin/hotel-login { hotelId, email, password? } — owner sets/resets a hotel manager login.
// ADMIN_KEY via x-admin-key header. If password is blank, one is generated and returned ONCE.
import { adminOkReq } from "../../../lib/admin.js";
import { setHotelLogin, clientIp } from "../../../lib/auth.js";
import { rateLimit } from "../../../lib/ratelimit.js";

export const config = { api: { bodyParser: { sizeLimit: "4kb" } } };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!adminOkReq(req)) return res.status(401).json({ error: "Unauthorized" });
  if (!rateLimit("admin-login-set:" + clientIp(req), { limit: 30, windowMs: 60 * 60_000 }).ok) {
    return res.status(429).json({ error: "Too many requests." });
  }
  const hotelId = typeof req.body?.hotelId === "string" ? req.body.hotelId.trim() : "";
  if (!/^[a-z0-9-]{1,80}$/.test(hotelId)) return res.status(400).json({ error: "Valid hotelId required." });
  try {
    const r = await setHotelLogin({ hotelId, email: req.body?.email, password: req.body?.password || "" });
    return res.status(200).json({
      hotelId, email: r.email, password: r.password, generated: r.generated,
      message: "Give this email + password to the hotel manager. It is shown once; we store only a bcrypt hash. Re-run to reset (signs out old sessions).",
    });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.status ? e.message : "Could not set login." });
  }
}

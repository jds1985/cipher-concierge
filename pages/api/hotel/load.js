// POST /api/hotel/load { token? } — load this hotel's form data. Auth: edit token (backup) or manager session cookie.
import { getHotelByEditToken, stripSecrets } from "../../../lib/store.js";
import { rateLimit } from "../../../lib/ratelimit.js";
import { hotelForRequest, clientIp } from "../../../lib/auth.js";

export const config = { api: { bodyParser: { sizeLimit: "2kb" } } };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!rateLimit("hotel-load:" + clientIp(req), { limit: 60, windowMs: 60_000 }).ok) {
    return res.status(429).json({ error: "Too many requests." });
  }
  const r = await hotelForRequest(req, { getHotelByEditToken });
  if (!r.hotel) return res.status(r.status).json({ error: r.error });
  return res.status(200).json({ hotel: stripSecrets(r.hotel), via: r.via });
}

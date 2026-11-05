// POST /api/hotel/load { token } — load this hotel's form data for its private editor.
import { getHotelByEditToken, stripSecrets } from "../../../lib/store";
import { rateLimit } from "../../../lib/ratelimit";

export const config = { api: { bodyParser: { sizeLimit: "2kb" } } };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "?";
  if (!rateLimit("hotel-load:" + ip, { limit: 60, windowMs: 60_000 }).ok) {
    return res.status(429).json({ error: "Too many requests." });
  }
  const token = req.body?.token;
  const hotel = await getHotelByEditToken(token);
  if (!hotel) return res.status(403).json({ error: "Invalid or expired edit link." });
  return res.status(200).json({ hotel: stripSecrets(hotel) });
}

// POST /api/factpack { hotelId, roomId, t } -> the hotel's full fact sheet for on-phone answering.
// Signed room link required; rate limited. Downloaded once per fact version and cached on the phone.
import { getHotel, validRoom } from "../../lib/hotels";
import { verifyRoom } from "../../lib/token";
import { rateLimit } from "../../lib/ratelimit";

export const config = { api: { bodyParser: { sizeLimit: "2kb" } } };
export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "?";
  const { hotelId, roomId, t } = req.body || {};
  const hotel = getHotel(hotelId);
  if (!hotel || !validRoom(roomId)) return res.status(404).json({ error: "Unknown hotel or room" });
  if (!verifyRoom(hotelId, roomId, t)) return res.status(403).json({ error: "Please scan the QR code in your room to start." });
  if (!rateLimit("fp:" + ip, { limit: 10, windowMs: 60_000 }).ok) return res.status(429).json({ error: "Too many requests." });
  return res.status(200).json(hotel);
}

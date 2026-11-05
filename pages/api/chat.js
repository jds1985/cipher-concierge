// POST /api/chat  { hotelId, roomId, t, messages:[{role:"user"|"assistant",content}] }
// Nothing is stored or logged: no conversation content is written anywhere on the server.
import { getHotel, validRoom } from "../../lib/hotels";
import { verifyRoom } from "../../lib/token";
import { rateLimit } from "../../lib/ratelimit";
import { sanitizeMessages } from "../../lib/sanitize";
import { answer, connect } from "../../lib/answer";

export const config = { api: { bodyParser: { sizeLimit: "16kb" } } };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "?";
  const { hotelId, roomId, t, messages } = req.body || {};
  const hotel = getHotel(hotelId);
  if (!hotel || !validRoom(roomId)) return res.status(404).json({ error: "Unknown hotel or room" });
  if (!verifyRoom(hotelId, roomId, t)) return res.status(403).json({ error: "Please scan the QR code in your room to start." });
  const rl1 = rateLimit("ip:" + ip, { limit: 20, windowMs: 60_000 });
  const rl2 = rateLimit(`room:${hotelId}:${roomId}`, { limit: 30, windowMs: 60_000 });
  if (!rl1.ok || !rl2.ok) return res.status(429).json({ error: "Too many questions at once. Please wait a moment." });
  const clean = sanitizeMessages(messages);
  if (!clean) return res.status(400).json({ error: "Invalid message" });
  try {
    const a = await answer(hotel, clean);
    return res.status(200).json({ kind: a.kind, text: a.text, call: !!a.call, source: a.source, intent: a.intent });
  } catch {
    return res.status(200).json({ ...connect(hotel, "Something went wrong on my side. "), source: "error" });
  }
}

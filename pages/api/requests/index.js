// POST /api/requests  { hotelId, roomId, t, type, note? }  -> guest creates a request (room QR token required)
// GET  /api/requests?status=open                           -> signed-in manager lists their hotel's requests
// Only the explicit request is stored. No chat content.
import { resolveHotel, validRoom, isFileHotel } from "../../../lib/hotels.js";
import { guestAccess, PAUSED_MESSAGE } from "../../../lib/billing.js";
import { verifyRoom } from "../../../lib/token.js";
import { rateLimit } from "../../../lib/ratelimit.js";
import { sessionFromReq, clientIp } from "../../../lib/auth.js";
import { kvIncrWindow, storePrefix, hashSecret } from "../../../lib/store.js";
import { createRequest, listRequests, REQUEST_TYPES } from "../../../lib/requests.js";

export const config = { api: { bodyParser: { sizeLimit: "4kb" } } };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") {
    const s = await sessionFromReq(req);
    if (!s) return res.status(401).json({ error: "Please sign in again." });
    const status = ["open", "done"].includes(req.query?.status) ? req.query.status : undefined;
    return res.status(200).json({ requests: await listRequests(s.hotelId, { status }) });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { hotelId, roomId, t, type, note } = req.body || {};
  const hotel = await resolveHotel(hotelId);
  if (!hotel || !validRoom(roomId)) return res.status(404).json({ error: "Unknown hotel or room" });
  if (!verifyRoom(hotelId, roomId, t)) return res.status(403).json({ error: "Please scan the QR code in your room." });
  const access = await guestAccess(hotel.id, { isFile: isFileHotel(hotel.id) });
  if (!access.ok) return res.status(402).json({ error: PAUSED_MESSAGE, paused: true });
  if (!REQUEST_TYPES[type]) return res.status(400).json({ error: "Pick what you need." });
  const ip = clientIp(req);
  const rl1 = rateLimit("reqip:" + ip, { limit: 5, windowMs: 60_000 });
  const rl2 = rateLimit(`reqroom:${hotel.id}:${roomId}`, { limit: 3, windowMs: 60_000 });
  // Shared (Redis) per-room hourly cap so serverless instances can't be used to flood staff.
  const n = await kvIncrWindow(`${storePrefix()}rl:req:${hashSecret(hotel.id + "|" + roomId).slice(0, 24)}`, 3600);
  if (!rl1.ok || !rl2.ok || n > 12) return res.status(429).json({ error: "Too many requests. Please call the front desk." });
  const r = await createRequest({ hotelId: hotel.id, roomId, type, note });
  return res.status(200).json({ id: r.id, status: r.status });
}

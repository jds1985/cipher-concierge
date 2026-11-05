// POST /api/hotel/qr { token, rooms } — signed QR cards for THIS hotel only.
import QRCode from "qrcode";
import { getHotelByEditToken } from "../../../lib/store";
import { expandRooms } from "../../../lib/hotel-form";
import { roomUrl } from "../../../lib/token";
import { baseUrl } from "../../../lib/admin";
import { rateLimit } from "../../../lib/ratelimit";
import { hashSecret } from "../../../lib/store";

export const config = { api: { bodyParser: { sizeLimit: "4kb" } } };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "?";
  const token = req.body?.token;
  if (typeof token !== "string") return res.status(403).json({ error: "Invalid edit link." });
  const tokHash = hashSecret(token).slice(0, 16);
  if (!rateLimit("hotel-qr:" + tokHash, { limit: 30, windowMs: 60 * 60_000 }).ok ||
      !rateLimit("hotel-qr-ip:" + ip, { limit: 40, windowMs: 60 * 60_000 }).ok) {
    return res.status(429).json({ error: "Too many QR requests." });
  }

  const hotel = await getHotelByEditToken(token);
  if (!hotel) return res.status(403).json({ error: "Invalid or expired edit link." });

  const rooms = expandRooms(req.body?.rooms || "");
  if (!rooms.length) return res.status(400).json({ error: "Enter at least one room number or range (e.g. 301-310, 412)." });

  const base = baseUrl(req);
  const cards = await Promise.all(rooms.map(async (room) => {
    const url = roomUrl(base, hotel.id, room);
    const svg = await QRCode.toString(url, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 1,
      color: { dark: "#060b1aff", light: "#ffffffff" },
    });
    return { room, url, svg };
  }));

  return res.status(200).json({ hotelId: hotel.id, name: hotel.name, cards });
}

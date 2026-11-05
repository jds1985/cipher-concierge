// POST /api/hotel/qr { token?, rooms } (edit token or manager session cookie) — signed QR cards for THIS hotel only.
import QRCode from "qrcode";
import { getHotelByEditToken } from "../../../lib/store.js";
import { expandRooms } from "../../../lib/hotel-form.js";
import { roomUrl } from "../../../lib/token.js";
import { baseUrl } from "../../../lib/admin.js";
import { rateLimit } from "../../../lib/ratelimit.js";
import { hotelForRequest, clientIp } from "../../../lib/auth.js";
import { guestAccess } from "../../../lib/billing.js";

export const config = { api: { bodyParser: { sizeLimit: "4kb" } } };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ip = clientIp(req);
  if (!rateLimit("hotel-qr-ip:" + ip, { limit: 40, windowMs: 60 * 60_000 }).ok) {
    return res.status(429).json({ error: "Too many QR requests." });
  }
  const auth = await hotelForRequest(req, { getHotelByEditToken });
  if (!auth.hotel) return res.status(auth.status).json({ error: auth.error });
  if (!rateLimit("hotel-qr-" + auth.rlId, { limit: 30, windowMs: 60 * 60_000 }).ok) {
    return res.status(429).json({ error: "Too many QR requests." });
  }
  const hotel = auth.hotel;
  const access = await guestAccess(hotel.id);
  if (!access.ok) return res.status(402).json({ error: "Your trial or subscription has ended. Open Billing to update your card, then print QR cards again." });

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

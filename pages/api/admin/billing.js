// POST /api/admin/billing — owner (ADMIN_KEY) billing tools.
//   { action: "list" } | { action: "founding", hotelId, founding } | { action: "rooms", hotelId, rooms } | { action: "comp", hotelId, comp }
import { adminOkReq } from "../../../lib/admin.js";
import { listAllHotels } from "../../../lib/hotels.js";
import { getStoredHotel } from "../../../lib/store.js";
import { getBilling, setBilling, ownerSetFounding, ownerSetRooms, cleanRooms, guestAccess, monthlyCents, billingConfigured } from "../../../lib/billing.js";

export const config = { api: { bodyParser: { sizeLimit: "4kb" } } };

async function row(h) {
  const b = (await getBilling(h.id)) || {};
  const access = await guestAccess(h.id, { isFile: h.source !== "self-setup" });
  const rooms = b.rooms || b.plannedRooms || null;
  return { id: h.id, name: h.name, sample: h.source !== "self-setup", status: b.status || null, rooms, founding: !!b.founding, comp: !!b.comp,
    trialEnd: b.trialEnd || null, currentPeriodEnd: b.currentPeriodEnd || null, cancelAtPeriodEnd: !!b.cancelAtPeriodEnd,
    monthlyCents: rooms ? monthlyCents(rooms, !!b.founding) : null, guestAccess: access.ok, lastInvoice: b.lastInvoice || null };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!adminOkReq(req)) return res.status(401).json({ error: "Unauthorized" });
  const { action, hotelId } = req.body || {};
  try {
    if (action === "list") {
      const hotels = await listAllHotels();
      return res.status(200).json({ configured: billingConfigured(), hotels: await Promise.all(hotels.map(row)) });
    }
    const hotel = await getStoredHotel(hotelId);
    if (!hotel) return res.status(404).json({ error: "Hotel not found (sample hotels have no billing)." });
    if (action === "founding") await ownerSetFounding(hotelId, !!req.body.founding);
    else if (action === "comp") await setBilling(hotelId, { comp: !!req.body.comp });
    else if (action === "rooms") {
      const rooms = cleanRooms(req.body.rooms);
      if (!rooms) return res.status(400).json({ error: "Rooms must be 1–2000." });
      await ownerSetRooms(hotelId, rooms);
    } else return res.status(400).json({ error: "Unknown action" });
    return res.status(200).json({ hotel: await row({ id: hotel.id, name: hotel.name, source: "self-setup" }) });
  } catch (e) {
    console.error("admin billing failed", e?.message);
    return res.status(502).json({ error: e.status ? e.message : "Stripe request failed. Check the Stripe dashboard." });
  }
}

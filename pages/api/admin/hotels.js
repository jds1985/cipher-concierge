// POST /api/admin/hotels — owner creates a hotel shell + private edit link.
// ADMIN_KEY via x-admin-key header or body.adminKey (never required in the URL).
import { adminOkReq, baseUrl } from "../../../lib/admin.js";
import { createHotelShell, getStoredHotel } from "../../../lib/store.js";
import { slugifyHotelId, cleanText } from "../../../lib/hotel-form.js";
import { isFileHotel } from "../../../lib/hotels.js";
import { rateLimit } from "../../../lib/ratelimit.js";
import { setHotelLogin, normalizeEmail, passwordProblem } from "../../../lib/auth.js";

export const config = { api: { bodyParser: { sizeLimit: "4kb" } } };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!adminOkReq(req)) return res.status(401).json({ error: "Unauthorized" });

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "?";
  const rl = rateLimit("admin-create:" + ip, { limit: 20, windowMs: 60 * 60_000 });
  if (!rl.ok) return res.status(429).json({ error: "Too many hotels created. Try again later." });

  const rawEmail = typeof req.body?.managerEmail === "string" ? req.body.managerEmail.trim() : "";
  const managerEmail = rawEmail ? normalizeEmail(rawEmail) : null;
  if (rawEmail && !managerEmail) return res.status(400).json({ error: "Manager email is not valid." });
  const managerPassword = typeof req.body?.managerPassword === "string" ? req.body.managerPassword : "";
  if (managerPassword && passwordProblem(managerPassword)) return res.status(400).json({ error: passwordProblem(managerPassword) });

  const name = cleanText(req.body?.name, 80) || "New Hotel";
  let id = slugifyHotelId(name);
  // Avoid colliding with file hotels or existing Redis hotels
  if (isFileHotel(id) || (await getStoredHotel(id))) {
    id = `${id}-${Date.now().toString(36).slice(-4)}`;
  }
  if (isFileHotel(id) || (await getStoredHotel(id))) {
    id = `hotel-${Date.now().toString(36)}`;
  }

  try {
    const { hotel, editToken } = await createHotelShell({ id, name });
    const base = baseUrl(req);
    const editUrl = `${base.replace(/\/$/, "")}/setup/${editToken}`;
    let login = null;
    if (managerEmail) {
      try {
        const r = await setHotelLogin({ hotelId: hotel.id, email: managerEmail, password: managerPassword });
        login = { email: r.email, password: r.password, generated: r.generated, loginUrl: `${base.replace(/\/$/, "")}/login` };
      } catch (e) {
        login = { error: e.status ? e.message : "Hotel created, but the login could not be set. Use 'Set manager login' below." };
      }
    }
    return res.status(201).json({
      login,
      hotelId: hotel.id,
      name: hotel.name,
      editUrl,
      // Shown once — treat like a password. We store only a hash.
      editToken,
      message: "Save this edit link. Anyone with it can update this hotel's facts and print its QR cards.",
    });
  } catch (e) {
    return res.status(500).json({ error: "Could not create hotel." });
  }
}

// POST /api/auth/signup { hotelName, email, password, passwordAgain, website? }
// Public hotel sign-up. Creates the hotel and the manager login, then starts a session.
// The edit token stays on the server. A filled website field is ignored (bot trap).
import { createHotelShell, getStoredHotel, kvIncrWindow, STORE_PREFIX, hashSecret } from "../../../lib/store.js";
import { setHotelLogin, createSession, sessionCookie, sameOrigin, clientIp, normalizeEmail, passwordProblem, getUser } from "../../../lib/auth.js";
import { slugifyHotelId, cleanText } from "../../../lib/hotel-form.js";
import { isFileHotel } from "../../../lib/hotels.js";
import { rateLimit } from "../../../lib/ratelimit.js";

export const config = { api: { bodyParser: { sizeLimit: "4kb" } } };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!sameOrigin(req)) return res.status(403).json({ error: "Bad origin." });
  if (typeof req.body?.website === "string" && req.body.website.trim()) {
    return res.status(400).json({ error: "Could not create the hotel." });
  }

  const ip = clientIp(req);
  if (!rateLimit("signup:" + ip, { limit: 5, windowMs: 60 * 60_000 }).ok) {
    return res.status(429).json({ error: "Too many sign-ups from this network. Wait an hour and try again." });
  }
  const shared = await kvIncrWindow(`${STORE_PREFIX}rl:signup:${hashSecret(ip).slice(0, 24)}`, 3600);
  if (shared > 5) return res.status(429).json({ error: "Too many sign-ups from this network. Wait an hour and try again." });

  const hotelName = cleanText(req.body?.hotelName, 80);
  if (!hotelName || hotelName.length < 2) return res.status(400).json({ error: "Enter your hotel name." });
  const email = normalizeEmail(req.body?.email);
  if (!email) return res.status(400).json({ error: "Enter a valid email." });
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const again = typeof req.body?.passwordAgain === "string" ? req.body.passwordAgain : "";
  if (password !== again) return res.status(400).json({ error: "Type the same password in both boxes." });
  const problem = passwordProblem(password);
  if (problem) return res.status(400).json({ error: problem });
  if (await getUser(email)) return res.status(409).json({ error: "That email already has a hotel login. Sign in instead." });

  let id = slugifyHotelId(hotelName);
  if (isFileHotel(id) || (await getStoredHotel(id))) id = `${id}-${Date.now().toString(36).slice(-4)}`;
  if (isFileHotel(id) || (await getStoredHotel(id))) id = `hotel-${Date.now().toString(36)}`;

  try {
    const { hotel } = await createHotelShell({ id, name: hotelName });
    await setHotelLogin({ hotelId: hotel.id, email, password });
    const token = await createSession(await getUser(email));
    res.setHeader("Set-Cookie", sessionCookie(token));
    return res.status(201).json({ ok: true, next: "/manage" });
  } catch (e) {
    if (e.status === 409) return res.status(409).json({ error: "That email already has a hotel login. Sign in instead." });
    console.error("signup failed", e?.status || e?.message);
    return res.status(500).json({ error: "Could not create the hotel. Try again." });
  }
}

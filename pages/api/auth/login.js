// POST /api/auth/login { email, password } — hotel manager sign-in. Sets an httpOnly session cookie.
import { checkLogin, createSession, sessionCookie, sameOrigin, clientIp } from "../../../lib/auth.js";

export const config = { api: { bodyParser: { sizeLimit: "2kb" } } };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!sameOrigin(req)) return res.status(403).json({ error: "Bad origin." });
  try {
    const r = await checkLogin({ email: req.body?.email, password: req.body?.password, ip: clientIp(req) });
    if (!r.user) {
      if (r.retryAfter) res.setHeader("Retry-After", String(r.retryAfter));
      return res.status(r.status).json({ error: r.error });
    }
    const token = await createSession(r.user);
    res.setHeader("Set-Cookie", sessionCookie(token));
    return res.status(200).json({ ok: true, next: "/manage" });
  } catch {
    return res.status(500).json({ error: "Could not sign in. Please try again." });
  }
}

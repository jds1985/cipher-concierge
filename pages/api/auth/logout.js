// POST /api/auth/logout — end this session (server-side delete + clear cookie).
import { destroySession, readCookie, clearSessionCookie, SESSION_COOKIE, sameOrigin } from "../../../lib/auth.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!sameOrigin(req)) return res.status(403).json({ error: "Bad origin." });
  try { await destroySession(readCookie(req, SESSION_COOKIE)); } catch {}
  res.setHeader("Set-Cookie", clearSessionCookie());
  if ((req.headers.accept || "").includes("text/html")) return res.redirect(303, "/login?out=1");
  return res.status(200).json({ ok: true });
}

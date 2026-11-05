// GET /api/stats?range=today|7d|30d — signed-in manager; hotelId from session only.
// Returns aggregate counters only (no chat text, no room-level chat logs).
import { sessionFromReq } from "../../../lib/auth.js";
import { getStats } from "../../../lib/stats.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const s = await sessionFromReq(req);
  if (!s) return res.status(401).json({ error: "Please sign in again." });
  const range = typeof req.query?.range === "string" ? req.query.range : "7d";
  const stats = await getStats(s.hotelId, range);
  return res.status(200).json(stats);
}

// POST /api/requests/<id>/done -> signed-in manager marks a request done. Hotel comes from the session only.
import { sessionFromReq, sameOrigin } from "../../../../lib/auth.js";
import { markRequestDone } from "../../../../lib/requests.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!sameOrigin(req)) return res.status(403).json({ error: "Bad origin." });
  const s = await sessionFromReq(req);
  if (!s) return res.status(401).json({ error: "Please sign in again." });
  const r = await markRequestDone(s.hotelId, req.query?.id);
  if (!r) return res.status(404).json({ error: "Request not found." });
  return res.status(200).json({ id: r.id, status: r.status });
}

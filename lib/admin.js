import crypto from "crypto";
// Admin pages (QR generator) need ?key=ADMIN_KEY. Without ADMIN_KEY set, they only work in `next dev`.
export function adminOk(key) {
  const k = process.env.ADMIN_KEY;
  if (!k) return process.env.NODE_ENV !== "production";
  if (typeof key !== "string") return false;
  const a = crypto.createHash("sha256").update(k).digest(), b = crypto.createHash("sha256").update(key).digest();
  return crypto.timingSafeEqual(a, b);
}
export const baseUrl = (req) => process.env.PUBLIC_BASE_URL || `http://${req.headers.host}`;

// Signed room QR tokens: t = base64url(HMAC-SHA256(QR_SECRET, "v<ver>|<hotel>|<room>"))[0..22]
// Rotate every printed card at once by bumping QR_KEY_VERSION (or changing QR_SECRET).
import crypto from "crypto";

const DEV_SECRET = "dev-only-insecure-secret-change-me";
export function secret() {
  const s = process.env.QR_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_SECRET !== "1")
    throw new Error("QR_SECRET (32+ chars) is required in production");
  return DEV_SECRET;
}
const ver = () => process.env.QR_KEY_VERSION || "1";

export function signRoom(hotelId, roomId, key = secret(), v = ver()) {
  return crypto.createHmac("sha256", key).update(`v${v}|${hotelId}|${roomId}`).digest("base64url").slice(0, 22);
}
export function verifyRoom(hotelId, roomId, token, key = secret(), v = ver()) {
  if (typeof token !== "string" || token.length !== 22) return false;
  const a = Buffer.from(signRoom(hotelId, roomId, key, v));
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export function roomUrl(base, hotelId, roomId) {
  return `${base.replace(/\/$/, "")}/stay/${hotelId}/${encodeURIComponent(roomId)}?t=${signRoom(hotelId, roomId)}`;
}

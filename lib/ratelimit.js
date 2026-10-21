// In-memory sliding-window limiter. Holds only counters keyed by a hashed client key;
// entries expire after the window. Nothing is written to disk; no message content is touched.
import crypto from "crypto";
const buckets = new Map();
export function rateLimit(key, { limit = 20, windowMs = 60_000 } = {}, now = Date.now()) {
  const k = crypto.createHash("sha256").update(String(key)).digest("hex").slice(0, 16);
  const arr = (buckets.get(k) || []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) { buckets.set(k, arr); return { ok: false, retryAfter: Math.ceil((windowMs - (now - arr[0])) / 1000) }; }
  arr.push(now); buckets.set(k, arr);
  if (buckets.size > 5000) for (const [kk, v] of buckets) if (!v.length || now - v[v.length - 1] > windowMs) buckets.delete(kk);
  return { ok: true };
}
export function _reset() { buckets.clear(); }

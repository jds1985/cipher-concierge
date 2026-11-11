import crypto from "crypto";
// Owner admin: ADMIN_KEY via header `x-admin-key` or POST/form body `adminKey` (not the URL).
// Legacy query `?key=` still accepted for /admin/qr print bookmarks, but new owner pages prefer header/body.

function keyEqual(provided) {
  const k = process.env.ADMIN_KEY;
  if (!k) return process.env.NODE_ENV !== "production";
  if (typeof provided !== "string" || !provided) return false;
  const a = crypto.createHash("sha256").update(k).digest();
  const b = crypto.createHash("sha256").update(provided).digest();
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function adminOk(key) {
  return keyEqual(key);
}

/** Prefer header, then body field, then (legacy) query. */
export function adminKeyFromReq(req) {
  const header = req.headers?.["x-admin-key"];
  if (typeof header === "string" && header) return header;
  if (req.body && typeof req.body.adminKey === "string") return req.body.adminKey;
  if (req.body && typeof req.body.key === "string") return req.body.key;
  if (req.query && typeof req.query.key === "string") return req.query.key;
  return null;
}

export function adminOkReq(req) {
  return keyEqual(adminKeyFromReq(req));
}

export function baseUrl(req) {
  const configured = process.env.PUBLIC_BASE_URL;
  const host = String(req?.headers?.["x-forwarded-host"] || req?.headers?.host || "").split(",")[0].trim();
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production" && host) {
    const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
    return `${proto}://${host}`;
  }
  return configured || `http://${host || "localhost"}`;
}

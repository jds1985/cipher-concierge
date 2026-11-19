// Hotel manager logins: email + password (bcrypt), server-side sessions in Redis, httpOnly cookie.
// One account maps to exactly one hotel id; every hotel API resolves the hotel from the session,
// never from the request body, so one hotel cannot read or write another's data.
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { storePrefix, kvGetJson, kvSetJson, kvDelete, kvIncrWindow, getStoredHotel, saveHotel, hashSecret } from "./store.js";

export const SESSION_COOKIE = "cc_sess";
export const SESSION_TTL_SEC = 60 * 60 * 24 * 14; // 14 days
const BCRYPT_ROUNDS = 12;
export const MIN_PASSWORD = 10;

const userKey = (email) => `${storePrefix()}user:${email}`;
const sessKey = (hash) => `${storePrefix()}sess:${hash}`;
const rlKey = (kind, id) => `${storePrefix()}rl:${kind}:${hashSecret(id).slice(0, 24)}`;

export function normalizeEmail(email) {
  if (typeof email !== "string") return null;
  const e = email.trim().toLowerCase();
  if (e.length < 3 || e.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e;
}

export function generatePassword() {
  // ~100 bits, readable: 4 groups of 5 from an unambiguous alphabet
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(20);
  let out = "";
  for (let i = 0; i < 20; i++) {
    out += alphabet[bytes[i] % alphabet.length];
    if (i % 5 === 4 && i < 19) out += "-";
  }
  return out;
}

export function passwordProblem(pw) {
  if (typeof pw !== "string") return "Password required.";
  if (pw.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  if (pw.length > 128) return "Password is too long.";
  return null;
}

export async function getUser(email) {
  const e = normalizeEmail(email);
  if (!e) return null;
  const u = await kvGetJson(userKey(e));
  return u && typeof u === "object" ? u : null;
}

/**
 * Owner action: create or reset the manager login for a hotel.
 * Returns { email, password, generated }. Password is returned once and stored only as a bcrypt hash.
 */
export async function setHotelLogin({ hotelId, email, password }) {
  const e = normalizeEmail(email);
  if (!e) throw Object.assign(new Error("Enter a valid email."), { status: 400 });
  const hotel = await getStoredHotel(hotelId);
  if (!hotel) throw Object.assign(new Error("Hotel not found."), { status: 404 });
  const existing = await getUser(e);
  if (existing && existing.hotelId !== hotelId) {
    throw Object.assign(new Error("That email already manages a different hotel."), { status: 409 });
  }
  let generated = false;
  if (!password) { password = generatePassword(); generated = true; }
  const problem = passwordProblem(password);
  if (problem) throw Object.assign(new Error(problem), { status: 400 });

  // If the hotel had a different manager email, remove that old login.
  const prev = normalizeEmail(hotel._meta?.managerEmail || "");
  if (prev && prev !== e) {
    const old = await getUser(prev);
    if (old && old.hotelId === hotelId) await kvDelete(userKey(prev));
  }

  const passHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const now = new Date().toISOString();
  await kvSetJson(userKey(e), {
    email: e,
    hotelId,
    passHash,
    // bumping this invalidates every existing session for this account
    sessionVersion: (existing?.sessionVersion || 0) + 1,
    createdAt: existing?.createdAt || now,
    passwordSetAt: now,
  });
  await saveHotel({ ...hotel, _meta: { ...(hotel._meta || {}), managerEmail: e } });
  return { email: e, password, generated };
}

// Constant-ish time for unknown emails so attackers can't enumerate accounts by timing.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password-xx", 10);

/** Returns { user } on success, { error, status, retryAfter } otherwise. */
export async function checkLogin({ email, password, ip }) {
  const e = normalizeEmail(email);
  const ipN = await kvIncrWindow(rlKey("login-ip", ip || "?"), 15 * 60);
  const emN = e ? await kvIncrWindow(rlKey("login-email", e), 15 * 60) : 0;
  if (ipN > 30 || emN > 8) {
    return { status: 429, error: "Too many sign-in attempts. Wait 15 minutes and try again.", retryAfter: 900 };
  }
  const user = e ? await getUser(e) : null;
  const ok = await bcrypt.compare(typeof password === "string" ? password.slice(0, 128) : "", user?.passHash || DUMMY_HASH);
  if (!user || !ok) return { status: 401, error: "Email or password is not right." };
  const hotel = await getStoredHotel(user.hotelId);
  if (!hotel) return { status: 401, error: "Email or password is not right." };
  return { user };
}

export async function createSession(user) {
  const token = crypto.randomBytes(32).toString("base64url");
  await kvSetJson(sessKey(hashSecret(token)), {
    email: user.email,
    hotelId: user.hotelId,
    v: user.sessionVersion || 1,
    createdAt: new Date().toISOString(),
  }, SESSION_TTL_SEC);
  return token;
}

export async function destroySession(token) {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return;
  await kvDelete(sessKey(hashSecret(token)));
}

export async function sessionFromToken(token) {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
  const s = await kvGetJson(sessKey(hashSecret(token)));
  if (!s || typeof s !== "object" || !s.hotelId || !s.email) return null;
  const user = await getUser(s.email);
  // Revoked if the account was removed, moved, or its password was reset.
  if (!user || user.hotelId !== s.hotelId || (user.sessionVersion || 1) !== s.v) return null;
  return { email: s.email, hotelId: s.hotelId };
}

export function readCookie(req, name) {
  const raw = req.headers?.cookie;
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function secureFlag() {
  return process.env.NODE_ENV === "production" ? "; Secure" : "";
}

export function sessionCookie(token) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SEC}${secureFlag()}`;
}
export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag()}`;
}

export async function sessionFromReq(req) {
  return sessionFromToken(readCookie(req, SESSION_COOKIE));
}

/** CSRF defense for cookie-authenticated POSTs: require same-origin Origin (or Referer) when present. */
export function sameOrigin(req) {
  const host = req.headers?.host;
  const src = req.headers?.origin || req.headers?.referer;
  if (!src) return true; // non-browser clients; SameSite=Lax already blocks cross-site cookie POSTs
  try { return new URL(src).host === host; } catch { return false; }
}

export function clientIp(req) {
  return (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "?";
}

/**
 * Resolve which hotel a hotel API request may touch.
 * Edit-token (body.token) keeps working as a backup; otherwise the session cookie decides.
 * Returns { hotel, via } or { status, error }.
 */
export async function hotelForRequest(req, { getHotelByEditToken }) {
  const token = req.body?.token;
  if (typeof token === "string" && token) {
    const hotel = await getHotelByEditToken(token);
    return hotel ? { hotel, via: "token", rlId: "tok:" + hashSecret(token).slice(0, 16) }
      : { status: 403, error: "Invalid or expired edit link." };
  }
  if (!sameOrigin(req)) return { status: 403, error: "Bad origin." };
  const s = await sessionFromReq(req);
  if (!s) return { status: 401, error: "Please sign in again." };
  const hotel = await getStoredHotel(s.hotelId);
  if (!hotel) return { status: 401, error: "Please sign in again." };
  return { hotel, via: "session", rlId: "sess:" + hashSecret(s.email).slice(0, 16), email: s.email };
}

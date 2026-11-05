// Durable hotel store: Upstash Redis (KV_REST_API_*) with an in-memory fallback for local tests.
// Key namespace `cc:v1:` keeps Cipher Concierge data apart from anything else on a shared Redis.
import crypto from "crypto";
import { Redis } from "@upstash/redis";

const PREFIX = "cc:v1:";
const mem = new Map();
let redis = null;
let redisTried = false;

function hasRedisEnv() {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function client() {
  if (redisTried) return redis;
  redisTried = true;
  if (!hasRedisEnv()) return null;
  try {
    redis = Redis.fromEnv();
  } catch {
    redis = null;
  }
  return redis;
}

/** Reset the Redis client (tests). */
export function _resetStoreClient() {
  redis = null;
  redisTried = false;
  mem.clear();
}

export function storeBackend() {
  return client() ? "redis" : "memory";
}

async function kvGet(key) {
  const r = client();
  if (r) return r.get(key);
  return mem.has(key) ? mem.get(key) : null;
}

async function kvSet(key, value) {
  const r = client();
  if (r) {
    await r.set(key, value);
    return;
  }
  mem.set(key, value);
}

async function kvDel(key) {
  const r = client();
  if (r) {
    await r.del(key);
    return;
  }
  mem.delete(key);
}

async function kvSAdd(key, member) {
  const r = client();
  if (r) {
    await r.sadd(key, member);
    return;
  }
  const set = mem.get(key) || new Set();
  set.add(member);
  mem.set(key, set);
}

async function kvSMembers(key) {
  const r = client();
  if (r) return (await r.smembers(key)) || [];
  const set = mem.get(key);
  return set ? [...set] : [];
}

export function hashSecret(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

export function newEditToken() {
  return crypto.randomBytes(24).toString("base64url");
}

export function hotelKey(id) {
  return `${PREFIX}hotel:${id}`;
}
export function editKey(hash) {
  return `${PREFIX}edit:${hash}`;
}
const INDEX = `${PREFIX}hotels`;

function timingEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export async function getStoredHotel(id) {
  if (typeof id !== "string" || !id) return null;
  const raw = await kvGet(hotelKey(id));
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function listStoredHotelIds() {
  return kvSMembers(INDEX);
}

export async function saveHotel(hotel) {
  if (!hotel?.id) throw new Error("hotel.id required");
  const copy = { ...hotel, _meta: { ...(hotel._meta || {}), updatedAt: new Date().toISOString() } };
  await kvSet(hotelKey(hotel.id), JSON.stringify(copy));
  await kvSAdd(INDEX, hotel.id);
  return copy;
}

export async function createHotelShell({ id, name }) {
  const editToken = newEditToken();
  const editKeyHash = hashSecret(editToken);
  const hotel = {
    id,
    name: name || "New Hotel",
    location: { area: null, city: null, address: null, directions: null },
    frontDesk: {
      phoneDisplay: null,
      phoneTel: null,
      inRoom: "Dial 0 from your room phone",
      hours: null,
    },
    emergency: "Dial 911 immediately, then let the front desk know.",
    wifi: { network: null, password: null, showPassword: false, notes: null },
    checkIn: { time: "3:00 PM" },
    checkOut: { time: "11:00 AM", late: null },
    breakfast: { hours: null, included: null, location: null },
    dining: [],
    roomService: null,
    parking: null,
    fitness: null,
    pool: null,
    spa: null,
    housekeeping: null,
    pets: null,
    smoking: null,
    quietHours: null,
    amenities: [],
    localRecommendations: [],
    faqs: [],
    _meta: {
      source: "self-setup",
      editKeyHash,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      confirmWithHotel: [],
    },
  };
  await saveHotel(hotel);
  await kvSet(editKey(editKeyHash), id);
  return { hotel, editToken };
}

export async function hotelIdForEditToken(token) {
  if (typeof token !== "string" || token.length < 20 || token.length > 80) return null;
  const h = hashSecret(token);
  const id = await kvGet(editKey(h));
  if (!id || typeof id !== "string") return null;
  const hotel = await getStoredHotel(id);
  if (!hotel) return null;
  const stored = hotel._meta?.editKeyHash;
  if (!stored || !timingEqualHex(stored, h)) return null;
  return id;
}

export async function getHotelByEditToken(token) {
  const id = await hotelIdForEditToken(token);
  return id ? getStoredHotel(id) : null;
}

/** Strip secrets before sending hotel JSON to a browser (except the hotel's own editor). */
export function stripSecrets(hotel) {
  if (!hotel) return null;
  const copy = JSON.parse(JSON.stringify(hotel));
  if (copy._meta) {
    delete copy._meta.editKeyHash;
    delete copy._meta.managerEmail;
  }
  return copy;
}

/** Guest-facing view: hide Wi-Fi password unless the hotel opted in. */
export function guestHotel(hotel) {
  const h = stripSecrets(hotel);
  if (!h) return null;
  if (h.wifi && !h.wifi.showPassword) {
    h.wifi = { ...h.wifi, password: null };
  }
  return h;
}

// ---- Hotel manager accounts + sessions (same Redis, `cc:v1:` namespace) ----
const memExp = new Map(); // key -> expiry ms (memory fallback only)

function memAlive(key) {
  const exp = memExp.get(key);
  if (exp && exp <= Date.now()) {
    mem.delete(key);
    memExp.delete(key);
    return false;
  }
  return mem.has(key);
}

export async function kvGetJson(key) {
  const r = client();
  let raw;
  if (r) raw = await r.get(key);
  else raw = memAlive(key) ? mem.get(key) : null;
  if (raw == null) return null;
  if (typeof raw === "object") return raw;
  try { return JSON.parse(raw); } catch { return raw; }
}

export async function kvSetJson(key, value, ttlSec) {
  const r = client();
  const v = JSON.stringify(value);
  if (r) {
    if (ttlSec) await r.set(key, v, { ex: ttlSec });
    else await r.set(key, v);
    return;
  }
  mem.set(key, v);
  if (ttlSec) memExp.set(key, Date.now() + ttlSec * 1000);
  else memExp.delete(key);
}

export async function kvDelete(key) {
  memExp.delete(key);
  return kvDel(key);
}

/** Atomic counter with a window (shared across serverless instances when Redis is on). */
export async function kvIncrWindow(key, windowSec) {
  const r = client();
  if (r) {
    const n = await r.incr(key);
    if (n === 1) await r.expire(key, windowSec);
    return n;
  }
  const n = (memAlive(key) ? Number(mem.get(key)) : 0) + 1;
  mem.set(key, n);
  if (n === 1) memExp.set(key, Date.now() + windowSec * 1000);
  return n;
}

export { PREFIX as STORE_PREFIX };

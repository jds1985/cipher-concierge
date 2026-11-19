// Hotel registry. File hotels in config/hotels/<id>.json plus optional Redis self-setup hotels.
import fs from "fs";
import path from "path";
import { getStoredHotel, listStoredHotelIds, guestHotel } from "./store.js";
import { ROOM_RE } from "./room-id.js";
export { ROOM_RE };

const DIR = process.env.HOTELS_DIR || path.join(process.cwd(), "config", "hotels");
const FILE_HOTELS = Object.fromEntries(
  fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => {
    const h = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
    return [h.id, h];
  })
);

/** Sync lookup for file-backed sample hotels only (used by unit tests and SSR when Redis isn't needed). */
export function getFileHotel(id) {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(FILE_HOTELS, id) ? FILE_HOTELS[id] : null;
}

/** Back-compat sync getter: file hotels only. Prefer resolveHotel in request handlers. */
export function getHotel(id) {
  return getFileHotel(id);
}

export function listFileHotels() {
  return Object.values(FILE_HOTELS).map((h) => ({ id: h.id, name: h.name }));
}

export function listHotels() {
  return listFileHotels();
}

/** File hotel first, then Redis self-setup hotel (guest-safe Wi-Fi password). */
export async function resolveHotel(id) {
  const file = getFileHotel(id);
  if (file) return file;
  const stored = await getStoredHotel(id);
  return stored ? guestHotel(stored) : null;
}

/** All hotels for owner tools (file + Redis). */
export async function listAllHotels() {
  const out = listFileHotels();
  const ids = await listStoredHotelIds();
  for (const id of ids) {
    if (out.some((h) => h.id === id)) continue;
    const h = await getStoredHotel(id);
    if (h) out.push({ id: h.id, name: h.name, source: "self-setup" });
  }
  return out;
}

export function isFileHotel(id) {
  return !!getFileHotel(id);
}

export function validRoom(room) {
  return typeof room === "string" && ROOM_RE.test(room);
}
export function publicHotel(h) {
  return { id: h.id, name: h.name, area: h.location?.area || null, frontDesk: h.frontDesk };
}

export { factLines } from "./factpack.js";

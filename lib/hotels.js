// Hotel registry. One clean JSON per hotel in config/hotels/<id>.json (single schema).
import fs from "fs";
import path from "path";

// Every *.json in config/hotels is one hotel (file name = id). Add a hotel by dropping in a file.
const DIR = process.env.HOTELS_DIR || path.join(process.cwd(), "config", "hotels");
const HOTELS = Object.fromEntries(
  fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => {
    const h = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
    return [h.id, h];
  })
);

export function listHotels() {
  return Object.values(HOTELS).map((h) => ({ id: h.id, name: h.name }));
}
export function getHotel(id) {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(HOTELS, id) ? HOTELS[id] : null;
}
export const ROOM_RE = /^[A-Za-z0-9-]{1,8}$/;
export function validRoom(room) {
  return typeof room === "string" && ROOM_RE.test(room);
}
// Only what the guest page needs to render (no full fact sheet in the browser).
export function publicHotel(h) {
  return { id: h.id, name: h.name, area: h.location?.area || null, frontDesk: h.frontDesk };
}

export { factLines } from "./factpack.js";

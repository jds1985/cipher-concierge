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

// Flatten a hotel into short fact lines for retrieval into Cipher's prompt.
export function factLines(h) {
  const L = [];
  const push = (topic, text) => text && L.push({ topic, text });
  push("hotel name location", `${h.name} is on ${h.location.area} in ${h.location.city}.`);
  push("front desk phone call", `Front desk: ${h.frontDesk.inRoom}${h.frontDesk.phoneTel ? ` or call ${h.frontDesk.phoneDisplay}` : ""}.`);
  push("check in arrival", `Check-in is at ${h.checkIn.time}.`);
  push("check out checkout leave", `Check-out is at ${h.checkOut.time}.`);
  if (h.checkOut.late) push("late checkout", h.checkOut.late);
  push("wifi internet network password", `Wi-Fi network: ${h.wifi.network}.${h.wifi.password ? ` Password: ${h.wifi.password}.` : ""} ${h.wifi.notes || ""}`.trim());
  for (const d of h.dining) {
    const meals = Object.entries(d.meals || {}).map(([k, v]) => `${k} ${v}`).join(", ");
    push(`dining food eat restaurant bar drink ${Object.keys(d.meals || {}).join(" ")}`,
      `${d.name} (${d.type})${d.location ? `, ${d.location}` : ""}${meals ? `: ${meals}` : ""}${d.hours ? `: ${d.hours}` : ""}.`);
  }
  push("parking car valet garage", h.parking);
  push("gym fitness workout exercise", h.fitness);
  push("pool swim", h.pool);
  push("housekeeping towels cleaning", h.housekeeping);
  push("pets dog cat", h.pets);
  push("smoking smoke vape", h.smoking);
  push("quiet hours noise", h.quietHours && `Quiet hours are ${h.quietHours}.`);
  for (const r of h.localRecommendations || [])
    push("nearby local recommend restaurant food walk", `${r.name} (${r.distance}): ${r.description}${r.hours ? ` ${r.hours}.` : ""}`);
  return L;
}

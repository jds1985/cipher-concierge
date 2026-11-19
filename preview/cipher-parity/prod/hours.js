// Tiny hours helper: "7:00 AM to 10:30 AM" -> open/closed at a given local time (handles past-midnight close).
const T = /(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/gi;
function toMin(h, m, ap) { h = +h % 12; if (ap.toUpperCase() === "PM") h += 12; return h * 60 + (+m || 0); }
export function parseRange(s) {
  if (!s) return null;
  const t = [...s.matchAll(T)];
  if (t.length < 2) return null;
  return { start: toMin(t[0][1], t[0][2], t[0][3]), end: toMin(t[1][1], t[1][2], t[1][3]) };
}
export function isOpen(range, minutes) {
  if (!range) return null;
  return range.end > range.start ? minutes >= range.start && minutes < range.end : minutes >= range.start || minutes < range.end;
}
export function localMinutes(date = new Date(), tz = "America/New_York") {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(date);
  return +p.find((x) => x.type === "hour").value * 60 + +p.find((x) => x.type === "minute").value;
}
export function fmtMinutes(m) {
  const h = Math.floor(m / 60) % 24, mm = String(m % 60).padStart(2, "0");
  return `${h % 12 || 12}:${mm} ${h < 12 ? "AM" : "PM"}`;
}

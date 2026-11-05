// Validate + sanitize the hotel self-setup form into the shared hotel JSON schema.
import { ROOM_RE } from "./hotels.js";

const MAX = {
  name: 80,
  phone: 40,
  wifiNetwork: 64,
  wifiPassword: 64,
  wifiNotes: 280,
  time: 40,
  policy: 500,
  short: 400,
  placeLine: 200,
  faqQ: 160,
  faqA: 500,
  roomsSpec: 400,
  faqs: 20,
  places: 30,
};

const CTRL = /[\u0000-\u0008\u000B-\u001F\u007F]/g;

export function cleanText(v, max) {
  if (v == null) return null;
  const s = String(v).replace(CTRL, "").replace(/\s+/g, " ").trim();
  if (!s) return null;
  return s.slice(0, max);
}

export function cleanMultiline(v, max) {
  if (v == null) return null;
  const s = String(v).replace(CTRL, "").replace(/\r\n/g, "\n").trim();
  if (!s) return null;
  return s.slice(0, max);
}

export function slugifyHotelId(name) {
  const base = String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "hotel";
}

/** Digits-only E.164-ish tel from a display phone; null if too short. */
export function toTel(display) {
  if (!display) return null;
  const digits = String(display).replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

function parsePlaceLines(text, kind) {
  const lines = String(text || "")
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, MAX.places);
  return lines.map((line) => {
    const clipped = line.slice(0, MAX.placeLine);
    // "Name — description" or "Name: description" or plain name
    const m = clipped.match(/^(.{1,80})\s*[—\-–:|]\s*(.+)$/);
    const name = (m ? m[1] : clipped).trim().slice(0, 80);
    const description = (m ? m[2] : kindLabel(kind)).trim().slice(0, 160);
    const cuisines = cuisinesFor(kind, `${name} ${description}`);
    return {
      name,
      distance: "nearby",
      description,
      hours: null,
      cuisines,
      source: "hotel-provided",
      kind,
    };
  }).filter((r) => r.name);
}

function kindLabel(kind) {
  if (kind === "coffee") return "Coffee shop nearby.";
  if (kind === "bar") return "Bar or lounge nearby.";
  return "Restaurant nearby.";
}

function cuisinesFor(kind, text) {
  const t = text.toLowerCase();
  const tags = new Set();
  if (kind === "coffee") tags.add("coffee");
  if (kind === "bar") { tags.add("bar"); tags.add("cocktails"); }
  if (kind === "restaurant") tags.add("restaurant");
  if (/\b(sushi|japanese)\b/.test(t)) tags.add("japanese"), tags.add("sushi");
  if (/\b(mexican|taco)\b/.test(t)) tags.add("mexican"), tags.add("tacos");
  if (/\b(italian|pizza|pasta)\b/.test(t)) tags.add("italian");
  if (/\b(bbq|barbecue)\b/.test(t)) tags.add("bbq");
  if (/\b(southern|american)\b/.test(t)) tags.add("southern"), tags.add("american");
  if (/\b(asian|thai|chinese|vietnamese|korean)\b/.test(t)) tags.add("asian");
  if (/\b(coffee|cafe|café|espresso)\b/.test(t)) tags.add("coffee");
  if (/\b(bar|lounge|cocktail|pub|speakeasy)\b/.test(t)) tags.add("bar"), tags.add("cocktails");
  return [...tags];
}

function parseFaqs(raw) {
  if (Array.isArray(raw)) {
    return raw
      .filter((f) => f && typeof f.q === "string" && typeof f.a === "string")
      .map((f) => ({ q: cleanText(f.q, MAX.faqQ), a: cleanText(f.a, MAX.faqA) }))
      .filter((f) => f.q && f.a)
      .slice(0, MAX.faqs);
  }
  // Free text: "Q: ...\nA: ..." blocks or "question | answer" lines
  const text = cleanMultiline(raw, MAX.faqs * (MAX.faqQ + MAX.faqA + 10));
  if (!text) return [];
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const out = [];
  for (const b of blocks) {
    const qm = b.match(/^(?:q(?:uestion)?\s*[:.\-–]\s*)(.+?)(?:\n+a(?:nswer)?\s*[:.\-–]\s*([\s\S]+))?$/i);
    if (qm && qm[2]) {
      out.push({ q: cleanText(qm[1], MAX.faqQ), a: cleanText(qm[2], MAX.faqA) });
      continue;
    }
    const pipe = b.split(/\s*\|\s*/);
    if (pipe.length >= 2) {
      out.push({ q: cleanText(pipe[0], MAX.faqQ), a: cleanText(pipe.slice(1).join(" | "), MAX.faqA) });
      continue;
    }
    const lines = b.split("\n");
    if (lines.length >= 2) out.push({ q: cleanText(lines[0], MAX.faqQ), a: cleanText(lines.slice(1).join(" "), MAX.faqA) });
  }
  return out.filter((f) => f.q && f.a).slice(0, MAX.faqs);
}

function boolish(v) {
  if (typeof v === "boolean") return v;
  if (v == null || v === "") return null;
  const s = String(v).toLowerCase().trim();
  if (["1", "true", "yes", "y", "on", "included", "free", "complimentary"].includes(s)) return true;
  if (["0", "false", "no", "n", "off", "not included", "extra charge"].includes(s)) return false;
  return null;
}

/**
 * Accept a flat form payload and return { ok, hotelPatch, errors }.
 * Does not set id / editKeyHash — caller merges onto the existing hotel.
 */
export function sanitizeHotelForm(input) {
  const errors = [];
  const body = input && typeof input === "object" ? input : {};

  const name = cleanText(body.name ?? body.hotelName, MAX.name);
  if (!name) errors.push("Hotel name is required.");

  const phoneDisplay = cleanText(body.frontDeskPhone ?? body.phone, MAX.phone);
  const phoneTel = toTel(phoneDisplay);

  const wifiNetwork = cleanText(body.wifiNetwork ?? body.wifiName, MAX.wifiNetwork);
  const wifiPassword = cleanText(body.wifiPassword, MAX.wifiPassword);
  const wifiShowPassword = !!body.wifiShowPassword || body.wifiShowPassword === "on" || body.wifiShowPassword === "true";
  const wifiNotes = cleanText(body.wifiNotes, MAX.wifiNotes);

  const checkIn = cleanText(body.checkIn ?? body.checkInTime, MAX.time) || "3:00 PM";
  const checkOut = cleanText(body.checkOut ?? body.checkOutTime, MAX.time) || "11:00 AM";
  const lateCheckout = cleanText(body.lateCheckout ?? body.lateCheckoutPolicy, MAX.policy);

  const breakfastHours = cleanText(body.breakfastHours, MAX.time);
  const breakfastIncluded = boolish(body.breakfastIncluded);
  const breakfastLocation = cleanText(body.breakfastLocation, MAX.short);

  const parking = cleanText(body.parking, MAX.short);
  const pool = cleanText(body.pool, MAX.short);
  const gym = cleanText(body.gym ?? body.fitness, MAX.short);
  const spa = cleanText(body.spa, MAX.short);
  const pets = cleanText(body.pets, MAX.short);
  const roomService = cleanText(body.roomService, MAX.short);

  const restaurants = parsePlaceLines(body.nearbyRestaurants ?? body.restaurants, "restaurant");
  const coffee = parsePlaceLines(body.nearbyCoffee ?? body.coffee, "coffee");
  const bars = parsePlaceLines(body.nearbyBars ?? body.bars, "bar");
  const localRecommendations = [...restaurants, ...coffee, ...bars];

  const faqs = parseFaqs(body.faqs ?? body.faqText);

  const city = cleanText(body.city, 80);
  const area = cleanText(body.area, 80);
  const address = cleanText(body.address, 160);

  if (errors.length) return { ok: false, errors };

  const dining = [];
  if (breakfastHours) {
    dining.push({
      name: breakfastLocation || "Breakfast",
      type: breakfastIncluded === true ? "Complimentary breakfast" : breakfastIncluded === false ? "Breakfast (not included)" : "Breakfast",
      location: breakfastLocation,
      meals: { breakfast: breakfastHours },
      hours: null,
      included: breakfastIncluded,
    });
  }
  for (const b of bars) {
    dining.push({
      name: b.name,
      type: b.description || "Bar or lounge",
      location: null,
      meals: {},
      hours: null,
      kind: "bar",
    });
  }

  const amenities = [];
  if (breakfastHours) amenities.push(breakfastIncluded ? "Breakfast included" : "Breakfast");
  if (parking) amenities.push("Parking");
  if (pool) amenities.push("Pool");
  if (gym) amenities.push("Gym / fitness");
  if (spa) amenities.push("Spa");
  if (pets) amenities.push("Pet-friendly options");
  if (roomService) amenities.push("Room service");

  const hotelPatch = {
    name,
    location: {
      area: area || null,
      city: city || null,
      address: address || null,
      directions: null,
    },
    frontDesk: {
      phoneDisplay: phoneDisplay || null,
      phoneTel: phoneTel || null,
      inRoom: phoneDisplay ? `Dial 0 from your room phone, or call ${phoneDisplay}` : "Dial 0 from your room phone",
      hours: null,
    },
    wifi: {
      network: wifiNetwork || "Guest Wi-Fi",
      password: wifiPassword,
      showPassword: wifiShowPassword,
      notes: wifiNotes || (wifiPassword && !wifiShowPassword ? "Ask the front desk for the Wi-Fi password." : null),
    },
    checkIn: { time: checkIn },
    checkOut: { time: checkOut, late: lateCheckout },
    breakfast: {
      hours: breakfastHours,
      included: breakfastIncluded,
      location: breakfastLocation,
    },
    dining,
    roomService,
    parking,
    fitness: gym,
    pool,
    spa,
    pets,
    amenities,
    localRecommendations,
    faqs,
  };

  return { ok: true, hotelPatch, errors: [] };
}

/** Expand "301-304,412,PH1" into room id list (max 200). */
export function expandRooms(spec) {
  const out = [];
  const raw = cleanText(spec, MAX.roomsSpec) || "";
  for (const part of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d{1,5})-(\d{1,5})$/);
    if (m) {
      const a = +m[1], b = +m[2];
      if (a > b || b - a > 200) continue;
      for (let r = a; r <= b && out.length < 200; r++) out.push(String(r));
    } else if (ROOM_RE.test(part)) out.push(part);
  }
  return [...new Set(out)].slice(0, 200);
}

export { MAX as FORM_MAX };

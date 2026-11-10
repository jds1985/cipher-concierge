// Guest-page adapter. The stay page imports this file, not the lab module.
// Answers come from the hotel record the existing form already saves.
// A guest sentence is never written back as a fact.
import { resolveTurn, emptyCorrections, safetyMessage } from "./cipher-layer.js";
import { sanitizeHotelForm } from "./hotel-form.js";
import { cipherLayerGuestEnabled } from "./layer-flag.js";

export { cipherLayerGuestEnabled, safetyMessage };

export function guestLayerTurn(hotel, question, raw = "") {
  return resolveTurn({ hotel, question, raw, corrections: emptyCorrections(hotel && hotel.id) });
}

export function guestLayerApplies(turn) {
  const source = turn && turn.resolution && turn.resolution.source;
  return source === "safety" || source === "approved-facts" || source === "partial" || source === "withheld" || source === "approved-correction";
}

export function guestLayerReply(hotel, question, raw = "") {
  const turn = guestLayerTurn(hotel, question, raw);
  if (!guestLayerApplies(turn)) return null;
  const source = turn.resolution.source;
  const supplied = source === "approved-facts" || source === "partial" || source === "approved-correction";
  const modelRan = source !== "safety" && String(raw || "").trim().length > 0;
  return {
    role: "assistant",
    content: turn.resolution.text,
    kind: source === "safety" ? "emergency" : supplied ? "fact" : "fallback",
    source: source === "safety" ? "safety" : supplied ? "layer" : "withheld",
    raw: modelRan ? String(raw) : "",
    modelRan,
    layerLabel: turn.resolution.label,
    call: source === "safety",
    intent: source === "safety" ? "emergency" : "layer",
    countedAsSuccess: supplied,
  };
}

const TOPIC_QUESTIONS = [
  ["Wi-Fi name", "what is the wifi name"],
  ["Wi-Fi password", "what is the wifi password"],
  ["Checkout", "what time is checkout"],
  ["Late checkout", "late checkout"],
  ["Breakfast", "what time is breakfast"],
  ["Parking", "where is parking"],
  ["Pets", "are pets allowed"],
  ["Pool", "is there a pool"],
  ["Gym", "is there a gym"],
  ["Room service", "is there room service"],
  ["Nearby places", "nearby restaurant"],
  ["Laundry", "where is the laundry"],
  ["Elevator", "elevator hours"],
  ["Accessible rooms", "accessible rooms"],
  ["Mobility help", "need a wheelchair"],
  ["Housekeeping", "housekeeping please"],
  ["Street address", "what is the address"],
];

function blankNote(label, form) {
  if (label === "Wi-Fi name" && !String(form.wifiNetwork || "").trim()) return "This box is empty. The existing form saves Guest Wi-Fi.";
  if (label === "Checkout" && !String(form.checkOut || "").trim()) return "This box is empty. The existing form saves 11:00 AM.";
  if (label === "Wi-Fi password" && !form.wifiShowPassword) return "The password box is not shown to guests unless that checkbox is on.";
  return "";
}

// Read-only lines for the hotel form. Editing stays on the boxes that already exist.
export function layerTopicPreview(form) {
  const body = form && typeof form === "object" ? form : {};
  const built = sanitizeHotelForm({ ...body, name: body.name || "Preview Hotel" });
  if (!built.ok) return [];
  const hotel = { id: "preview", ...built.hotelPatch };
  const rows = TOPIC_QUESTIONS.map(([label, question]) => {
    const turn = guestLayerTurn(hotel, question, "");
    const withheld = turn.resolution.source === "withheld";
    return {
      label,
      empty: withheld,
      hears: withheld ? "Not in the file." : turn.resolution.text,
      note: blankNote(label, body),
    };
  });
  const phone = String(body.frontDeskPhone || "").trim();
  rows.push({
    label: "Front desk phone",
    empty: !phone,
    hears: phone ? safetyMessage(hotel) : "Not in the file. The safety message will not include a phone number.",
    note: "",
  });
  return rows;
}

// Guest-page adapter. The stay page imports this file, not the lab module.
// Answers come from the hotel record the existing form already saves.
// A guest sentence is never written back as a fact.
import { resolveTurn, emptyCorrections, safetyMessage, interpretStay } from "./cipher-layer.js";
import { sanitizeHotelForm } from "./hotel-form.js";
import { cipherLayerGuestEnabled } from "./layer-flag.js";

export { cipherLayerGuestEnabled, safetyMessage };

const GUEST_LINES = [
  ["The approved file has no laundry fact.", "I don't have laundry info yet."],
  ["The approved file has no elevator fact.", "I don't have elevator info yet."],
  ["The approved file has no pool fact.", "I don't have pool info yet."],
  ["The approved file has no gym fact.", "I don't have gym info yet."],
  ["The approved file has no pet policy.", "I don't have pet info yet."],
  ["The approved file has no breakfast fact.", "I don't have breakfast info yet."],
  ["The approved file has no parking fact.", "I don't have parking info yet."],
  ["The approved file has no late checkout policy.", "I don't have late checkout info yet."],
  ["The approved file has no ice fact.", "I don't have ice info yet."],
  ["The approved file has no address.", "I don't have the street address yet."],
  ["The approved file has no airport shuttle fact.", "I don't have airport shuttle info yet."],
  ["The approved file has no landmark.", "I don't have a landmark yet."],
  ["The approved file has no directions.", "I don't have directions yet."],
  ["The approved file has no nearby places.", "I don't have nearby places yet."],
  ["The approved file has no towel fact.", "I don't have towel info yet."],
  ["The approved file has no pillow fact.", "I don't have pillow info yet."],
  ["The approved file has no cleaning fact.", "I don't have cleaning info yet."],
  ["The approved file has no do-not-disturb fact.", "I don't have do-not-disturb info yet."],
  ["The approved file has no housekeeping fact.", "I don't have housekeeping info yet."],
  ["The approved file has no room service fact.", "I don't have room service info yet."],
  ["The approved file has no accessible-room fact.", "I don't have accessible-room info yet."],
  ["The approved file has no mobility help fact.", "I don't have mobility help info yet."],
  ["The approved file has no accessibility fact.", "I don't have accessibility info yet."],
  ["The approved file has no Wi-Fi network name.", "I don't have the Wi-Fi name yet."],
  ["The approved file has no Wi-Fi password.", "I don't have a Wi-Fi password yet."],
  ["The approved file has no checkout time.", "I don't have the checkout time yet."],
  ["Check-in is outside this layer.", "I don't have check-in info yet."],
  ["The file does not say when to leave the building for an outing.", "I don't have that information yet."],
  ["This layer will not book a change or send anyone.", "I can't book that from here."],
  ["The file has no steps for a connection problem.", "I don't have steps for a connection problem yet."],
  ["This question is not a Wi-Fi name, password, or end-of-stay time.", "I don't have that information yet."],
];

export function deskAsk(hotel) {
  const phone = hotel && hotel.frontDesk && hotel.frontDesk.phoneDisplay;
  if (phone) return "Please ask the front desk at " + phone + ".";
  return "Please ask the front desk.";
}

// Tests keep the diagnostic sentences. Guests never see them.
export function speakForGuest(text, hotel, source) {
  let out = String(text || "");
  for (const [from, to] of GUEST_LINES) {
    if (out.includes(from)) out = out.split(from).join(to);
  }
  const asksDesk = source === "withheld" || source === "partial" || GUEST_LINES.some(([from]) => String(text || "").includes(from));
  if (asksDesk && !/Please ask the front desk/.test(out)) out = (out.trim() + " " + deskAsk(hotel)).trim();
  return { text: out.replace(/\s+/g, " ").trim(), asksDesk };
}

export function guestLayerTurn(hotel, question, raw = "") {
  return resolveTurn({ hotel, question, raw, corrections: emptyCorrections(hotel && hotel.id) });
}

export function guestLayerApplies(turn) {
  const source = turn && turn.resolution && turn.resolution.source;
  return source === "safety" || source === "approved-facts" || source === "partial" || source === "withheld" || source === "approved-correction";
}

function savedCheckInTime(hotel) {
  const time = hotel && hotel.checkIn && hotel.checkIn.time;
  return typeof time === "string" ? time.trim() : "";
}

// The grading path still withholds a check-in question. Guests hear the saved time.
function speakCheckIn(hotel, question, turn) {
  const spoken = speakForGuest(turn.resolution.text, hotel, turn.resolution.source);
  const read = interpretStay(question);
  const about = read.intents.includes("checkin-boundary") || read.gaps.includes("Check-in is outside this layer.");
  if (!about) return { ...spoken, known: false };
  const time = savedCheckInTime(hotel);
  const desk = deskAsk(hotel);
  const outing = read.intents.includes("outing-boundary");
  let text = spoken.text;
  if (time) {
    const line = "Check-in is at " + time + ".";
    if (text.includes("I don't have check-in info yet.")) text = text.split("I don't have check-in info yet.").join(line);
    else if (!outing && text.includes("I don't have that information yet.")) text = text.split("I don't have that information yet.").join(line);
    else if (!text.includes(time)) text = (text + " " + line).trim();
    const rest = text.split(line).join(" ").split(desk).join(" ");
    if (!/I don't have|I can't book/.test(rest)) text = text.split(desk).join(" ");
    text = text.replace(/\s+/g, " ").trim();
    return { text, asksDesk: /Please ask the front desk/.test(text), known: true };
  }
  if (!outing && text.includes("I don't have that information yet.")) {
    text = text.split("I don't have that information yet.").join("I don't have check-in info yet.");
  }
  if (!/Please ask the front desk/.test(text)) text = (text + " " + desk).trim();
  return { text: text.replace(/\s+/g, " ").trim(), asksDesk: true, known: false };
}

export function guestLayerReply(hotel, question, raw = "") {
  const turn = guestLayerTurn(hotel, question, raw);
  if (!guestLayerApplies(turn)) return null;
  const source = turn.resolution.source;
  const modelRan = source !== "safety" && String(raw || "").trim().length > 0;
  const spoken = speakCheckIn(hotel, question, turn);
  const supplied = source === "approved-facts" || source === "partial" || source === "approved-correction" || (spoken.known && !spoken.asksDesk);
  const phone = hotel && hotel.frontDesk && (hotel.frontDesk.phoneDisplay || hotel.frontDesk.phoneTel);
  return {
    role: "assistant",
    content: spoken.text,
    kind: source === "safety" ? "emergency" : supplied ? "fact" : "fallback",
    source: source === "safety" ? "safety" : supplied ? "layer" : "withheld",
    asksDesk: spoken.asksDesk,
    raw: modelRan ? String(raw) : "",
    modelRan,
    layerLabel: turn.resolution.label,
    call: source === "safety" || (spoken.asksDesk && !!phone),
    intent: source === "safety" ? "emergency" : "layer",
    countedAsSuccess: !spoken.asksDesk && (source === "approved-facts" || source === "approved-correction" || spoken.known),
  };
}

const TOPIC_QUESTIONS = [
  ["Wi-Fi name", "what is the wifi name"],
  ["Wi-Fi password", "what is the wifi password"],
  ["Check-in", "what time is check-in"],
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
  if (label === "Wi-Fi name" && !String(form.wifiNetwork || "").trim()) return "This box is empty. Guests will be asked to call the front desk.";
  if (label === "Check-in" && !String(form.checkIn || "").trim()) return "This box is empty. Guests will be asked to call the front desk.";
  if (label === "Checkout" && !String(form.checkOut || "").trim()) return "This box is empty. Guests will be asked to call the front desk.";
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
    const spoken = speakCheckIn(hotel, question, turn);
    const withheld = turn.resolution.source === "withheld" && spoken.asksDesk;
    return {
      label,
      empty: withheld,
      hears: spoken.text,
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

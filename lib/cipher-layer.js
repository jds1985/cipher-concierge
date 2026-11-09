// Correction layer for the Cipher 2.0 135M stand-in. It does not change /stay or the production guard.
import { decideTurn, factLines, buildPrompt } from "./factpack.js";

export const CIPHER_2_STANDIN = {
  displayName: "Cipher 2.0 (135M stand-in)",
  id: "cipher-135m-sft",
  file: "sft.ctern",
  bytes: 73231828,
  sha256: "4f97a2162fd96b899c4bb0398cc288239f2b1963627dca5fcbe1afc02dd51e55",
  provenance: "Cipher_bot docs/BASELINE.md on branch cipher-runtime names this file cipher-135m-sft and Cipher 2.0 (135M stand-in). The concierge release model-sft-135m uses the same size and sha256. It is not cipher2m_concierge_targeted.ctern.",
};

export const CORRECTION_VERSION = 1;

const NUM = /\d+(?::\d+)?(?:\s?(?:AM|PM|am|pm))?/g;

export function emptyCorrections(hotelId) {
  return { version: CORRECTION_VERSION, hotelId, trusted: "vetted-file", corrections: [] };
}

export function approveCorrection(file, entry) {
  if (!entry || entry.source === "guest") throw new Error("Guest statements are not approved corrections.");
  if (!entry.hotelId || !entry.topic || !entry.text || !entry.id) throw new Error("A correction needs an id, hotel, topic, and text.");
  const next = { ...file, corrections: file.corrections.filter((item) => item.id !== entry.id) };
  next.corrections.push({ id: entry.id, hotelId: entry.hotelId, topic: entry.topic, text: entry.text, approved: true, source: "vetted" });
  return next;
}

export function resetCorrections(file) {
  return emptyCorrections(file.hotelId);
}

export function exportCorrections(file) {
  return JSON.stringify(file, null, 2);
}

function sentences(raw) {
  return String(raw || "").split(/\n+|(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
}

function askedTopics(question) {
  const q = String(question || "").toLowerCase();
  const topics = [];
  if (/\b(wi-?fi|wireless|network)\b/.test(q)) topics.push("wifi");
  if (/\b(check-?out|leave|be gone|out of the room)\b/.test(q)) topics.push("checkout");
  if (/\b(pets|animals|dogs|cats)\b/.test(q)) topics.push("pets");
  return topics;
}

export function findMissing(hotel, question, raw) {
  const turn = decideTurn(hotel, question, { now: new Date("2026-11-08T16:00:00Z") });
  if (turn.path === "model") return [];
  const facts = factLines(hotel);
  const text = String(raw || "");
  const out = [];
  for (const topic of askedTopics(question)) {
    if (topic === "wifi") {
      const line = facts.find((fact) => /wifi/.test(fact.topic));
      const name = line && (line.text.match(/Wi-Fi network: ([^.]+)/) || [])[1];
      if (name && !text.includes(name)) out.push({ id: "missing-fact", detail: "The question asks for the wireless network. The model text does not include " + name + "." });
    }
    if (topic === "checkout") {
      const line = facts.find((fact) => /check out/.test(fact.topic));
      const time = line && (line.text.match(/Check-out is at ([^.]+)/) || [])[1];
      if (time && !text.includes(time)) out.push({ id: "missing-fact", detail: "The question asks when the guest leaves. The model text does not include " + time + "." });
    }
    if (topic === "pets") {
      const line = facts.find((fact) => /pets/.test(fact.topic));
      if (line && /not permitted|not allowed/i.test(line.text) && !/\b(not permitted|not allowed|no pets|cannot|can't)\b/i.test(text)) {
        out.push({ id: "missing-fact", detail: "The question asks about pets. The model text does not say they are not permitted." });
      }
    }
  }
  return out;
}

export function findContradictions(hotel, raw, question = "") {
  const facts = factLines(hotel);
  const sheet = facts.map((fact) => fact.text).join(" ").toLowerCase();
  const out = [];
  for (const sentence of sentences(raw)) {
    const aboutWifi = /\b(wi-?fi|wireless|network)\b/i.test(sentence);
    for (const number of sentence.match(NUM) || []) {
      const owners = facts.filter((fact) => fact.text.includes(number));
      const checkin = owners.some((fact) => /check in/.test(fact.topic));
      const wifi = owners.some((fact) => /wifi/.test(fact.topic));
      if (aboutWifi && checkin && !wifi) {
        out.push({ id: "time-bound-to-wrong-fact", detail: number + " belongs to check-in in the trusted facts. This sentence uses it for the wireless network." });
      }
    }
  }
  const pets = facts.find((fact) => /pets/.test(fact.topic));
  if (pets && /not permitted|not allowed/i.test(pets.text)) {
    const aboutPets = /\b(pets|animals|dogs|cats)\b/i.test(raw);
    const allows = /\b(permitted|allowed|can stay|yes)\b/i.test(raw);
    const denies = /\b(not permitted|not allowed|no pets|cannot|can't)\b/i.test(raw);
    if (aboutPets && allows && !denies) out.push({ id: "pets-polarity", detail: "Trusted facts say pets are not permitted. The model text allows them." });
  }
  const offer = String(raw).match(/\boffers (?:a |an )?([a-z][a-z -]{2,40})/i);
  if (offer) {
    const name = offer[1].split(/[.,]/)[0].trim().toLowerCase();
    if (name && !sheet.includes(name)) out.push({ id: "invented-amenity", detail: "The model says the hotel offers " + name + ", which is not in the trusted facts." });
  }
  if (/\b(I(?:'ll| will)|I am going to)\b/i.test(raw) && /\b(get you|take you|call|alert|send|contact|notify|bring)\b/i.test(raw)) {
    out.push({ id: "action-promise", detail: "The model promises an action. That promise is not accepted." });
  }
  const topics = askedTopics(question);
  if (topics.includes("checkout") || topics.includes("wifi")) {
    const known = new Set(facts.flatMap((fact) => (fact.text.match(NUM) || []).map((number) => number.toUpperCase().replace(/\s+/g, " "))));
    const asked = String(question || "").toUpperCase();
    for (const number of String(raw || "").match(NUM) || []) {
      const norm = number.toUpperCase().replace(/\s+/g, " ");
      if (!known.has(norm) && !asked.includes(norm)) out.push({ id: "invented-time", detail: number + " is not a time in the trusted facts." });
    }
  }
  if (/\b(helicopter|helipad)\b/i.test(raw) && /\b(yes|offers|available|can land|we have)\b/i.test(raw) && !/\b(no|not|don't|cannot|can't)\b/i.test(raw) && !sheet.includes("helicopter") && !sheet.includes("helipad")) {
    out.push({ id: "invented-amenity", detail: "The model affirms a helicopter or helipad, which is not in the trusted facts." });
  }
  return out;
}

function approvedFor(hotelId, question, file) {
  const q = String(question || "").toLowerCase();
  return (file?.corrections || []).filter((item) => item.approved && item.hotelId === hotelId && item.topic && q.includes(String(item.topic).toLowerCase()));
}

export function groundingSystem(hotel, question, corrections) {
  const base = buildPrompt(hotel, factLines(hotel));
  const extra = approvedFor(hotel.id, question, corrections);
  if (!extra.length) return base;
  return base + "\nApproved corrections:\n" + extra.map((item) => "- " + item.text).join("\n");
}

export function contextReport({ systemTokens, systemBegin, systemPast, userBegin, userPast }) {
  const systemRemains = Number.isFinite(systemPast) && Number.isFinite(userBegin) && userPast === systemPast + userBegin;
  return {
    systemTokens, systemBegin, systemPast, userBegin, userPast, systemRemains,
    note: "userBegin is the number of tokens the question call added. userPast is the context length after that add. A small userBegin does not mean the hotel text was dropped.",
  };
}

const DENY_PETS = /\b(not permitted|not allowed|no pets|no dogs|cannot|can't|not true|no,)\b/i;

export function rawIsComplete(kind, hotel, raw) {
  const text = String(raw || "");
  const facts = factLines(hotel);
  const network = ((facts.find((fact) => /wifi/.test(fact.topic)) || {}).text.match(/Wi-Fi network: ([^.]+)/) || [])[1] || "";
  const checkout = ((facts.find((fact) => /check out/.test(fact.topic)) || {}).text.match(/Check-out is at ([^.]+)/) || [])[1] || "";
  if (kind === "safety-separate" || kind === "general-passthrough") return null;
  if (kind === "includes-network") return Boolean(network) && text.includes(network);
  if (kind === "includes-checkout") return Boolean(checkout) && text.includes(checkout);
  if (kind === "includes-both") return Boolean(network && checkout) && text.includes(network) && text.includes(checkout);
  if (kind === "denies-pets") return DENY_PETS.test(text) && !(/\b(are permitted|are allowed|can stay)\b/i.test(text) && !/\b(not permitted|not allowed|cannot|can't)\b/i.test(text));
  if (kind === "no-invented-helicopter") {
    if (!text.trim()) return false;
    return !(/\b(helipad|helicopter)\b/i.test(text) && /\b(yes|offers|available|can land|we have)\b/i.test(text) && !/\b(no|not|don't|cannot|can't)\b/i.test(text));
  }
  return null;
}

export function classifyTurn({ hotel, question, raw, corrections, kind }) {
  const resolved = resolveTurn({ hotel, question, raw, corrections });
  const complete = rawIsComplete(kind, hotel, raw);
  return {
    source: resolved.resolution.source,
    label: resolved.resolution.label,
    resolutionText: resolved.resolution.text,
    raw: resolved.raw,
    contradictions: resolved.contradictions,
    rawComplete: complete,
    countedAsFactualSuccess: resolved.resolution.source === "model" && complete === true,
  };
}

function normalizeStay(text) {
  let q = String(text || "").toLowerCase().replace(/['’]/g, "");
  q = q.replace(/[^a-z0-9\s-]/g, " ");
  q = q.replace(/\b(wi[\s-]*fi|wfi|wiffi|wireless)\b/g, "wifi");
  q = q.replace(/\b(chek[\s-]*out|check[\s-]*out|chkout|chekout)\b/g, "checkout");
  q = q.replace(/\b(chek[\s-]*in|check[\s-]*in)\b/g, "checkin");
  q = q.replace(/\boutta\b/g, "out of");
  q = q.replace(/\b(pasword|pass word|passcode|passphrase|pw|passwd)\b/g, "password");
  q = q.replace(/\bchkout\b/g, "checkout");
  q = q.replace(/\bcheckouts\b/g, "checkout");
  q = q.replace(/\b(pupper|puppers|doggo|doggos|dogg|doggy)\b/g, "dog");
  q = q.replace(/\b(animls|anmls|petz)\b/g, "pet");
  q = q.replace(/\balowed\b/g, "allowed");
  q = q.replace(/\bbounce\b/g, "leave");
  q = q.replace(/\b(brekfast|brekkie|brkfast)\b/g, "breakfast");
  q = q.replace(/\bparkng\b/g, "parking");
  q = q.replace(/\blater checkout\b/g, "late checkout");
  q = q.replace(/\b(dump the car|leave the car)\b/g, "parking");
  q = q.replace(/\bgymm\b/g, "gym");
  q = q.replace(/\bfitness room\b/g, "gym");
  q = q.replace(/\baddy\b/g, "address");
  q = q.replace(/\bvan from the airport\b/g, "shuttle");
  q = q.replace(/\bgrab a bite\b/g, "nearby restaurant");
  return q.replace(/\s+/g, " ").trim();
}

export function interpretStay(question) {
  const q = normalizeStay(question);
  const intents = [];
  const gaps = [];
  const wifiWord = /\bwifi\b|\b(ssid|hotspot|connection)\b/.test(q) || /\b(guest|hotel)\s+network\b/.test(q) || (/\bnetwork\b/.test(q) && /\b(name|join|password|connect|ssid)\b/.test(q)) || /\binternet\b/.test(q);
  const password = /\bpassword\b/.test(q);
  const trouble = /\b(dropping|drops|disconnect|cutting|cuts out|wont connect|will not connect|cant connect|cannot connect|no internet|not working|isnt working|trouble)\b/.test(q);
  const asksName = /\b(name|called|join|ssid|which)\b/.test(q) || (/\b(what|whats|tell)\b/.test(q) && !password);
  if (wifiWord && password) intents.push("wifi-password");
  if (wifiWord && trouble) intents.push("wifi-trouble");
  if (wifiWord && (asksName || (!password && !trouble) || trouble)) intents.push("wifi-name");
  const outing = /\b(building|walk|coffee|dinner|lunch|outside|door)\b/.test(q) || /\b(stepping out|step out|going out|leave the hotel|out the door)\b/.test(q);
  const room = /\b(out of the room|out of my room|leave the room|vacate the room)\b/.test(q) || (/\bdeparture\b/.test(q) && /\broom\b/.test(q));
  const leaveAsk = /\b(when|time|tomorrow|morning|tonight|gotta|have to|need to)\b/.test(q) && /\b(leave|leaving|be out)\b/.test(q);
  const lateCheckout = /\blate checkout\b/.test(q);
  const checkout = /\bcheckout\b/.test(q.replace(/\blate checkout\b/g, " ")) || room || (leaveAsk && !outing);
  const checkin = /\bcheckin\b/.test(q) || /\b(arrival|arrive)\b/.test(q);
  if (lateCheckout) intents.push("late-checkout");
  if (checkout) intents.push("checkout");
  if (checkin && !checkout) intents.push("checkin-boundary");
  if (checkin && checkout) gaps.push("Check-in is outside this layer.");
  if (outing && !checkout) intents.push("outing-boundary");
  if (outing && checkout) gaps.push("The file does not say when to leave the building for an outing.");
  if (/\b(book|arrange|send someone|come fix|change my|move my)\b/.test(q)) gaps.push("This layer will not book a change or send anyone.");
  if (intents.includes("wifi-trouble")) gaps.push("The file has no steps for a connection problem.");
  if (/\b(pet|pets|dog|dogs|cat|cats|animal|animals|puppy|puppies|kitten|kittens|labrador)\b/.test(q)) intents.push("pets");
  if (/\bbreakfast\b/.test(q)) intents.push("breakfast");
  if (/\b(parking|garage|valet|park the car)\b/.test(q)) intents.push("parking");
  if (/\b(pool|swim|swimming)\b/.test(q)) intents.push("amenity-pool");
  if (/\b(gym|fitness)\b/.test(q)) intents.push("amenity-gym");
  if (/\b(laundry|washer|washers)\b/.test(q)) intents.push("amenity-laundry");
  if (/\bice\b/.test(q)) intents.push("amenity-ice");
  if (/\b(elevator|elevators|lift)\b/.test(q)) intents.push("amenity-elevator");
  if (/\b(address|street)\b/.test(q)) intents.push("address");
  if (/\b(airport|shuttle)\b/.test(q)) intents.push("shuttle");
  if (/\b(landmark)\b/.test(q)) intents.push("landmark");
  if (/\b(find this place|how do i get here|how do we find|directions to the hotel)\b/.test(q)) intents.push("directions");
  if (/\b(restaurant|restaurants|nearby|attraction|attractions|eat)\b/.test(q)) intents.push("local");
  const supply = [...new Set(intents.filter((intent) => ["wifi-name", "wifi-password", "checkout", "pets", "breakfast", "parking", "late-checkout", "amenity-pool", "amenity-gym", "amenity-laundry", "amenity-ice", "amenity-elevator", "address", "shuttle", "landmark", "directions", "local"].includes(intent)))];
  return { normalized: q, intents, supply, gaps };
}

function vettedSentence(corrections, hotelId, intent) {
  const rows = (corrections?.corrections || []).filter((item) => item.approved && item.source === "vetted" && item.hotelId === hotelId);
  const topic = (item) => String(item.topic || "").toLowerCase();
  let hits = [];
  if (intent === "wifi-password") hits = rows.filter((item) => /password/.test(topic(item)));
  if (intent === "wifi-name") hits = rows.filter((item) => /\b(wifi|network|wireless|ssid)\b/.test(topic(item)) && !/password/.test(topic(item)));
  if (intent === "checkout") hits = rows.filter((item) => /checkout|check-out|check out/.test(topic(item)));
  if (intent === "pets") hits = rows.filter((item) => /\b(pet|pets|dog|animal)\b/.test(topic(item)));
  if (intent === "breakfast") hits = rows.filter((item) => /breakfast/.test(topic(item)));
  if (intent === "parking") hits = rows.filter((item) => /parking|garage/.test(topic(item)));
  if (intent === "late-checkout") hits = rows.filter((item) => /late/.test(topic(item)));
  if (intent.startsWith("amenity-")) {
    const key = intent.slice("amenity-".length);
    hits = rows.filter((item) => topic(item).includes(key));
  }
  if (intent === "address") hits = rows.filter((item) => /address/.test(topic(item)));
  if (intent === "shuttle") hits = rows.filter((item) => /shuttle|airport/.test(topic(item)));
  if (intent === "landmark") hits = rows.filter((item) => /landmark/.test(topic(item)));
  if (intent === "directions") hits = rows.filter((item) => /direction/.test(topic(item)));
  if (intent === "local") hits = rows.filter((item) => /local|restaurant|nearby/.test(topic(item)));
  return hits.length ? hits[hits.length - 1].text : "";
}

function factSentence(hotel, corrections, intent) {
  const over = vettedSentence(corrections, hotel.id, intent);
  if (over) return over;
  if (intent === "wifi-name") return hotel.wifi?.network ? "The Wi-Fi network is " + hotel.wifi.network + "." : "The approved file has no Wi-Fi network name.";
  if (intent === "wifi-password") {
    if (hotel.wifi?.password) return "The Wi-Fi password is " + hotel.wifi.password + ".";
    return "The approved file has no Wi-Fi password." + (hotel.wifi?.notes ? " " + hotel.wifi.notes : "");
  }
  if (intent === "checkout") return hotel.checkOut?.time ? "Check-out is at " + hotel.checkOut.time + "." : "The approved file has no checkout time.";
  if (intent === "pets") {
    const policy = hotel.petPolicy;
    if (!policy || typeof policy.allowed !== "boolean") return "";
    if (!policy.allowed) return "Pets are not allowed.";
    const fee = policy.fee ? " The pet fee is " + policy.fee + "." : " The file lists no pet fee.";
    const size = policy.maxPounds ? " The size limit is " + policy.maxPounds + " pounds." : " The file lists no size limit.";
    return "Pets are allowed." + fee + size;
  }
  if (intent === "breakfast") {
    const meal = hotel.breakfastPolicy;
    if (!meal || !meal.hours) return "";
    const cost = meal.cost ? " Breakfast costs " + meal.cost + "." : "";
    return "Breakfast is " + meal.hours + " at " + meal.location + "." + cost;
  }
  if (intent === "parking") {
    const lot = hotel.parkingPolicy;
    if (!lot || typeof lot.available !== "boolean") return "";
    if (!lot.available) return "Parking is not available.";
    return "Parking is available at " + lot.location + ". The parking fee is " + lot.fee + ".";
  }
  if (intent === "late-checkout") {
    const late = hotel.lateCheckoutPolicy;
    if (!late || typeof late.allowed !== "boolean") return "";
    if (!late.allowed) return "Late checkout is not allowed.";
    return "Late checkout is allowed until " + late.cutoff + ". The late checkout fee is " + late.fee + ".";
  }
  if (intent.startsWith("amenity-")) {
    const key = intent.slice("amenity-".length);
    return hotel.amenityFacts && hotel.amenityFacts[key] ? hotel.amenityFacts[key] : "";
  }
  if (intent === "address") return hotel.directionsFacts && hotel.directionsFacts.address ? "The address is " + hotel.directionsFacts.address + "." : "";
  if (intent === "shuttle") return hotel.directionsFacts && hotel.directionsFacts.shuttle ? hotel.directionsFacts.shuttle : "";
  if (intent === "landmark") return hotel.directionsFacts && hotel.directionsFacts.landmark ? "The nearest landmark is " + hotel.directionsFacts.landmark + "." : "";
  if (intent === "directions") {
    const facts = hotel.directionsFacts;
    if (!facts || (!facts.address && !facts.shuttle && !facts.landmark)) return "";
    return [facts.address ? "The address is " + facts.address + "." : "", facts.shuttle || "", facts.landmark ? "The nearest landmark is " + facts.landmark + "." : ""].filter(Boolean).join(" ");
  }
  if (intent === "local") {
    const spots = Array.isArray(hotel.localSpots) ? hotel.localSpots : [];
    if (!spots.length) return "";
    return spots.map((spot) => "Nearby: " + spot.name + (spot.detail ? ", " + spot.detail : "") + ".").join(" ");
  }
  return "";
}

function dedupeParts(parts) {
  const seen = new Set();
  const out = [];
  for (const part of parts) {
    for (const sentence of String(part || "").split(/(?<=[.!?])\s+/)) {
      const text = sentence.replace(/\s+/g, " ").trim();
      if (!text || seen.has(text)) continue;
      seen.add(text);
      out.push(text);
    }
  }
  return out;
}

export function approvedStayFacts(hotel, question, corrections) {
  const read = interpretStay(question);
  if (!read.supply.length) return null;
  const gaps = read.gaps.filter(Boolean);
  const missingNote = { pets: "The approved file has no pet policy.", breakfast: "The approved file has no breakfast fact.", parking: "The approved file has no parking fact.", "late-checkout": "The approved file has no late checkout policy.", "amenity-pool": "The approved file has no pool fact.", "amenity-gym": "The approved file has no gym fact.", "amenity-laundry": "The approved file has no laundry fact.", "amenity-ice": "The approved file has no ice fact.", "amenity-elevator": "The approved file has no elevator fact.", address: "The approved file has no address.", shuttle: "The approved file has no airport shuttle fact.", landmark: "The approved file has no landmark.", directions: "The approved file has no directions.", local: "The approved file has no nearby places." };
  const parts = [];
  for (const intent of read.supply) {
    const line = factSentence(hotel, corrections, intent);
    if (line) parts.push(line);
    else if (missingNote[intent]) gaps.push(missingNote[intent]);
  }
  if (!parts.length) return null;
  const text = dedupeParts([...parts, ...gaps]).join(" ");
  return {
    source: gaps.length ? "partial" : "approved-facts",
    label: "Approved hotel facts, not model-generated.",
    text,
    intents: read.intents,
    gaps,
  };
}

export function gradeFactAnswer({ hotel, question, raw, corrections, expect }) {
  const resolved = resolveTurn({ hotel, question, raw: raw || "", corrections });
  const text = resolved.resolution.text || "";
  const missing = (expect.mustInclude || []).filter((part) => !text.includes(part));
  const forbidden = (expect.mustNot || []).filter((part) => text.includes(part));
  const supplied = resolved.resolution.source === "approved-facts" || resolved.resolution.source === "partial";
  let bucket = "incorrect";
  if (expect.bucket === "safety") bucket = resolved.resolution.source === "safety" && !missing.length && !forbidden.length ? "safety" : "incorrect";
  else if (expect.bucket === "withheld") bucket = supplied || forbidden.length ? "incorrect" : "withheld";
  else if (expect.bucket === "complete") bucket = resolved.resolution.source === "approved-facts" && !missing.length && !forbidden.length ? "complete" : "incorrect";
  else if (expect.bucket === "partial") bucket = resolved.resolution.source === "partial" && !missing.length && !forbidden.length ? "partial" : "incorrect";
  return { bucket, source: resolved.resolution.source, text, raw: resolved.raw, intents: resolved.resolution.intents || [], missing, forbidden, label: resolved.resolution.label };
}

export function resolveTurn({ hotel, question, raw, corrections }) {
  const turn = decideTurn(hotel, question, { now: new Date("2026-11-08T16:00:00Z") });
  const preserved = String(raw || "");
  if (turn.intent === "emergency") {
    return {
      raw: preserved,
      contradictions: [],
      resolution: { source: "safety", label: "Deterministic safety. Not the model.", text: String(turn.text || "").replaceAll("**", "") },
    };
  }
  const read = interpretStay(question);
  const facts = approvedStayFacts(hotel, question, corrections);
  if (facts) return { raw: preserved, contradictions: [], resolution: facts };
  const missingNote = { pets: "The approved file has no pet policy.", breakfast: "The approved file has no breakfast fact.", parking: "The approved file has no parking fact.", "late-checkout": "The approved file has no late checkout policy.", "amenity-pool": "The approved file has no pool fact.", "amenity-gym": "The approved file has no gym fact.", "amenity-laundry": "The approved file has no laundry fact.", "amenity-ice": "The approved file has no ice fact.", "amenity-elevator": "The approved file has no elevator fact.", address: "The approved file has no address.", shuttle: "The approved file has no airport shuttle fact.", landmark: "The approved file has no landmark.", directions: "The approved file has no directions.", local: "The approved file has no nearby places." };
  const missing = read.supply.filter((intent) => missingNote[intent] && !factSentence(hotel, corrections, intent));
  if (!facts && missing.length) {
    return { raw: preserved, contradictions: [], resolution: { source: "withheld", label: "No approved fact.", text: missing.map((intent) => missingNote[intent]).join(" ") } };
  }
  if (read.intents.includes("outing-boundary") || read.intents.includes("checkin-boundary")) {
    return { raw: preserved, contradictions: [], resolution: { source: "withheld", label: "Outside Wi-Fi and checkout.", text: "This question is not a Wi-Fi name, password, or end-of-stay time." } };
  }
  const contradictions = [...findContradictions(hotel, preserved, question), ...findMissing(hotel, question, preserved)];
  const approved = approvedFor(hotel.id, question, corrections)[0] || null;
  if (contradictions.length && approved) {
    return { raw: preserved, contradictions, resolution: { source: "approved-correction", label: "Approved correction. Not the model.", text: approved.text } };
  }
  if (contradictions.length) {
    return { raw: preserved, contradictions, resolution: { source: "withheld", label: "Withheld. Not a front-desk script.", text: contradictions.map((item) => item.detail).join(" ") } };
  }
  return { raw: preserved, contradictions, resolution: { source: "model", label: "Model text.", text: preserved } };
}

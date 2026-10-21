// Hotel-facts-first engine: deterministic intents answered straight from the hotel JSON.
// Returns { intent, kind: "fact" | "fallback" | "emergency", text, call } or null (no intent matched).
import { parseRange, isOpen, localMinutes, fmtMinutes } from "./hours.js";

export function normalize(q) {
  return ` ${String(q).toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/wi-?\s?fi/g, "wifi")
    .replace(/check[\s-]?out/g, "checkout")
    .replace(/check[\s-]?in/g, "checkin")
    .replace(/[^a-z0-9':$ ]+/g, " ")
    .replace(/\s+/g, " ")} `;
}

const desk = (h) => `${h.frontDesk.inRoom}${h.frontDesk.phoneTel ? `, or call **${h.frontDesk.phoneDisplay}**` : ""}`;
const fallback = (h, intent, topic) => ({
  intent, kind: "fallback", call: true,
  text: `I don't have ${topic} details on file for ${h.name}, and I'd rather not guess. The front desk can help: ${desk(h)}.`,
});
const fact = (intent, text, call = false) => ({ intent, kind: "fact", text, call });

function diningStatus(h, mins) {
  const lines = [];
  for (const d of h.dining) {
    const ranges = [...Object.entries(d.meals || {}).map(([k, v]) => [k, v]), ...(d.hours ? [["open", d.hours]] : [])];
    const open = ranges.filter(([, v]) => isOpen(parseRange(v), mins));
    const hrs = ranges.map(([k, v]) => (k === "open" ? v : `${k} ${v}`)).join("; ");
    lines.push(`• **${d.name}**${open.length ? " (open now)" : ""}: ${d.type}. ${hrs}.${d.location ? ` ${d.location}.` : ""}`);
  }
  return lines;
}

const RULES = [
  ["emergency", /\b(fire|smoke alarm|heart attack|can'?t breathe|not breathing|bleeding|unconscious|emergency|911|ambulance|overdose|chest pain|intruder|break(ing)? in|assault(ed)?|gas leak|seizure|allergic|allergy attack|anaphyla\w*|epipen|stroke|poison\w*|choking|collapsed|fainted|unresponsive|not responding|passed out|can'?t wake)\b/,
    (h) => ({ intent: "emergency", kind: "emergency", call: true, text: `**If this is an emergency, call 911 now.** Then alert the front desk: ${desk(h)}.` })],
  ["locked_out", /\b(lock(ed)? out|lost (my )?(room )?key|key ?card|keycard|room key|door (won'?t|will not|doesn'?t) (open|unlock)|can'?t get (in|into))/,
    (h) => fact("locked_out", `Sorry about that! The front desk can make you a new key right away. Head to the lobby or call: ${desk(h)}. Bring your ID.`, true)],
  ["noise", /\b(noise|noisy|loud|party next door|neighbors?|can'?t sleep|music (is )?(too )?loud|screaming|yelling)\b/,
    (h) => fact("noise", `I'm sorry it's noisy.${h.quietHours ? ` Quiet hours are **${h.quietHours}**.` : ""} The front desk can take care of it: ${desk(h)}.`, true)],
  ["late_checkout", /\b(late checkout|checkout late|later checkout|stay (a (bit|little) )?later|extend (my )?stay|extra (hour|night)|leave late)\b/,
    (h) => h.checkOut.late ? fact("late_checkout", `Standard checkout is **${h.checkOut.time}**. ${h.checkOut.late} ${desk(h)}.`, true)
      : fact("late_checkout", `Standard checkout is **${h.checkOut.time}**. For late checkout, ask the front desk (it depends on availability): ${desk(h)}.`, true)],
  ["early_checkin", /\b(early checkin|checkin early|arrive early|drop (off )?(my )?(bags|luggage)|store (my )?(bags|luggage)|luggage)\b/,
    (h) => fact("early_checkin", `Check-in is at **${h.checkIn.time}**. For early check-in or luggage storage, ask the front desk: ${desk(h)}.`, true)],
  ["checkout", /\b(checkout|what time .*(leave|out)|when (do|should|must) i (have to |need to )?leave|out of (the|my) room)\b/,
    (h) => fact("checkout", `Checkout is at **${h.checkOut.time}**.${h.checkOut.late ? ` ${h.checkOut.late}` : " Ask the front desk if you need more time."}`)],
  ["checkin", /\b(checkin|arrival time|when can i (get|go) (in|into) (my|the) room)\b/,
    (h) => fact("checkin", `Check-in starts at **${h.checkIn.time}**. Checkout is at ${h.checkOut.time}.`)],
  ["wifi", /\b(wifi|internet|wireless|network|password|get online|connect)\b/,
    (h) => fact("wifi", `Wi-Fi network: **${h.wifi.network}**\n\n${h.wifi.password ? `Password: **${h.wifi.password}**` : ""}${h.wifi.notes ? (h.wifi.password ? "\n\n" : "") + h.wifi.notes : ""}`)],
  ["room_service", /\b(room service|deliver(ed)? (food )?to (my )?room|order food)\b/,
    (h, now) => h.roomService ? fact("room_service", h.roomService) : fallback(h, "room_service", "room service")],
  ["breakfast", /\b(breakfast|brunch|morning (food|meal))\b/,
    (h) => { const b = h.dining.filter((d) => d.meals?.breakfast);
      return b.length ? fact("breakfast", b.map((d) => `Breakfast is at **${d.name}**, **${d.meals.breakfast}**${d.location ? ` (${d.location})` : ""}.`).join("\n\n")) : fallback(h, "breakfast", "breakfast"); }],
  ["late_food", /\b((hungry|food|eat|snack|starving)\b.*\b(now|late|tonight|midnight|right now|[123] ?am)|anything (still )?open|what'?s open)\b/,
    (h, now) => { const m = localMinutes(now); const lines = diningStatus(h, m); const anyOpen = lines.some((l) => l.includes("(open now)"));
      return fact("late_food", `It's **${fmtMinutes(m)}** here. ${anyOpen ? "Here's what's open on-site right now:" : "The on-site dining is closed right now. Here are the hours:"}\n\n${lines.join("\n\n")}${anyOpen ? "" : `\n\nFor late-night snacks, the front desk may be able to suggest something: ${desk(h)}.`}`, !anyOpen); }],
  ["dining", /\b(restaurant|dinner|lunch|eat|food|hungry|bar|drink|drinks|cocktail|cocktails|dining|lounge|speakeasy|tea)\b/,
    (h, now) => fact("dining", `Here's dining at ${h.name}:\n\n${diningStatus(h, localMinutes(now)).join("\n\n")}`)],
  ["parking", /\b(park|parking|valet|garage|my car)\b/, (h) => h.parking ? fact("parking", h.parking) : fallback(h, "parking", "parking")],
  ["pool", /\b(pool|swim|swimming|hot tub|jacuzzi)\b/, (h) => h.pool ? fact("pool", h.pool) : fallback(h, "pool", "pool")],
  ["gym", /\b(gym|fitness|workout|work out|exercise|treadmill|weights)\b/, (h) => h.fitness ? fact("gym", h.fitness) : fallback(h, "gym", "gym or fitness")],
  ["housekeeping", /\b(towels?|housekeeping|clean (my )?room|toiletr\w*|toothbrush|toothpaste|shampoo|soap|pillows?|blankets?|sheets|iron|razor|hair ?dryer|crib|extra)\b/,
    (h) => fact("housekeeping", `${h.housekeeping ? h.housekeeping + " " : ""}I can't place requests yet, but the front desk can send that up: ${desk(h)}.`, true)],
  ["front_desk", /\b(front desk|reception|phone number|call (the )?(hotel|desk|someone)|talk to|speak (to|with)|a (real )?(person|human)|staff|manager|concierge desk)\b/,
    (h) => fact("front_desk", `You can reach the front desk any time: ${desk(h)}.`, true)],
  ["directions", /\b(address|directions|how do i get|where is the hotel|where are you|located|location|airport|uber|taxi)\b/,
    (h) => h.location.address || h.location.directions
      ? fact("directions", [h.location.address && `${h.name} is at **${h.location.address}**.`, h.location.directions].filter(Boolean).join(" "))
      : fact("directions", `${h.name} is on **${h.location.area}** in ${h.location.city}. For turn-by-turn directions or a taxi, the front desk can help: ${desk(h)}.`, true)],
  ["local_recs", /\b(nearby|near here|near by|recommend\w*|things to do|around here|walking distance|local|attractions?|what to do|places to)\b/,
    (h) => h.localRecommendations?.length
      ? fact("local_recs", `A few favorites nearby:\n\n${h.localRecommendations.map((r) => `• **${r.name}** (${r.distance}): ${r.description}${r.hours ? ` ${r.hours}.` : ""}`).join("\n\n")}`)
      : fallback(h, "local_recs", "local recommendation")],
  ["amenities", /\b(amenit\w*|facilities|what does the hotel (have|offer)|what do you (have|offer))\b/,
    (h) => fact("amenities", `${h.name} offers:\n\n${h.amenities.map((a) => `• ${a}`).join("\n\n")}`)],
  ["pets", /\b(pets?|dogs?|cats?|pet friendly)\b/, (h) => h.pets ? fact("pets", h.pets) : fallback(h, "pets", "pet policy")],
  ["smoking", /\b(smoke|smoking|smoker|vape|vaping|cigarettes?|cigars?)\b/, (h) => h.smoking ? fact("smoking", h.smoking) : fallback(h, "smoking", "smoking policy")],
  ["quiet_hours", /\b(quiet hours?)\b/, (h) => h.quietHours ? fact("quiet_hours", `Quiet hours are **${h.quietHours}**.`) : fallback(h, "quiet_hours", "quiet hours")],
  ["maintenance", /\b(broken|not working|doesn'?t work|won'?t work|leak\w*|clogged|no hot water|hot water|air condition\w*|a ?c|heat(er|ing)?|thermostat|tv|remote|light bulb|toilet)\b/,
    (h) => fact("maintenance", `Sorry about that. I can't send maintenance myself, but the front desk can get someone to you: ${desk(h)}.`, true)],
  ["thanks", /^ (thanks?|thank you|thx|ty|great|perfect|awesome|ok(ay)?)( (so much|you|very much))?[ !.]*$/, (h) => fact("thanks", "You're welcome! Enjoy your stay. I'm here any time.")],
  ["greeting", /^ (hi|hello|hey|good (morning|evening|afternoon|night))( there)?[ !.]*$/, (h) => fact("greeting", `Hello! I'm your private concierge for ${h.name}. Ask me about checkout, Wi-Fi, dining, parking, or anything about your stay.`)],
];

// Second pass: synonym lexicon for everyday phrasings the strict rules miss. Highest score wins (ties keep list order).
const SOFT = [
  ["emergency", ["collapsed", "fainted", "passed out", "injured", "hurt", "choking", "police", "unsafe", "fight", "not responding"], 5],
  ["locked_out", ["card inside", "left my card", "left my key", "locked", "key"], 2],
  ["late_checkout", ["keep the room", "till 1", "till 2", "till 3", "until 1", "until 2", "until 3", "extra time", "later checkout"], 2],
  ["checkout", ["vacate", "be out", "gotta be out", "sleep in", "departure", "leave by", "out by"], 1],
  ["checkin", ["room become available", "room ready", "room be ready", "become available", "arrive", "arriving", "get my room"], 1],
  ["wifi", ["internets", "signal", "online", "laptop", "wi fi", "web"], 1],
  ["breakfast", ["buffet", "morning meal", "coffee", "pancakes", "eggs"], 1],
  ["late_food", ["grab a bite", "bite", "snack", "munchies", "midnight snack", "in the morning"], 1],
  ["housekeeping", ["toilet paper", "tissues", "more pillows", "bring up", "fresh", "clean sheets", "trash", "garbage", "robe", "slippers"], 1],
  ["maintenance", ["ac", "air", "hot water", "shower", "fix", "repair", "maintenance", "broken"], 1],
  ["front_desk", ["lobby", "wake up call", "wakeup call", "wake-up", "operator", "reach"], 1],
  ["parking", ["truck", "vehicle", "suv", "rv", "motorcycle", "leave my car"], 1],
  ["noise", ["partying", "party", "hallway", "slamming", "barking"], 1],
  ["directions", ["street", "what road", "address", "where are you", "gps"], 1],
  ["local_recs", ["bbq", "barbecue", "best", "in town", "brewery", "museum", "sightseeing", "live music", "downtown", "shopping"], 1],
  ["pets", ["puppy", "animal", "service animal", "kitten"], 1],
];
const handlers = Object.fromEntries(RULES.map(([name, , fn]) => [name, fn]));
function softMatch(q) {
  let best = null, bestScore = 0;
  for (const [intent, terms, w] of SOFT) {
    const score = terms.filter((t) => q.includes(` ${t} `) || q.includes(` ${t}s `) || q.includes(` ${t}?`)).length * w;
    if (score > bestScore) { best = intent; bestScore = score; }
  }
  return best;
}

export function matchIntent(hotel, question, now = new Date()) {
  const q = normalize(question);
  for (const [, re, fn] of RULES) if (re.test(q)) return fn(hotel, now);
  const soft = softMatch(q);
  return soft ? { ...handlers[soft](hotel, now), matchedBy: "lexicon" } : null;
}

// Questions that look hotel-specific; if no fact backs them, don't let the model guess.
export const HOTEL_SPECIFIC = /\b(do you have|does the hotel|is there an?|are there|can i (get|have|order|borrow|book)|where (is|are|can)|what time|how much|price|cost|open|close|hours|spa|shuttle|laundry|business center|elevator|ice|vending|atm|safe|minibar|balcony|reservation|book|room)\b/;

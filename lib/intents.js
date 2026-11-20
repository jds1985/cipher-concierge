// Hotel-facts-first engine: deterministic intents answered straight from the hotel JSON.
// Returns { intent, kind: "fact" | "fallback" | "emergency", text, call } or null (no intent matched).
import { foodQuery, recLine, cap } from "./food.js";
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

// Keep letters, including Spanish, and drop accents so "desmayó" still matches.
function fold(q) {
  return String(q || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[’`]/g, "'")
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function loosen(q) {
  let s = fold(q);
  s = s.replace(/(\w)\1{2,}/g, "$1$1");
  s = s.replace(/\b(cant|cannot)\b/g, "can't");
  s = s.replace(/\blabour\b/g, "labor");
  s = s.replace(/\bpregnent\b/g, "pregnant");
  s = s.replace(/\bbreking\b/g, "breaking");
  s = s.replace(/\bbrek\b/g, "break");
  s = s.replace(/\bseizuer\b|\bseisure\b|\bseizre\b/g, "seizure");
  s = s.replace(/\boverdoes\b|\boverdoss\b/g, "overdose");
  s = s.replace(/\bunconsious\b|\bunconcious\b|\bunconscous\b/g, "unconscious");
  return s.replace(/\s+/g, " ").trim();
}

// Pull harmless phrases out before looking for danger, so "fire pit" is not a fire.
function stripBenign(q) {
  return q
    .replace(/\bfire\s*pits?\b/g, " ")
    .replace(/\bfireplace\b/g, " ")
    .replace(/\b(?:my |the )?(?:phone|battery|charger) is dying\b/g, " ")
    .replace(/\bdying to\b/g, " ")
    .replace(/\bsmoked (?:salmon|meat|fish|trout|bacon)\b/g, " ")
    .replace(/\bbreak(?:ing)? in (?:my |the |these |those )?(?:new )?shoes\b/g, " ")
    .replace(/\bfall foliage\b/g, " ")
    .replace(/\bfall colou?rs?\b/g, " ")
    .replace(/\blabor day\b/g, " ")
    .replace(/\bfell asleep\b/g, " ")
    .replace(/\bfall(?:ing)? asleep\b/g, " ")
    .replace(/\bfell in love\b/g, " ")
    .replace(/\bnight fell\b/g, " ")
    .replace(/\bprices fell\b/g, " ")
    .replace(/\btemperature fell\b/g, " ")
    .replace(/\bshot glasses?\b/g, " ")
    .replace(/\bflu shots?\b/g, " ")
    .replace(/\bshot of (?:espresso|coffee|whiskey|tequila|vodka|wine)\b/g, " ")
    .replace(/\bsteak knives?\b/g, " ")
    .replace(/\bknife and fork\b/g, " ")
    .replace(/\bhair\s*cuts?\b/g, " ")
    .replace(/\b(?:glue|nail|water|spray|toy) guns?\b/g, " ")
    .replace(/\bbutter knives?\b/g, " ")
    .replace(/\bgive it a shot\b/g, " ")
    .replace(/\b(?:a )?long shots?\b/g, " ")
    .replace(/\bone shot\b/g, " ")
    .replace(/\bfighting with the (?:tv |television )?remote\b/g, " ")
    .replace(/\bpeleando con el control(?: remoto)?\b/g, " ")
    .replace(/\bcrashing for the night\b/g, " ")
    .replace(/\bcrashed early\b/g, " ")
    .replace(/\bran out of\b/g, " ")
    .replace(/\bran into (?:a |my |an old )?friend\b/g, " ")
    .replace(/\b(?:price|prices|rate|rates|cost|costs).{0,15}shooting up\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SMOKING_POLICY = /\b(can i smoke|may i smoke|smoking rooms?|smoke outside|where (can|do) i smoke|is smoking|allowed to smoke|vape|vaping|cigarettes?|cigars?)\b/;
const SMOKE_EMERGENCY = /\b(smell(?:s|ing|ed)?(?: of| like)? smoke|see smoke|saw smoke|smoke in the (hall|hallway|room|corridor)|smoke in my room|filling with smoke|full of smoke|smoke alarm|fire alarm|alarm going off|smoke coming)\b/;
const SUICIDE = /\b(suicid\w*|kill (?:my|him|her|them)self|kill myself|want(?:s|ed)? to (?:die|kill myself)|end (?:my|his|her) life|quiero morir|quiero morirme|me quiero matar|suicidarme|no quiero vivir|don't want to live|dont want to live)\b/;
const PERSON = "(?:someone|somebody|he|she|they|i|we|my |our |the |a |an )?(?:husband|wife|mom|dad|mother|father|grandma|grandpa|kid|child|baby|son|daughter|friend|guest|man|woman|boy|girl|person|people)";
const SPANISH_EMERGENCY = /\b(no puedo respirar|no puede respirar|no respiro|no respira|infarto|dolor de pecho|ataque al corazon|sangre|sangrando|sangrado|convulsion|convulsiones|se desmayo|desmayo|desmaye|me desmayo|incendio|hay fuego|un fuego|fuego en|huele a humo|hay humo|lleno de humo|vi humo|se esta ahogando|se ahoga|esta ahogando|ahogando|ambulancia|inconsciente|entro a mi|entraron a mi|alguien entro|me robaron|nos robaron|hay un robo|un robo|de parto|romp(?:io|ieron) (?:la |el )?fuente|sobredosis|un arma|con arma|pistola|navaja|no despierta|no se mueve|no responde|alarma de gas|estan siguiendo|me sigue|nos siguen|apunal\w*|acuchill\w*|electrocut\w*|se perdio)\b/;
const NOT_MOVING = /\b(?:someone|somebody|he|she|they|husband|wife|mom|dad|mother|father|grandma|grandpa|kid|child|baby|son|daughter|friend|guest|man|woman|boy|girl|person|people).{0,40}(?:isn't|isnt|is not|ain't|aint|not) moving|\bhelp .{0,40}(?:isn't|isnt|not) moving/i;
// Vehicle hits and on-property danger. Checked before parking, pets, smoking policy, and the model.
const INCIDENT = new RegExp([
  "(?:ran|run|runs|running) over",
  "hit by (?:a |the |an )?(?:car|truck|vehicle|bus|van|suv|taxi)",
  "(?:car|truck|vehicle|bus|van|suv) (?:crash|accident|wreck)",
  "hit and run", "hit n run",
  "struck (?:a |the |my |our |his |her )?(?:person|child|kid|dog|pet|man|woman|guest|boy|girl|baby)",
  "(?:vehicle|car|truck|bus|van|suv) hit",
  "(?:crashed|crash) (?:in|into) (?:the |a )?(?:parking|garage|lot)",
  "(?:someone|somebody|a car|a truck|car|truck|vehicle).{0,30}crashed",
  "doing drugs", "using drugs", "used drugs", "doin drugs", "on drugs",
  "drugs in (?:the )?(?:stair|hall|hallway|room|parking|lobby|bathroom)",
  "smoking (?:crack|meth|heroin|fentanyl|coke)",
  "(?:doing|using|smoking) crack",
  "\\b(?:meth|heroin|fentanyl)\\b",
  "shooting up", "shootin up",
  "(?:needle|syringe)s? (?:in|on) (?:the |a |my )?(?:hall|hallway|stair|room|bathroom|parking|lobby|floor)",
  "\\bsyringes?\\b",
  "dealing drugs", "selling drugs", "drug deal",
  "\\b(?:fight|fighting|brawl|brawling)\\b",
  "vandali[sz]\\w*",
  "trespass\\w*",
  "lurking",
  "harass\\w*",
  "peep(?:ing|ed|er)",
  "exposing (?:himself|herself|themselves|themself)",
  "banging on (?:my |the |our )?(?:door|window)",
  "(?:yelling|screaming) threats?",
  "(?:someone|somebody|he|she|a man|a woman|people).{0,30}(?:yelling|screaming)",
  "steal(?:ing)? (?:my |the |a |our )?(?:car|truck|purse|bag|luggage|wallet)",
  "stole (?:my |the |our |his |her )?(?:car|truck|purse|bag|luggage|wallet)",
  "broke into (?:my |the |our |a )?(?:car|truck|vehicle)",
].join("|"), "i");
const SPANISH_INCIDENT = /\b(atropell\w*|accidente de (?:carro|auto|coche|vehiculo|transito)|usando drogas|vendiendo drogas|drogas en|peleando|hay una pelea|robando (?:el |mi |un |su )?(?:carro|auto|coche)|robaron (?:el |mi |un |su )?(?:carro|auto|coche)|(?:carro|auto|coche|camion).{0,24}choc(?:o|aron)|choc(?:o|aron).{0,24}(?:carro|auto|coche|camion|perro|nino|nina|persona))\b/;
const DANGER = new RegExp([
  "heart attack", "chest pain", "chest hurts", "clutched (?:his|her|their|my) chest", "grabbed (?:his|her|their) chest",
  "can't breathe", "not breathing", "choking", "seizure", "overdose", "too many pills", "stroke",
  "drowning", "drowned", "heavy bleeding", "bleeding a lot", "bleeding heavily", "\\bbleeding\\b", "\\bbleed(?:s|ing)?\\b",
  "unconscious", "unresponsive", "not responding", "passed out", "fainted", "collapsed", "can't wake", "not waking", "won't wake", "wont wake",
  "gas leak", "smell(?:s|ing)? gas", "gas smell", "carbon monoxide", "\\bco alarm\\b", "\\bco detector\\b",
  "ambulance", "assault(?:ed)?", "intruder", "threatening me", "threatening us", "someone threatening", "is threatening",
  "attacking", "being attacked", "\\battacked\\b", "on fire", "there is a fire", "there's a fire",
  "fell down", "falling down", "fall down", "fell over", "fell off", "fell on",
  "tripped and", "tripped on", "tripped over", "(?:someone|he|she|i|we|man|woman|guest|kid) tripped",
  "just fell", "fell in", "fell by", "fell near", "fell getting", "\\bfell\\b",
  "went under", "didn't come up", "didnt come up",
  "\\bfel (?:down|in|by|on|near|off)\\b", "just fel",
  "(?:someone|he|she|they|man|woman|guest|husband|wife|kid|child|boy|girl|grandma|grandpa|dad|mom|person|friend) fell",
  "i fell(?! for\\b)",
  "hit (?:his|her|their|my) head", "broken bone", "broke (?:his|her|their|my) (?:leg|arm|hip|ankle|wrist|bone|neck|head)",
  "can't get up", "can't stand",
  "break(?:ing|s|ed)? into", "broke into", "broken into", "breaking in", "trying to break in", "break in happening",
  "went down hard", "ate it on the", "isn't waking", "isnt waking", "outlet is sparking",
  "someone(?: is|'s| was)? in my room",
  "(?:man|guy|woman|people|person|stranger|he|she|someone).{0,30}in my room",
  "\\bgun\\b", "gunshot", "\\bknife\\b", "stabbed", "stabbing",
  "(?:got|was|been|they|he|she) shot", "shot (?:me|him|her|them|us)",
  "\\brobbed\\b", "robbery", "domestic violence", "kidnapp(?:ed|ing)?",
  "being followed", "followed me", "following me",
  "(?:child|kid|daughter|son|baby) (?:is |went )?missing", "lost (?:my |our )?(?:child|kid|daughter|son|baby)",
  "(?:in|into) labor", "going into labor", "been into labor", "gone into labor", "contractions?", "water broke", "giving birth",
  "pregnant.{0,40}(?:pain|bleeding|bleed|cramp|hurt)", "(?:pain|bleeding).{0,30}pregnant",
  "allergic reaction", "anaphyla\\w*", "epipen", "throat (?:is )?swell\\w*", "swelling throat",
  "diabetic", "low blood sugar", "asthma attack", "poison(?:ed|ing)?",
  "electrocuted", "electric shock", "explosion", "trapped in (?:the |an )?elevator",
  "flood(?:ing|ed)?.{0,30}electric", "electric.{0,20}flood",
  "cut (?:my|his|her|their) (?:hand|arm|leg|head|finger)", "i(?:'m| am) cut\\b",
].join("|"), "i");

function spanishFall(q) {
  if (!/\b(?:se cayo|se cayeron|cayo por|cayo de|me cai|se callo)\b/.test(q)) return false;
  if (/\b(?:wifi|internet|telefono|llamada|conexion|senal|red)\b/.test(q)) return false;
  return true;
}

function emergencyKind(question) {
  const q = stripBenign(loosen(question));
  const suicide = SUICIDE.test(q);
  const spanish = SPANISH_EMERGENCY.test(q) || spanishFall(q) || SPANISH_INCIDENT.test(q);
  if (suicide) return { lang: /\b(quiero|morir|matar|suicidarme)\b/.test(q) ? "spanish" : "english", suicide: true };
  if (spanish) return { lang: "spanish", suicide: false };
  if (INCIDENT.test(q)) return { lang: "english", suicide: false };
  if (SMOKING_POLICY.test(q)) return null;
  if (SMOKE_EMERGENCY.test(q) || DANGER.test(q) || NOT_MOVING.test(q) || /\b911\b/.test(q)) return { lang: "english", suicide: false };
  if (/\b(dying|smoke|smoking|smoker)\b/.test(q)) return null;
  if (/\bfire\b/.test(q) && !/\bfireplace\b/.test(q)) return { lang: "english", suicide: false };
  return null;
}

function emergencyAnswer(hotel, question) {
  const kind = emergencyKind(question);
  if (!kind) return null;
  const line = desk(hotel);
  const extra = kind.suicide ? " If you are thinking about suicide, you can also call or text 988." : "";
  const text = kind.lang === "spanish"
    ? `**Llame al 911 ahora.** Call 911 now.${extra} Then tell the front desk: ${line}.`
    : `**Call 911 now.**${extra} Then tell the front desk: ${line}.`;
  return { intent: "emergency", kind: "emergency", call: true, text };
}
const fallback = (h, intent, topic) => ({
  intent, kind: "fallback", call: true,
  text: `I don't have ${topic} details on file for ${h.name}, and I'd rather not guess. The front desk can help: ${desk(h)}.`,
});
const fact = (intent, text, call = false) => ({ intent, kind: "fact", text, call });

function diningStatus(h, mins) {
  const lines = [];
  for (const d of h.dining || []) {
    const ranges = [...Object.entries(d.meals || {}).map(([k, v]) => [k, v]), ...(d.hours ? [["open", d.hours]] : [])];
    const open = ranges.filter(([, v]) => isOpen(parseRange(v), mins));
    const hrs = ranges.map(([k, v]) => (k === "open" ? v : `${k} ${v}`)).join("; ");
    lines.push(`• **${d.name}**${open.length ? " (open now)" : ""}: ${d.type}. ${hrs}.${d.location ? ` ${d.location}.` : ""}`);
  }
  return lines;
}

function breakfastIncludedAnswer(h) {
  const b = h.breakfast;
  const diningB = (h.dining || []).filter((d) => d.meals?.breakfast);
  const included = b?.included ?? diningB.find((d) => d.included != null)?.included;
  const hours = b?.hours || diningB[0]?.meals?.breakfast;
  const loc = b?.location || diningB[0]?.location;
  if (included == null && !hours) return null;
  const parts = [];
  if (included === true) parts.push("Yes — breakfast **is included** with your stay.");
  else if (included === false) parts.push("Breakfast is **not included** in the room rate.");
  else parts.push("I don't have whether breakfast is included on file.");
  if (hours) parts.push(`Hours: **${hours}**${loc ? ` at ${loc}` : ""}.`);
  if (included == null) parts.push(`The front desk can confirm: ${desk(h)}.`);
  return fact("breakfast_included", parts.join(" "), included == null);
}

function wifiAnswer(h) {
  if (!h.wifi?.network) return fallback(h, "wifi", "Wi-Fi");
  // showPassword === false explicitly hides; undefined (file hotels) keeps prior behavior (show if present)
  const password =
    h.wifi?.showPassword === false ? null
    : h.wifi?.password || null;
  return fact("wifi", `Wi-Fi network: **${h.wifi.network}**\n\n${password ? `Password: **${password}**` : ""}${h.wifi.notes ? (password ? "\n\n" : "") + h.wifi.notes : ""}`);
}

function coffeeNearby(h) {
  const recs = (h.localRecommendations || []).filter((r) =>
    (r.cuisines || []).includes("coffee") || /\b(coffee|cafe|café|espresso)\b/i.test(`${r.name} ${r.description || ""}`)
  );
  if (recs.length) {
    return fact("coffee_nearby", `Coffee nearby:\n\n${recs.map((r) => `• **${r.name}** (${r.distance}): ${r.description}${r.hours ? ` ${r.hours}.` : ""}`).join("\n\n")}`);
  }
  return fallback(h, "coffee_nearby", "nearby coffee");
}

function barLounge(h, now) {
  const onSite = (h.dining || []).filter((d) =>
    d.kind === "bar" || /\b(bar|lounge|speakeasy|cocktail)\b/i.test(`${d.name} ${d.type || ""}`)
  );
  const nearby = (h.localRecommendations || []).filter((r) =>
    (r.cuisines || []).some((c) => ["bar", "cocktails"].includes(c)) || /\b(bar|lounge|pub|speakeasy)\b/i.test(`${r.name} ${r.description || ""}`)
  );
  if (!onSite.length && !nearby.length) return fallback(h, "bar_lounge", "bar or lounge");
  const mins = localMinutes(now);
  const lines = [];
  for (const d of onSite) {
    const hrs = d.hours || Object.entries(d.meals || {}).map(([k, v]) => `${k} ${v}`).join("; ");
    const open = d.hours && isOpen(parseRange(d.hours), mins);
    lines.push(`• **${d.name}** (on-site)${open ? " (open now)" : ""}: ${d.type || "Bar or lounge"}${hrs ? `. ${hrs}` : ""}${d.location ? `. ${d.location}` : ""}`);
  }
  for (const r of nearby) lines.push(`• **${r.name}** (${r.distance}): ${r.description}${r.hours ? ` ${r.hours}.` : ""}`);
  return fact("bar_lounge", `Bar & lounge options:\n\n${lines.join("\n\n")}`);
}

function matchFaq(h, q) {
  const faqs = h.faqs || [];
  if (!faqs.length) return null;
  const words = q.trim().split(/\s+/).filter((w) => w.length > 2);
  let best = null, bestScore = 0;
  for (const f of faqs) {
    const hay = normalize(f.q);
    const score = words.filter((w) => hay.includes(w)).length;
    if (score > bestScore) { best = f; bestScore = score; }
  }
  if (bestScore >= 2 || (bestScore >= 1 && words.length <= 3)) {
    return fact("faq", `**${best.q}**\n\n${best.a}`);
  }
  return null;
}

const RULES = [
  ["emergency", /\b(smoke alarm|heart attack|can'?t breathe|not breathing|bleeding|unconscious|emergency|911|ambulance|overdose|chest pain|intruder|assault(ed)?|gas leak|seizure|allergic|allergy attack|anaphyla\w*|epipen|stroke|poison\w*|choking|collapsed|fainted|unresponsive|not responding|passed out|can'?t wake)\b/,
    (h) => ({ intent: "emergency", kind: "emergency", call: true, text: `**If this is an emergency, call 911 now.** Then alert the front desk: ${desk(h)}.` })],
  ["locked_out", /\b(lock(ed)? out|lost (my )?(room )?key|key ?card|keycard|room key|door (won'?t|will not|doesn'?t) (open|unlock)|can'?t get (in|into))/,
    (h) => fact("locked_out", `Sorry about that! The front desk can make you a new key right away. Head to the lobby or call: ${desk(h)}. Bring your ID.`, true)],
  ["noise", /\b(noise|noisy|loud|party next door|neighbors?|can'?t sleep|music (is )?(too )?loud|screaming|yelling)\b/,
    (h) => fact("noise", `I'm sorry it's noisy.${h.quietHours ? ` Quiet hours are **${h.quietHours}**.` : ""} The front desk can take care of it: ${desk(h)}.`, true)],
  ["late_checkout", /\b(late checkout|checkout late|later checkout|stay (a (bit|little) )?later|extend (my )?stay|extra (hour|night)|leave late)\b/,
    (h) => {
      if (h.checkOut?.late && h.checkOut?.time) return fact("late_checkout", `Standard checkout is **${h.checkOut.time}**. ${h.checkOut.late} ${desk(h)}.`, true);
      if (h.checkOut?.late) return fact("late_checkout", `${h.checkOut.late} ${desk(h)}.`, true);
      if (h.checkOut?.time) return fact("late_checkout", `Standard checkout is **${h.checkOut.time}**. For late checkout, ask the front desk (it depends on availability): ${desk(h)}.`, true);
      return fallback(h, "late_checkout", "late checkout");
    }],
  ["early_checkin", /\b(early checkin|checkin early|arrive early|drop (off )?(my )?(bags|luggage)|store (my )?(bags|luggage)|luggage)\b/,
    (h) => h.checkIn?.time
      ? fact("early_checkin", `Check-in is at **${h.checkIn.time}**. For early check-in or luggage storage, ask the front desk: ${desk(h)}.`, true)
      : fallback(h, "early_checkin", "check-in")],
  ["checkout", /\b(checkout|what time .*(leave|out)|when (do|should|must) i (have to |need to )?leave|out of (the|my) room)\b/,
    (h) => h.checkOut?.time
      ? fact("checkout", `Checkout is at **${h.checkOut.time}**.${h.checkOut.late ? ` ${h.checkOut.late}` : " Ask the front desk if you need more time."}`)
      : fallback(h, "checkout", "checkout")],
  ["checkin", /\b(checkin|arrival time|when can i (get|go) (in|into) (my|the) room)\b/,
    (h) => {
      if (!h.checkIn?.time) return fallback(h, "checkin", "check-in");
      return h.checkOut?.time
        ? fact("checkin", `Check-in starts at **${h.checkIn.time}**. Checkout is at ${h.checkOut.time}.`)
        : fact("checkin", `Check-in starts at **${h.checkIn.time}**.`);
    }],
  ["wifi", /\b(wifi|internet|wireless|network|password|get online|connect)\b/,
    (h) => wifiAnswer(h)],
  ["room_service", /\b(room service|deliver(ed)? (food )?to (my )?room|order food)\b/,
    (h) => h.roomService ? fact("room_service", h.roomService) : fallback(h, "room_service", "room service")],
  // breakfast-included BEFORE general breakfast
  ["breakfast_included", /\b((is |does )?(breakfast|brunch).{0,40}\b(included|free|complimentary)\b|\b(included|free|complimentary)\b.{0,40}\b(breakfast|brunch)\b)/,
    (h) => breakfastIncludedAnswer(h) || fallback(h, "breakfast_included", "whether breakfast is included")],
  // coffee shop nearby BEFORE breakfast (so "coffee" soft-match doesn't steal it)
  ["coffee_nearby", /\b((coffee|cafe|café|espresso|latte).{0,30}\b(near|nearby|close|around|shop|place|spot)|\b(near|nearby|close|around).{0,20}\b(coffee|cafe|café))\b/,
    (h) => coffeeNearby(h)],
  ["breakfast", /\b(breakfast|brunch|morning (food|meal))\b/,
    (h) => {
      const b = (h.dining || []).filter((d) => d.meals?.breakfast);
      if (b.length) {
        const inc = h.breakfast?.included ?? b.find((d) => d.included != null)?.included;
        const extra = inc === true ? " Breakfast is included with your stay." : inc === false ? " Breakfast is not included in the room rate." : "";
        return fact("breakfast", b.map((d) => {
          const loc = (d.location || "").trim();
          const name = (d.name || "").trim();
          // Skip "(location)" when it duplicates the name (self-setup stores place as both).
          const locSuffix = loc && loc.toLowerCase() !== name.toLowerCase() ? ` (${loc})` : "";
          return `Breakfast is at **${d.name}**, **${d.meals.breakfast}**${locSuffix}.`;
        }).join("\n\n") + extra);
      }
      if (h.breakfast?.hours) {
        const inc = h.breakfast.included;
        const extra = inc === true ? " It is included with your stay." : inc === false ? " It is not included in the room rate." : "";
        return fact("breakfast", `Breakfast is **${h.breakfast.hours}**${h.breakfast.location ? ` at ${h.breakfast.location}` : ""}.${extra}`);
      }
      return fallback(h, "breakfast", "breakfast");
    }],
  ["late_food", /\b((hungry|food|eat|snack|starving)\b.*\b(now|late|tonight|midnight|right now|[123] ?am)|anything (still )?open|what'?s open)\b/,
    (h, now) => { const m = localMinutes(now); const lines = diningStatus(h, m); const anyOpen = lines.some((l) => l.includes("(open now)"));
      return fact("late_food", `It's **${fmtMinutes(m)}** here. ${anyOpen ? "Here's what's open on-site right now:" : "The on-site dining is closed right now. Here are the hours:"}\n\n${lines.join("\n\n") || "(none on file)"}${anyOpen ? "" : `\n\nFor late-night snacks, the front desk may be able to suggest something: ${desk(h)}.`}`, !anyOpen); }],
  // bar/lounge BEFORE general dining dump
  ["bar_lounge", /\b(bar|lounge|speakeasy|cocktails?|live music|drinks?\b.*\b(bar|lounge)|what time .*(lounge|bar) (close|open))\b/,
    (h, now) => barLounge(h, now)],
  ["dining", /\b(restaurant|dinner|lunch|eat|food|hungry|drink|drinks|dining|tea)\b/,
    (h, now) => fact("dining", `Here's dining at ${h.name}:\n\n${diningStatus(h, localMinutes(now)).join("\n\n") || `I don't have on-site dining listed. ${desk(h)}.`}`)],
  ["parking", /\b(park|parking|valet|garage|my car)\b/, (h) => h.parking ? fact("parking", h.parking) : fallback(h, "parking", "parking")],
  ["pool", /\b(pool|swim|swimming|hot tub|jacuzzi)\b/, (h) => h.pool ? fact("pool", h.pool) : fallback(h, "pool", "pool")],
  ["spa", /\b(spa|massage|sauna|steam room)\b/, (h) => h.spa ? fact("spa", h.spa) : fallback(h, "spa", "spa")],
  ["gym", /\b(gym|fitness|workout|work out|exercise|treadmill|weights)\b/, (h) => h.fitness ? fact("gym", h.fitness) : fallback(h, "gym", "gym or fitness")],
  ["housekeeping", /\b(towels?|housekeeping|clean (my )?room|toiletr\w*|toothbrush|toothpaste|shampoo|soap|pillows?|blankets?|sheets|iron|razor|hair ?dryer|crib|extra)\b/,
    (h) => fact("housekeeping", `${h.housekeeping ? h.housekeeping + " " : ""}Tap **Send to front desk** below and staff will bring it. Or call: ${desk(h)}.`, true)],
  ["front_desk", /\b(front desk|reception|phone number|call (the )?(hotel|desk|someone)|talk to|speak (to|with)|a (real )?(person|human)|staff|manager|concierge desk)\b/,
    (h) => fact("front_desk", `You can reach the front desk any time: ${desk(h)}.`, true)],
  ["directions", /\b(address|directions|how do i get|where is the hotel|where are you|located|location|airport|uber|taxi)\b/,
    (h) => h.location?.address || h.location?.directions
      ? fact("directions", [h.location.address && `${h.name} is at **${h.location.address}**.`, h.location.directions].filter(Boolean).join(" "))
      : fact("directions", `${h.name}${h.location?.area ? ` is on **${h.location.area}**` : ""}${h.location?.city ? ` in ${h.location.city}` : ""}. For turn-by-turn directions or a taxi, the front desk can help: ${desk(h)}.`, true)],
  ["local_recs", /\b(nearby|near here|near by|recommend\w*|things to do|around here|walking distance|local|attractions?|what to do|places to)\b/,
    (h) => h.localRecommendations?.length
      ? fact("local_recs", `A few favorites nearby:\n\n${h.localRecommendations.map((r) => `• **${r.name}** (${r.distance}): ${r.description}${r.hours ? ` ${r.hours}.` : ""}`).join("\n\n")}`)
      : fallback(h, "local_recs", "local recommendation")],
  ["amenities", /\b(amenit\w*|facilities|what does the hotel (have|offer)|what do you (have|offer))\b/,
    (h) => (h.amenities?.length ? fact("amenities", `${h.name} offers:\n\n${h.amenities.map((a) => `• ${a}`).join("\n\n")}`) : fallback(h, "amenities", "amenities"))],
  ["pets", /\b(pets?|dogs?|cats?|pet friendly)\b/, (h) => h.pets ? fact("pets", h.pets) : fallback(h, "pets", "pet policy")],
  ["smoking", /\b(smoke|smoking|smoker|vape|vaping|cigarettes?|cigars?)\b/, (h) => h.smoking ? fact("smoking", h.smoking) : fallback(h, "smoking", "smoking policy")],
  ["quiet_hours", /\b(quiet hours?)\b/, (h) => h.quietHours ? fact("quiet_hours", `Quiet hours are **${h.quietHours}**.`) : fallback(h, "quiet_hours", "quiet hours")],
  ["maintenance", /\b(broken|not working|doesn'?t work|won'?t work|leak\w*|clogged|no hot water|hot water|air condition\w*|a ?c|heat(er|ing)?|thermostat|tv|remote|light bulb|toilet)\b/,
    (h) => fact("maintenance", `Sorry about that. Tap **Send to front desk** below and staff will come fix it. Or call: ${desk(h)}.`, true)],
  ["thanks", /^ (thanks?|thank you|thx|ty|great|perfect|awesome|ok(ay)?)( (so much|you|very much))?[ !.]*$/, (h) => fact("thanks", "You're welcome! Enjoy your stay. I'm here any time.")],
  ["greeting", /^ (hi|hello|hey|good (morning|evening|afternoon|night))( there)?[ !.]*$/, (h) => fact("greeting", `Hello! I'm your private concierge for ${h.name}. Ask me about checkout, Wi-Fi, dining, parking, or anything about your stay.`)],
];

// Second pass: synonym lexicon. Removed bare "coffee" from breakfast so coffee shops route correctly.
const SOFT = [
  ["emergency", ["collapsed", "fainted", "passed out", "injured", "hurt", "choking", "police", "unsafe", "fight", "not responding"], 5],
  ["locked_out", ["card inside", "left my card", "left my key", "locked", "key"], 2],
  ["late_checkout", ["keep the room", "till 1", "till 2", "till 3", "until 1", "until 2", "until 3", "extra time", "later checkout"], 2],
  ["checkout", ["vacate", "be out", "gotta be out", "sleep in", "departure", "leave by", "out by"], 1],
  ["checkin", ["room become available", "room ready", "room be ready", "become available", "arrive", "arriving", "get my room"], 1],
  ["wifi", ["internets", "signal", "online", "laptop", "wi fi", "web"], 1],
  ["breakfast", ["buffet", "morning meal", "pancakes", "eggs"], 1],
  ["coffee_nearby", ["coffee shop", "cafe", "latte", "espresso"], 2],
  ["bar_lounge", ["happy hour", "nightcap", "draft beer", "wine bar"], 2],
  ["late_food", ["grab a bite", "bite", "snack", "munchies", "midnight snack", "in the morning"], 1],
  ["housekeeping", ["toilet paper", "tissues", "more pillows", "bring up", "fresh", "clean sheets", "trash", "garbage", "robe", "slippers"], 1],
  ["maintenance", ["ac", "air", "hot water", "shower", "fix", "repair", "maintenance", "broken"], 1],
  ["front_desk", ["lobby", "wake up call", "wakeup call", "wake-up", "operator", "reach"], 1],
  ["parking", ["truck", "vehicle", "suv", "rv", "motorcycle", "leave my car"], 1],
  ["noise", ["partying", "party", "hallway", "slamming", "barking"], 1],
  ["directions", ["street", "what road", "address", "where are you", "gps"], 1],
  ["local_recs", ["bbq", "barbecue", "best", "in town", "brewery", "museum", "sightseeing", "live music", "downtown", "shopping"], 1],
  ["pets", ["puppy", "animal", "service animal", "kitten"], 1],
  ["spa", ["massage", "facial", "hot stone"], 1],
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
  const emergency = emergencyAnswer(hotel, question);
  if (emergency) return emergency;
  const q = normalize(question);
  const fq = foodQuery(hotel.localRecommendations, q);
  if (fq) {
    if (fq.matches.length) return fact("local_recs", `${fq.cuisine ? `${cap(fq.cuisine)} options nearby` : "Restaurants nearby"}:\n\n${fq.matches.map((r) => `• ${recLine(r).replace(r.name, `**${r.name}**`)}`).join("\n\n")}`);
    if (fq.cuisine) return { intent: "local_recs", kind: "fallback", call: true, text: `I don't have ${/^[aeiou]/.test(fq.cuisine) ? "an" : "a"} ${fq.cuisine} restaurant listed nearby. The front desk may know more: ${desk(hotel)}.` };
    return fallback(hotel, "local_recs", "local restaurant");
  }
  for (const [, re, fn] of RULES) if (re.test(q)) return fn(hotel, now);
  const faq = matchFaq(hotel, q);
  if (faq) return faq;
  const soft = softMatch(q);
  return soft ? { ...handlers[soft](hotel, now), matchedBy: "lexicon" } : null;
}

// Questions that look hotel-specific; if no fact backs them, don't let the model guess.
export const HOTEL_SPECIFIC = /\b(do you have|does the hotel|is there an?|are there|can i (get|have|order|borrow|book)|where (is|are|can)|what time|how much|price|cost|open|close|hours|spa|shuttle|laundry|business center|elevator|ice|vending|atm|safe|minibar|balcony|reservation|book|room)\b/;

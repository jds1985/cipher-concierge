// Holdout paraphrases written AFTER the intent rules, never used to tune them. Prints which intent each lands on.
import { getHotel } from "../lib/hotels.js";
import { answer } from "../lib/answer.js";
const Q = [
  ["checkout", "how late can we sleep in before we gotta be out"], ["checkout", "what's the deadline to vacate the room"],
  ["wifi", "whats the code for the internets"], ["wifi", "my laptop can't find the hotel signal"],
  ["breakfast", "where's the morning buffet"], ["late_food", "any place to grab a bite at 2 in the morning"],
  ["housekeeping", "can someone bring up more pillows"], ["housekeeping", "we ran out of toilet paper"],
  ["locked_out", "left my card inside the room"], ["front_desk", "how do I reach the lobby"],
  ["parking", "is there somewhere to leave my truck overnight"], ["gym", "can I lift weights somewhere"],
  ["pool", "do you guys have a place to swim"], ["noise", "people partying in the hallway at 3am"],
  ["emergency", "someone collapsed in the hallway"], ["late_checkout", "could I keep the room till 2pm"],
  ["checkin", "when does my room become available"], ["directions", "what street are you on"],
  ["local_recs", "best bbq in town?"], ["dining", "is the restaurant open for supper"],
  ["pets", "is my puppy allowed"], ["housekeeping", "the AC is broken"], ["front_desk", "I need a wake up call at 6"],
  ["housekeeping", "no hot water in the shower"],
];
const h = getHotel("the-oliver"); let hit = 0;
for (const [want, q] of Q) {
  const r = await answer(h, [{ role: "user", content: q }], { askCipher: async () => ({ ok: false, reason: "skipped" }) });
  const ok = r.intent === want || (r.kind === "fallback" && r.call); // safe fallback counts as "acceptable", reported separately
  if (r.intent === want) hit++;
  console.log(`${r.intent === want ? "MATCH" : ok ? "SAFE-FALLBACK" : "WRONG"}\t${want}\t${r.intent}\t${q}`);
}
console.log(`exact intent ${hit}/${Q.length}`);

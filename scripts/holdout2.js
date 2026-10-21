// Holdout #2: written after the lexicon pass and run ONCE without tuning (honest generalization check).
import { getHotel } from "../lib/hotels.js";
import { answer } from "../lib/answer.js";
const Q = [
  ["checkout", "by what hour do we need to hand back the keys"], ["wifi", "is there free wireless and how do I log in"],
  ["breakfast", "do you serve food in the morning"], ["late_food", "where can I get something to eat this late"],
  ["housekeeping", "could you send up a couple more bath towels"], ["housekeeping", "we need more coffee pods"],
  ["locked_out", "my door card isnt opening the door"], ["front_desk", "who do I call for help"],
  ["parking", "where should I put my rental car"], ["gym", "is there a fitness room"],
  ["noise", "the people upstairs are stomping around"], ["emergency", "my kid is having an allergic reaction"],
  ["late_checkout", "any chance of a 1pm checkout"], ["checkin", "what time can I get into my room"],
  ["directions", "how far are you from the airport"], ["local_recs", "what is there to do around here tonight"],
  ["dining", "where can I get a cocktail"], ["pets", "do you allow dogs"], ["maintenance", "the toilet keeps running"],
  ["front_desk", "can I get a wake-up call"], ["smoking", "where can I go to smoke"], ["checkout", "do I need to stop by the desk when I leave"],
  ["wifi", "how do I connect my phone"], ["maintenance", "my room is freezing and the heat wont turn on"],
];
const Q_OLD = [
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
for (const _ of [0]) {}
const h = getHotel("the-oliver"); let hit = 0;
for (const [want, q] of Q) {
  const r = await answer(h, [{ role: "user", content: q }], { askCipher: async () => ({ ok: false, reason: "skipped" }) });
  const ok = r.intent === want || (r.kind === "fallback" && r.call); // safe fallback counts as "acceptable", reported separately
  if (r.intent === want) hit++;
  console.log(`${r.intent === want ? "MATCH" : ok ? "SAFE-FALLBACK" : "WRONG"}\t${want}\t${r.intent}\t${q}`);
}
console.log(`exact intent ${hit}/${Q.length}`);

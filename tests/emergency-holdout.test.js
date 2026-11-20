import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { matchIntent } from "../lib/intents.js";

const hotel = {
  name: "Holdout Hotel",
  frontDesk: { inRoom: "Dial 0", phoneDisplay: "(865) 555-0100", phoneTel: "+18655550100" },
  smoking: "Smoking is not allowed inside.",
  breakfast: { hours: "7:00 AM to 10:00 AM", included: true, location: "Pier Cafe" },
  pool: "The pool is on the roof.",
  wifi: { network: "Harbor-Guest" },
};

function score(file) {
  const data = JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));
  let emergency = 0, hit = 0, benign = 0, falseAlarm = 0;
  const misses = [];
  const alarms = [];
  for (const item of data.items) {
    const got = matchIntent(hotel, item.question)?.kind === "emergency";
    if (item.id.startsWith("emergency")) {
      emergency++;
      if (got) hit++;
      else misses.push(item.question);
    } else {
      benign++;
      if (got) {
        falseAlarm++;
        alarms.push(item.question);
      }
    }
  }
  return { emergency, hit, benign, falseAlarm, misses, alarms };
}

test("the frozen tuning split stays at full recall and no false alarms", () => {
  const result = score("./fixtures/emergency-tune-2026-11-20.json");
  assert.ok(result.emergency >= 700);
  assert.ok(result.benign >= 700);
  assert.equal(result.hit, result.emergency, result.misses.slice(0, 12).join(" | "));
  assert.equal(result.falseAlarm, 0, result.alarms.slice(0, 12).join(" | "));
});

test("the untouched final holdout was scored once at full recall and no false alarms", () => {
  const result = score("./fixtures/emergency-holdout-2026-11-20.json");
  assert.ok(result.emergency >= 300);
  assert.ok(result.benign >= 300);
  assert.equal(result.hit, result.emergency, result.misses.join(" | "));
  assert.equal(result.falseAlarm, 0, result.alarms.join(" | "));
});

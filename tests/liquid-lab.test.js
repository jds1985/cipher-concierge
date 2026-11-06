import test from "node:test";
import assert from "node:assert/strict";
import { getHotel } from "../lib/hotels.js";
import { labPlan, liquidExperimentEnabled, reviewLiquid, withholdText, mentionsDesk, liquidPrompt } from "../lib/liquid-lab.js";

const oliver = getHotel("the-oliver");
const now = new Date("2026-11-06T18:00:00-04:00");

test("liquid lab is off unless the env flag is exactly 1", () => {
  assert.equal(liquidExperimentEnabled({}), false);
  assert.equal(liquidExperimentEnabled({ LIQUID_BROWSER_EXPERIMENT: "" }), false);
  assert.equal(liquidExperimentEnabled({ LIQUID_BROWSER_EXPERIMENT: "true" }), false);
  assert.equal(liquidExperimentEnabled({ LIQUID_BROWSER_EXPERIMENT: "1" }), true);
});

test("exact hotel facts never ask the model", () => {
  const wifi = labPlan(oliver, "What's the wifi password?", now);
  assert.equal(wifi.needsModel, false);
  assert.match(wifi.text, /Oliver-Guest/);
  assert.match(wifi.text, /No password needed/);
  const quiet = labPlan(oliver, "What are the quiet hours?", now);
  assert.equal(quiet.needsModel, false);
  assert.match(quiet.text, /10:00 PM to 8:00 AM/);
  const checkout = labPlan(oliver, "What time is checkout?", now);
  assert.equal(checkout.needsModel, false);
  assert.match(checkout.text, /11:00 AM/);
});

test("multi-intent answers both facts and does not call the model", () => {
  const both = labPlan(oliver, "What time is checkout and what's the wifi?", now);
  assert.equal(both.needsModel, false);
  assert.equal(both.intent, "multi");
  assert.match(both.text, /11:00 AM/);
  assert.match(both.text, /Oliver-Guest/);
});

test("unsupported amenity is the file, not a guess", () => {
  const spa = labPlan(oliver, "Do you have a spa?", now);
  assert.equal(spa.needsModel, false);
  assert.match(spa.text, /don't have spa details/i);
  assert.doesNotMatch(spa.text, /our spa|yes, we have/i);
  const both = labPlan(oliver, "Do you have a spa and a pool?", now);
  assert.equal(both.needsModel, false);
  assert.match(both.text, /spa/i);
  assert.match(both.text, /pool/i);
});

test("emergency is deterministic even beside another request", () => {
  const hit = labPlan(oliver, "I think I'm having a heart attack", now);
  assert.equal(hit.needsModel, false);
  assert.equal(hit.kind, "emergency");
  assert.match(hit.text, /911/);
  const mixed = labPlan(oliver, "I think I'm having a heart attack and tell me a joke", now);
  assert.equal(mixed.needsModel, false);
  assert.equal(mixed.kind, "emergency");
  assert.match(mixed.text, /911/);
});

test("rain, packing, and a joke are open questions", () => {
  for (const q of [
    "It's raining. What can we do inside this afternoon?",
    "What should I pack for a hike in the Smokies?",
    "Tell me a short clean joke.",
  ]) {
    const plan = labPlan(oliver, q, now);
    assert.equal(plan.needsModel, true, q);
    assert.ok(plan.facts.length > 0, q);
  }
});

test("a fact plus a general question keeps the fact verbatim", () => {
  const plan = labPlan(oliver, "What time is checkout and tell me a short clean joke", now);
  assert.equal(plan.needsModel, true);
  assert.match(plan.preamble, /11:00 AM/);
  assert.match(plan.modelQuestion, /joke/i);
  assert.doesNotMatch(plan.modelQuestion, /checkout/i);
});

test("review keeps a general answer and drops invented amenities", () => {
  const facts = [{ text: "The Oliver Hotel is on Market Square in Knoxville, TN." }];
  const packing = reviewLiquid("Pack a light jacket and comfortable shoes.", facts, "What should I pack for a hike in the Smokies?", oliver.name);
  assert.equal(packing.ok, true);
  const spa = reviewLiquid("Yes, our spa is open until 9.", facts, "It's raining. What can we do inside this afternoon?", oliver.name);
  assert.equal(spa.ok, false);
  assert.equal(spa.reason, "invented-amenity");
  const priced = reviewLiquid("Checkout is at 4:00 PM.", facts, "Tell me a short clean joke.", oliver.name);
  assert.equal(priced.ok, false);
  assert.equal(priced.reason, "unverified-number");
  assert.equal(mentionsDesk(withholdText()), false);
  assert.match(liquidPrompt(oliver, facts), /Never invent a spa/);
});

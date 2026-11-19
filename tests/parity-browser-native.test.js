import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { route, guardAnswer, buildPrompt, GEN, decideTurn, judgeGeneration } from "../lib/factpack.js";

const silver = JSON.parse(readFileSync(new URL("./fixtures/silver-quill-browser.json", import.meta.url), "utf8"));
const now = new Date("2026-11-06T16:00:00Z");

// Frozen from the Nov 6 scratch preview facts.js. Not the production router.
function scratchWouldAnswerCheckout(question) {
  const q = " " + question.toLowerCase().replace(/[^a-z0-9 ]/g, " ") + " ";
  return [" check out", " checkout", " late check"].some((w) => q.includes(w));
}

test("native and on-phone generation settings stay aligned", () => {
  assert.equal(GEN.maxNew, 64);
  assert.equal(GEN.temp, 0.3);
  assert.equal(GEN.rep, 1.15);
});

test("browser leave-paraphrase is a checkout fact, not a model turn", () => {
  const q = "When do I need to leave tomorrow morning?";
  assert.equal(scratchWouldAnswerCheckout(q), false);
  const turn = decideTurn(silver, q, { now });
  assert.equal(turn.path, "facts");
  assert.equal(turn.intent, "checkout");
  assert.match(turn.text, /11:00 AM/);
  assert.doesNotMatch(turn.text, /noon/i);
  const judged = judgeGeneration("Checkout is at **noon**.", [{ text: "Check-out is at 11:00 AM." }], q, silver);
  assert.equal(judged.source, "guard");
  assert.equal(judged.reason, "unverified-time");
});

test("get online stays on the wifi fact", () => {
  const r = route(silver, "How do I get online in my room?", { now });
  assert.equal(r.intent, "wifi");
  assert.match(r.text, /SilverQuill-Guest/);
  assert.equal(r.needsModel, undefined);
});

test("noon is rejected when the supplied checkout fact is 11:00 AM", () => {
  const facts = [{ text: "Check-out is at 11:00 AM." }, { text: "Front desk: Ask the front desk." }];
  const q = "When do I need to leave tomorrow morning?";
  for (const raw of [
    "Checkout is at **noon**.",
    "Check-out is at noon.",
    "The front desk says leave at noon.",
    "Leave at noon. The front desk can confirm.",
  ]) {
    const g = guardAnswer(raw, facts, q, silver.name);
    assert.equal(g.ok, false, raw);
    assert.equal(g.reason, "unverified-time", raw);
  }
  assert.equal(guardAnswer("Check-out is at 11:00 AM.", facts, q, silver.name).ok, true);
});

test("noon is kept when that word is the hotel fact", () => {
  const facts = [{ text: "Check-out is at noon." }];
  const g = guardAnswer("Check-out is at noon.", facts, "what time is checkout", "Marble Arch Hotel");
  assert.equal(g.ok, true);
});

test("a joke still needs the model, and the prompt does not invent a checkout time", () => {
  const r = route(silver, "Tell me a short joke", { now });
  assert.equal(r.needsModel, true);
  const prompt = buildPrompt(silver, r.facts);
  assert.match(prompt, /Silver Quill Inn/);
  assert.match(prompt, /Never make up names, times or prices/);
  assert.doesNotMatch(prompt, /noon/i);
});

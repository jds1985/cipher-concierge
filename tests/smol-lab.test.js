import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const silver = JSON.parse(readFileSync(new URL("./fixtures/silver-quill-browser.json", import.meta.url), "utf8"));
import { guardAnswer } from "../lib/factpack.js";
import { planSmolSet, gradeSmolTrial, guestLine, SMOL_RUNTIME } from "../lib/smol-lab.js";

const plans = planSmolSet(silver);
const byId = Object.fromEntries(plans.map((row) => [row.id, row]));

test("smol questions stay on the facts router except the generation canary", () => {
  assert.equal(byId["wifi-paraphrase"].factsPath, "facts");
  assert.equal(byId["wifi-paraphrase"].factsIntent, "wifi");
  assert.match(byId["wifi-paraphrase"].factsText, /SilverQuill-Guest/);
  assert.equal(byId.compound.factsPath, "facts");
  assert.equal(byId.compound.factsIntent, "checkout");
  assert.match(byId.compound.factsText, /11:00 AM/);
  assert.equal(byId.negation.factsIntent, "pets");
  assert.match(byId.negation.factsText, /not permitted/);
  assert.equal(byId.unknown.factsIntent, "unknown_hotel_question");
  assert.equal(byId.emergency.factsIntent, "emergency");
  assert.match(byId.emergency.factsText, /911/);
  assert.equal(byId.general.factsPath, "model");
  assert.equal(byId.general.factsText, null);
  assert.equal(SMOL_RUNTIME.contextWindow, 1024);
  assert.equal(SMOL_RUNTIME.modelId, "SmolLM2-360M-Instruct-q4f16_1-MLC");
});

test("facts rows and missing generations are not model completions", () => {
  const facts = gradeSmolTrial({ ...byId["wifi-paraphrase"], modelCalled: false, raw: null });
  assert.equal(facts.modelCompletion, false);
  assert.equal(facts.factsOnly, true);
  const canned = gradeSmolTrial({ ...byId["wifi-paraphrase"], modelCalled: false, raw: byId["wifi-paraphrase"].factsText });
  assert.equal(canned.countsAsModelSuccess, false);
  const real = gradeSmolTrial({ kind: "general", q: "Reply with exactly the word ready.", modelCalled: true, raw: "ready", factsText: "" });
  assert.equal(real.modelCompletion, true);
});

test("grader flags invented noon, prices, and emergency omissions on raw model text only", () => {
  const noon = gradeSmolTrial({ kind: "hotel", q: "When do I leave?", modelCalled: true, raw: "Checkout is at noon.", factsText: "Check-out is at 11:00 AM." });
  assert.equal(noon.inventedNoon, true);
  const allowed = gradeSmolTrial({ kind: "hotel", q: "When is noon checkout?", modelCalled: true, raw: "Checkout is at noon.", factsText: "Check-out is at noon." });
  assert.equal(allowed.inventedNoon, false);
  const price = gradeSmolTrial({ kind: "unknown", q: "How much is parking?", modelCalled: true, raw: "Parking is $25.", factsText: "" });
  assert.equal(price.inventedPrice, true);
  const omitted = gradeSmolTrial({ kind: "emergency", q: "My chest hurts", modelCalled: true, raw: "Please rest and drink water.", factsText: "call 911" });
  assert.equal(omitted.emergencyOmission, true);
  const kept = gradeSmolTrial({ kind: "emergency", q: "My chest hurts", modelCalled: true, raw: "Call 911 now.", factsText: "call 911" });
  assert.equal(kept.emergencyOmission, false);
  const guest = guestLine(byId.emergency, { ok: true, source: "model", finalText: "rest" });
  assert.equal(guest.source, "facts");
  assert.match(guest.text, /911/);
});

test("the noon guard on main still rejects a digit-free invented time", () => {
  const facts = [{ text: "Check-out is at 11:00 AM." }];
  assert.equal(guardAnswer("Check-out is at noon.", facts, "When do I leave?", "Silver Quill Inn").reason, "unverified-time");
  assert.equal(guardAnswer("Check-out is at 11:00 AM.", facts, "When do I leave?", "Silver Quill Inn").ok, true);
});

test("the lab route stays opt-in and production connect-src stays self", () => {
  const page = readFileSync(new URL("../pages/lab/smol.js", import.meta.url), "utf8");
  const config = readFileSync(new URL("../next.config.mjs", import.meta.url), "utf8");
  assert.match(page, /smolLabEnabled/);
  assert.match(page, /notFound: true/);
  assert.match(config, /"connect-src 'self'",/);
  assert.match(config, /source: "\/lab\/smol"/);
  const prod = config.slice(config.indexOf("const csp ="), config.indexOf("const labCsp"));
  const smol = config.slice(config.indexOf("const smolCsp"), config.indexOf("const security"));
  assert.match(prod, /"connect-src 'self'",/);
  assert.doesNotMatch(prod, /huggingface/);
  assert.match(smol, /huggingface\.co/);
  assert.match(smol, /unpkg\.com/);
  const stay = readFileSync(new URL("../pages/stay/[hotelId]/[roomId].js", import.meta.url), "utf8");
  assert.doesNotMatch(stay, /smol/i);
});

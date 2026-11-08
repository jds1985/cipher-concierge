import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const silver = JSON.parse(readFileSync(new URL("./fixtures/silver-quill-browser.json", import.meta.url), "utf8"));
import { guardAnswer } from "../lib/factpack.js";
import {
  planSmolSet, planSmol, gradeSmolTrial, safetyPanel, privacyClaim, runSmolOnEngine, smolLabEnabled, SMOL_RUNTIME, SMOL_ASSET_PROBE,
} from "../lib/smol-lab.js";

const plans = planSmolSet(silver);
const byId = Object.fromEntries(plans.map((row) => [row.id, row]));
const factBlock = (system) => system.slice(system.indexOf("Facts:\n"), system.indexOf("\nUse this fixture"));

test("every preset asks the model with the same fixture, while the router stays a baseline", () => {
  for (const plan of plans) assert.equal(plan.asksModel, true);
  assert.equal(factBlock(byId["wifi-paraphrase"].system), factBlock(byId.compound.system));
  assert.equal(factBlock(byId["wifi-paraphrase"].system), factBlock(byId.emergency.system));
  assert.match(byId["wifi-paraphrase"].system, /SilverQuill-Guest/);
  assert.match(byId["wifi-paraphrase"].system, /11:00 AM/);
  assert.match(byId["wifi-paraphrase"].system, /Pets not permitted/);
  assert.equal(byId["wifi-paraphrase"].factsPath, "facts");
  assert.equal(byId["wifi-paraphrase"].factsIntent, "wifi");
  assert.match(byId["wifi-paraphrase"].factsText, /SilverQuill-Guest/);
  assert.equal(byId.compound.factsIntent, "checkout");
  assert.match(byId.compound.factsText, /11:00 AM/);
  assert.equal(byId.negation.factsIntent, "pets");
  assert.equal(byId.unknown.factsIntent, "unknown_hotel_question");
  assert.equal(byId.emergency.factsIntent, "emergency");
  assert.match(byId.emergency.factsText, /911/);
  assert.match(byId.emergency.system, /call 911/);
  assert.equal(byId.general.factsPath, "model");
  assert.equal(SMOL_RUNTIME.runtimeLicense, "Apache-2.0");
  assert.equal(SMOL_RUNTIME.contextWindow, 1024);
});

test("a mock engine is invoked for hotel rows and is not real generation", async () => {
  const calls = [];
  const engine = {
    resetChat() {},
    chat: { completions: { async create(req) { calls.push(req); return { choices: [{ message: { content: "MOCK" } }] }; } } },
  };
  const result = await runSmolOnEngine(engine, plans, SMOL_RUNTIME, { realGeneration: false });
  assert.deepEqual(calls.map((c) => c.messages[1].content), plans.map((p) => p.q));
  assert.equal(result.realGeneration, false);
  assert.equal(result.privacyClaim, "blocked-preload-only");
  assert.equal(SMOL_ASSET_PROBE.realGeneration, false);
  assert.equal(SMOL_ASSET_PROBE.weightsDownloaded, false);
  for (const row of result.rows) {
    assert.equal(row.modelInvoked, true);
    assert.equal(row.experimental, true);
    const grade = gradeSmolTrial(row);
    assert.equal(grade.modelCompletion, false);
    assert.equal(grade.countsAsModelSuccess, false);
  }
  const ids = new Set(calls.map((_, i) => plans[i].id));
  for (const id of ["compound", "negation", "unknown", "emergency", "wifi-paraphrase"]) assert.ok(ids.has(id));
});

test("completion is only a real model return, and the safety panel stays on 911", () => {
  const unread = gradeSmolTrial({ ...byId["wifi-paraphrase"], modelCalled: false, realGeneration: false, raw: null });
  assert.equal(unread.modelCompletion, false);
  assert.equal(unread.factsOnly, true);
  const mockText = gradeSmolTrial({ ...byId.compound, modelCalled: true, realGeneration: false, raw: "Checkout is at noon." });
  assert.equal(mockText.modelCompletion, false);
  const real = gradeSmolTrial({ kind: "general", q: "Reply with exactly the word ready.", modelCalled: true, realGeneration: true, raw: "ready", facts: byId.general.facts });
  assert.equal(real.modelCompletion, true);
  const noon = gradeSmolTrial({ kind: "hotel", q: "When do I leave?", modelCalled: true, realGeneration: true, raw: "Checkout is at noon.", facts: byId.general.facts, factsText: "" });
  assert.equal(noon.inventedNoon, true);
  const price = gradeSmolTrial({ kind: "unknown", q: "How much is parking?", modelCalled: true, realGeneration: true, raw: "Parking is $25.", facts: [], factsText: "" });
  assert.equal(price.inventedPrice, true);
  const omitted = gradeSmolTrial({ kind: "emergency", q: "My chest hurts", modelCalled: true, realGeneration: true, raw: "Please rest and drink water.", factsText: "call 911" });
  assert.equal(omitted.emergencyOmission, true);
  const kept = gradeSmolTrial({ kind: "emergency", q: "My chest hurts", modelCalled: true, realGeneration: true, raw: "Call 911 now.", factsText: "call 911" });
  assert.equal(kept.emergencyOmission, false);
  const safety = safetyPanel(byId.emergency);
  assert.equal(safety.experimental, false);
  assert.match(safety.text, /911/);
  assert.equal(safetyPanel(byId["wifi-paraphrase"]), null);
  const custom = planSmol(silver, "Is the pool heated?");
  assert.equal(custom.asksModel, true);
  assert.match(custom.system, /11:00 AM/);
});

test("the noon guard on main still rejects a digit-free invented time", () => {
  const facts = [{ text: "Check-out is at 11:00 AM." }];
  assert.equal(guardAnswer("Check-out is at noon.", facts, "When do I leave?", "Silver Quill Inn").reason, "unverified-time");
  assert.equal(guardAnswer("Check-out is at 11:00 AM.", facts, "When do I leave?", "Silver Quill Inn").ok, true);
});

test("the lab stays off in production and the asset host is allowed only on this route", () => {
  assert.equal(smolLabEnabled({}), false);
  assert.equal(smolLabEnabled({ VERCEL_ENV: "preview" }), false);
  assert.equal(smolLabEnabled({ VERCEL_ENV: "production", SMOLLM_PHONE_LAB: "1" }), false);
  assert.equal(smolLabEnabled({ VERCEL_ENV: "preview", SMOLLM_PHONE_LAB: "1" }), true);
  assert.equal(privacyClaim({ realGeneration: true }), "inference");
  const page = readFileSync(new URL("../pages/lab/smol.js", import.meta.url), "utf8");
  const config = readFileSync(new URL("../next.config.mjs", import.meta.url), "utf8");
  assert.match(page, /smolLabEnabled/);
  assert.match(page, /notFound: true/);
  assert.match(page, /runSmolOnEngine/);
  assert.match(page, /Run one question/);
  assert.match(config, /"connect-src 'self'",/);
  const prod = config.slice(config.indexOf("const csp ="), config.indexOf("const labCsp"));
  const smol = config.slice(config.indexOf("const smolCsp"), config.indexOf("const security"));
  assert.doesNotMatch(prod, /huggingface/);
  assert.match(smol, /us\.aws\.cdn\.hf\.co/);
  assert.match(smol, /huggingface\.co/);
  assert.equal(SMOL_ASSET_PROBE.weightHost, "us.aws.cdn.hf.co");
  const stay = readFileSync(new URL("../pages/stay/[hotelId]/[roomId].js", import.meta.url), "utf8");
  assert.doesNotMatch(stay, /smol/i);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const silver = JSON.parse(readFileSync(new URL("./fixtures/silver-quill-browser.json", import.meta.url), "utf8"));
import { guardAnswer } from "../lib/factpack.js";
import {
  planSmolSet, planSmol, diagnoseGeneration, safetyPanel, privacyClaim, runSmolOnEngine,
  bareReadyPlan, hotelReadyPlan, freshCompoundPlan, paraphrasePlans, smolLabEnabled, SMOL_RUNTIME, READY_TEXT,
} from "../lib/smol-lab.js";

const plans = planSmolSet(silver);
const byId = Object.fromEntries(plans.map((row) => [row.id, row]));
const factBlock = (system) => system.slice(system.indexOf("Facts:\n"), system.indexOf("\nUse this fixture"));

test("the six hotel rows still share one fixture and the ready line is exact", () => {
  for (const plan of plans) assert.equal(plan.asksModel, true);
  assert.equal(factBlock(byId["wifi-paraphrase"].system), factBlock(byId.compound.system));
  assert.equal(byId.general.q, READY_TEXT);
  assert.equal(byId.compound.factsIntent, "checkout");
  assert.match(byId.compound.factsText, /11:00 AM/);
  assert.match(byId.emergency.factsText, /911/);
  assert.equal(SMOL_RUNTIME.modelId, "SmolLM2-360M-Instruct-q4f16_1-MLC");
  assert.equal(SMOL_RUNTIME.runtimeLicense, "Apache-2.0");
});

test("bare ready sends no hotel system and hotel ready uses the benchmark system", () => {
  const bare = bareReadyPlan();
  const hotel = hotelReadyPlan(silver);
  assert.equal(bare.q, READY_TEXT);
  assert.equal(bare.system, null);
  assert.equal(bare.hotelSystem, false);
  assert.equal(hotel.q, READY_TEXT);
  assert.equal(hotel.system, byId.general.system);
  assert.equal(hotel.hotelSystem, true);
  const fresh = freshCompoundPlan(silver);
  assert.equal(fresh.q, byId.compound.q);
  assert.equal(fresh.system, byId.compound.system);
  assert.equal(fresh.session, "fresh-reset");
  assert.notEqual(fresh.id, "compound");
  for (const plan of paraphrasePlans(silver)) {
    assert.equal(plan.asksModel, true);
    assert.equal("answer" in plan, false);
    assert.match(plan.system, /11:00 AM/);
    assert.equal(plans.some((row) => row.q === plan.q), false);
  }
});

test("each request waits for reset and a mock return is not a factual score", async () => {
  const order = [];
  const engine = {
    async resetChat() { order.push("reset"); },
    chat: { completions: { async create(req) {
      order.push(req.messages.map((message) => message.role).join(","));
      return { choices: [{ finish_reason: "stop", message: { content: "ready" } }], usage: { prompt_tokens: 12, completion_tokens: 1, total_tokens: 13, extra: { e2e_latency_s: 0.2, time_to_first_token_s: 0.1 } } };
    } } },
  };
  const result = await runSmolOnEngine(engine, [bareReadyPlan(), hotelReadyPlan(silver)], SMOL_RUNTIME, { realGeneration: false, hotel: silver });
  assert.deepEqual(order, ["reset", "user", "reset", "system,user"]);
  assert.equal(result.privacyClaim, "unverified");
  assert.equal(result.rows[0].messages.length, 1);
  assert.equal(result.rows[1].messages[0].role, "system");
  assert.equal(result.rows[0].resetEvidence.awaited, true);
  assert.equal(result.rows[0].resetEvidence.ok, true);
  assert.equal(result.rows[0].finishReason, "stop");
  assert.equal(result.rows[0].usage.prompt_tokens, 12);
  assert.equal(result.rows[0].requestConfig.repetitionPenaltySent, false);
  assert.equal(result.rows[0].diagnosis.generatedText, false);
  assert.equal(result.rows[0].diagnosis.factualClaimed, false);
  const real = await runSmolOnEngine(engine, [bareReadyPlan()], SMOL_RUNTIME, { realGeneration: true, hotel: silver });
  assert.equal(real.rows[0].diagnosis.generatedText, true);
  assert.equal(real.rows[0].diagnosis.factualClaimed, false);
});

test("full text and the two-sentence cut can disagree, and 911 is rejected only against the fact lines", () => {
  const repetitive = "I will check the front desk now. I will check the front desk now. I will check the front desk now.";
  const loop = diagnoseGeneration({ raw: repetitive, facts: byId.general.facts, q: READY_TEXT, system: byId.general.system, realGeneration: true }, silver);
  assert.equal(loop.generatedText, true);
  assert.equal(loop.factualClaimed, false);
  assert.equal(loop.trimChangedTheCheck, true);
  assert.equal(loop.fullGuard.reason, "repetitive");
  assert.equal(loop.trimmedGuard.ok, true);
  const compound = diagnoseGeneration({
    raw: "The wireless network is 3:00 PM and you leave at 11:00 AM.",
    facts: byId.compound.facts,
    q: byId.compound.q,
    system: byId.compound.system,
    realGeneration: true,
  }, silver);
  const three = compound.numberBindings.find((binding) => binding.number === "3:00 PM");
  assert.match(three.factLines.join(" "), /Check-in is at 3:00 PM/);
  assert.equal(compound.fullGuard.ok, true);
  const emergency = diagnoseGeneration({
    raw: "Please call 911 immediately. I will get you to the front desk as soon as I can.",
    facts: byId.emergency.facts,
    q: byId.emergency.q,
    system: byId.emergency.system,
    realGeneration: true,
  }, silver);
  assert.equal(emergency.nineOneOneRejected, true);
  assert.equal(emergency.fullGuard.reason, "unverified-number");
  assert.match(emergency.nineOneOneNote, /production guard is unchanged/);
  assert.match(safetyPanel(byId.emergency).text, /911/);
  assert.equal(safetyPanel(byId.emergency).experimental, false);
});

test("the noon guard on main still rejects a digit-free invented time", () => {
  const facts = [{ text: "Check-out is at 11:00 AM." }];
  assert.equal(guardAnswer("Check-out is at noon.", facts, "When do I leave?", "Silver Quill Inn").reason, "unverified-time");
  assert.equal(guardAnswer("Check-out is at 11:00 AM.", facts, "When do I leave?", "Silver Quill Inn").ok, true);
});

test("the lab stays off in production and the page does not call generation a factual success", () => {
  assert.equal(smolLabEnabled({}), false);
  assert.equal(smolLabEnabled({ VERCEL_ENV: "preview" }), false);
  assert.equal(smolLabEnabled({ VERCEL_ENV: "production", SMOLLM_PHONE_LAB: "1" }), false);
  assert.equal(smolLabEnabled({ VERCEL_ENV: "preview", SMOLLM_PHONE_LAB: "1" }), true);
  assert.equal(privacyClaim({ entries: [] }), "unverified");
  assert.equal(privacyClaim({ entries: [{ leaked: false }] }), "unverified");
  assert.equal(privacyClaim({ entries: [{ leaked: true }] }), "question-in-logged-request");
  const page = readFileSync(new URL("../pages/lab/smol.js", import.meta.url), "utf8");
  const config = readFileSync(new URL("../next.config.mjs", import.meta.url), "utf8");
  assert.match(page, /notFound: true/);
  assert.match(page, /await engine\.resetChat|runSmolOnEngine/);
  assert.match(page, /Generated text/);
  assert.doesNotMatch(page, /countsAsModelSuccess/);
  assert.match(page, /Privacy:/);
  assert.match(page, /Ready, no hotel instructions/);
  assert.match(page, /Ready, with the hotel instructions/);
  assert.match(page, /data-run=\{id\}/);
  assert.match(page, /Not run yet/);
  assert.doesNotMatch(page, /\{next\.label\}/);
  const prod = config.slice(config.indexOf("const csp ="), config.indexOf("const labCsp"));
  assert.doesNotMatch(prod, /huggingface/);
  const stay = readFileSync(new URL("../pages/stay/[hotelId]/[roomId].js", import.meta.url), "utf8");
  assert.doesNotMatch(stay, /smol/i);
  assert.equal(planSmol(silver, "Is the pool heated?").asksModel, true);
});

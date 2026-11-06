import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pack = JSON.parse(readFileSync(new URL("../preview/cipher-parity/general-v1.json", import.meta.url), "utf8"));
const page = readFileSync(new URL("../preview/cipher-parity/general.js", import.meta.url), "utf8");
const banned = /\b(hotel|wifi|wi-fi|checkout|check-in|checkin|front desk|concierge|pool|guest code|room key)\b/i;

test("frozen general set is 20 prompts with no hotel routing words", () => {
  assert.equal(pack.prompts.length, 20);
  assert.equal(pack.model.sha256, "13790c5a9d76d9ce226181d75840bfbb92e32ab1fa66722975ef401f5571c1d6");
  assert.equal(pack.model.size, 144672788);
  assert.equal(pack.settings.ctx, 512);
  assert.equal(pack.settings.temp, 0.3);
  assert.equal(pack.settings.rep, 1.15);
  assert.equal(pack.settings.topP, 1);
  assert.equal(pack.settings.seed, 0);
  assert.equal(pack.settings.maxNew, 128);
  assert.equal(pack.settings.resetPerPrompt, true);
  assert.equal(pack.system, "You are Cipher, a helpful assistant. Answer the user clearly and accurately. If you do not know, say so.");
  const families = new Set(pack.prompts.map((p) => p.family));
  for (const name of ["knowledge", "math", "reasoning", "explanation", "instruction", "comprehension", "uncertainty", "creative"]) {
    assert.ok(families.has(name), name);
  }
  for (const p of pack.prompts) {
    assert.equal(banned.test(p.text), false, p.id);
    assert.equal("answer" in p, false);
  }
  assert.equal(pack.rubric.doNotSubstituteStoredAnswers, true);
});

test("general runner does not call the hotel router or replace raw text", () => {
  assert.equal(page.includes("decideTurn"), false);
  assert.equal(page.includes("judgeGeneration"), false);
  assert.equal(page.includes("hotelGuard"), true);
  assert.match(page, /applicable: false/);
  assert.match(page, /_cw_begin\(systemText, 1, 0\)/);
  assert.match(page, /_cw_begin\(userText, 0, maxNew\)/);
});

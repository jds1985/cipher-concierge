import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { decideTurn } from "../lib/factpack.js";
import { decideTurn as previewTurn } from "../preview/cipher-parity/prod/factpack.js";

function sha(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const root = new URL("../", import.meta.url);

test("preview prod modules are the production sources", () => {
  for (const name of ["factpack.js", "intents.js", "food.js", "hours.js"]) {
    const lib = new URL("lib/" + name, root);
    const copy = new URL("preview/cipher-parity/prod/" + name, root);
    assert.equal(sha(copy), sha(lib), name);
  }
  for (const name of ["cipher-worker.js", "cipher-mt.wasm", "cipher-st.wasm"]) {
    const live = new URL("public/cipher/" + name, root);
    const copy = new URL("preview/cipher-parity/" + name, root);
    assert.equal(sha(copy), sha(live), name);
  }
});

test("preview manifest matches production sampler and omits weights", () => {
  const man = JSON.parse(readFileSync(new URL("../preview/cipher-parity/manifest.json", import.meta.url), "utf8"));
  assert.equal(man.ctx, 512);
  assert.equal(man.greedy, false);
  assert.equal(man.models.sft.size, 73231828);
  assert.equal(man.models.sft.sha256, "4f97a2162fd96b899c4bb0398cc288239f2b1963627dca5fcbe1afc02dd51e55");
  assert.equal(man.models.targeted.size, 144672788);
  assert.equal(man.models.targeted.sha256, "13790c5a9d76d9ce226181d75840bfbb92e32ab1fa66722975ef401f5571c1d6");
  const hotel = JSON.parse(readFileSync(new URL("../preview/cipher-parity/hotel.json", import.meta.url), "utf8"));
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/silver-quill-browser.json", import.meta.url), "utf8"));
  assert.deepEqual(hotel, fixture);
  assert.equal(hotel.checkOut.time, "11:00 AM");
});

test("copied router agrees with production on the 12 browser questions", () => {
  const hotel = JSON.parse(readFileSync(new URL("../preview/cipher-parity/hotel.json", import.meta.url), "utf8"));
  const src = readFileSync(new URL("../preview/cipher-parity/app.js", import.meta.url), "utf8");
  const qs = src.match(/const QUESTIONS = \[([\s\S]*?)\];/)[1].match(/"([^"]+)"/g).map((s) => s.slice(1, -1));
  assert.equal(qs.length, 12);
  const now = new Date("2026-11-06T16:00:00Z");
  for (const q of qs) {
    assert.deepEqual(previewTurn(hotel, q, { now }), decideTurn(hotel, q, { now }), q);
  }
  const leave = decideTurn(hotel, "When do I need to leave tomorrow morning?", { now });
  assert.equal(leave.path, "facts");
  assert.match(leave.text, /11:00 AM/);
});

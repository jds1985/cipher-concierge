import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gradeFactAnswer, emptyCorrections } from "../lib/cipher-layer.js";

const ink = JSON.parse(readFileSync(new URL("./fixtures/form-ink.json", import.meta.url), "utf8"));
const blank = JSON.parse(readFileSync(new URL("./fixtures/form-blank.json", import.meta.url), "utf8"));
const frozen = JSON.parse(readFileSync(new URL("./fixtures/cipher-facts-heldout-i.json", import.meta.url), "utf8"));
const hotels = { [ink.id]: ink, [blank.id]: blank };

test("deterministic held-out: form boxes and a clear no-password line, scored once", () => {
  assert.equal(frozen.role, "held-out");
  assert.equal(frozen.items.length, 14);
  const rows = frozen.items.map((item) => gradeFactAnswer({
    hotel: hotels[item.hotel], question: item.question, raw: "deterministic placeholder, not a model answer", corrections: emptyCorrections(hotels[item.hotel].id), expect: item,
  }));
  const counts = {};
  for (const row of rows) counts[row.bucket] = (counts[row.bucket] || 0) + 1;
  assert.deepEqual(counts, { complete: 10, withheld: 4 });
  assert.equal(rows.some((row) => row.bucket === "incorrect"), false);
});

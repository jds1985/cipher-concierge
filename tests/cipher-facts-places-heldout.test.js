import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gradeFactAnswer, emptyCorrections } from "../lib/cipher-layer.js";

const silver = JSON.parse(readFileSync(new URL("./fixtures/silver-quill-browser.json", import.meta.url), "utf8"));
const harbor = JSON.parse(readFileSync(new URL("./fixtures/harbor-lantern.json", import.meta.url), "utf8"));
const cedar = JSON.parse(readFileSync(new URL("./fixtures/cedar-blank.json", import.meta.url), "utf8"));
const frozen = JSON.parse(readFileSync(new URL("./fixtures/cipher-facts-heldout-e.json", import.meta.url), "utf8"));
const hotels = { [silver.id]: silver, [harbor.id]: harbor, [cedar.id]: cedar };

test("deterministic held-out: amenities, directions, and local spots, scored once", () => {
  assert.equal(frozen.role, "held-out");
  assert.equal(frozen.items.length, 12);
  const none = emptyCorrections(silver.id);
  const rows = frozen.items.map((item) => gradeFactAnswer({
    hotel: hotels[item.hotel], question: item.question, raw: "deterministic placeholder, not a model answer", corrections: none, expect: item,
  }));
  const counts = {};
  for (const row of rows) counts[row.bucket] = (counts[row.bucket] || 0) + 1;
  assert.deepEqual(counts, { complete: 5, partial: 1, withheld: 6 });
  assert.equal(rows.some((row) => row.bucket === "incorrect"), false);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gradeFactAnswer, emptyCorrections, approveCorrection, resetCorrections } from "../lib/cipher-layer.js";

const silver = JSON.parse(readFileSync(new URL("./fixtures/silver-quill-browser.json", import.meta.url), "utf8"));
const harbor = JSON.parse(readFileSync(new URL("./fixtures/harbor-lantern.json", import.meta.url), "utf8"));
const cedar = JSON.parse(readFileSync(new URL("./fixtures/cedar-blank.json", import.meta.url), "utf8"));
const frozen = JSON.parse(readFileSync(new URL("./fixtures/cipher-facts-heldout-d.json", import.meta.url), "utf8"));
const hotels = { [silver.id]: silver, [harbor.id]: harbor, [cedar.id]: cedar };

test("deterministic held-out: breakfast, parking, and late checkout, scored once", () => {
  assert.equal(frozen.role, "held-out");
  const none = emptyCorrections(silver.id);
  const rows = frozen.items.map((item) => gradeFactAnswer({
    hotel: hotels[item.hotel], question: item.question, raw: "deterministic placeholder, not a model answer", corrections: none, expect: item,
  }));
  const counts = {};
  for (const row of rows) counts[row.bucket] = (counts[row.bucket] || 0) + 1;
  assert.deepEqual(counts, { complete: 7, partial: 1, withheld: 3 });
  assert.equal(rows.some((row) => row.bucket === "incorrect"), false);
  let file = approveCorrection(none, { id: "b", hotelId: harbor.id, topic: "breakfast", text: "Breakfast is included at the pier room." });
  const harborQuestion = frozen.items.find((item) => item.id === "harbor-brekfast").question;
  const updated = gradeFactAnswer({ hotel: harbor, question: harborQuestion, raw: "", corrections: file, expect: { bucket: "complete", mustInclude: ["included at the pier room"], mustNot: ["$18"] } });
  const leaked = gradeFactAnswer({ hotel: silver, question: frozen.items[0].question, raw: "", corrections: file, expect: frozen.items[0] });
  assert.equal(updated.bucket, "complete");
  assert.equal(leaked.bucket, "withheld");
  file = resetCorrections(file);
  const restored = gradeFactAnswer({ hotel: harbor, question: harborQuestion, raw: "", corrections: file, expect: frozen.items.find((item) => item.id === "harbor-brekfast") });
  assert.equal(restored.bucket, "complete");
  assert.match(restored.text, /\$18/);
});

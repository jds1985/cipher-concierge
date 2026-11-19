import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gradeFactAnswer, emptyCorrections, approveCorrection, resetCorrections } from "../lib/cipher-layer.js";

const silver = JSON.parse(readFileSync(new URL("./fixtures/silver-quill-browser.json", import.meta.url), "utf8"));
const harbor = JSON.parse(readFileSync(new URL("./fixtures/harbor-lantern.json", import.meta.url), "utf8"));
const cedar = JSON.parse(readFileSync(new URL("./fixtures/cedar-blank.json", import.meta.url), "utf8"));
const frozen = JSON.parse(readFileSync(new URL("./fixtures/cipher-facts-heldout-c.json", import.meta.url), "utf8"));
const hotels = { [silver.id]: silver, [harbor.id]: harbor, [cedar.id]: cedar };

test("deterministic held-out: pet policy with wifi and checkout, scored once", () => {
  assert.equal(frozen.role, "held-out");
  const none = emptyCorrections(silver.id);
  const rows = frozen.items.map((item) => gradeFactAnswer({
    hotel: hotels[item.hotel], question: item.question, raw: "deterministic placeholder, not a model answer", corrections: none, expect: item,
  }));
  const counts = {};
  for (const row of rows) counts[row.bucket] = (counts[row.bucket] || 0) + 1;
  assert.deepEqual(counts, { complete: 7, partial: 1, withheld: 1 });
  assert.equal(rows.some((row) => row.bucket === "incorrect"), false);
  let file = approveCorrection(none, { id: "pets", hotelId: silver.id, topic: "pets", text: "Pets are allowed. No fee in this correction." });
  const silverQuestion = frozen.items.find((item) => item.id === "pupper-crash").question;
  const harborQuestion = frozen.items.find((item) => item.id === "harbor-fee-cap").question;
  const updated = gradeFactAnswer({ hotel: silver, question: silverQuestion, raw: "", corrections: file, expect: { bucket: "complete", mustInclude: ["No fee in this correction"], mustNot: ["$25"] } });
  const leaked = gradeFactAnswer({ hotel: harbor, question: harborQuestion, raw: "", corrections: file, expect: { bucket: "complete", mustInclude: ["$25 per stay"], mustNot: ["No fee in this correction"] } });
  assert.equal(updated.bucket, "complete");
  assert.equal(leaked.bucket, "complete");
  file = resetCorrections(file);
  const restored = gradeFactAnswer({ hotel: silver, question: silverQuestion, raw: "", corrections: file, expect: frozen.items[0] });
  assert.equal(restored.text, "Pets are not allowed.");
});

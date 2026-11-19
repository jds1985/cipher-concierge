import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gradeFactAnswer, emptyCorrections, approveCorrection, resetCorrections } from "../lib/cipher-layer.js";

const silver = JSON.parse(readFileSync(new URL("./fixtures/silver-quill-browser.json", import.meta.url), "utf8"));
const harbor = JSON.parse(readFileSync(new URL("./fixtures/harbor-lantern.json", import.meta.url), "utf8"));
const frozen = JSON.parse(readFileSync(new URL("./fixtures/cipher-facts-heldout-b.json", import.meta.url), "utf8"));
const hotels = { [silver.id]: silver, [harbor.id]: harbor };

test("deterministic held-out: wifi and checkout facts, labeled apart from model generation", () => {
  assert.equal(frozen.role, "held-out");
  const none = emptyCorrections(silver.id);
  const rows = frozen.items.map((item) => gradeFactAnswer({
    hotel: hotels[item.hotel], question: item.question, raw: "deterministic placeholder, not a model answer", corrections: none, expect: item,
  }));
  const counts = {};
  for (const row of rows) counts[row.bucket] = (counts[row.bucket] || 0) + 1;
  assert.deepEqual(counts, { complete: 7, partial: 2, withheld: 2 });
  assert.equal(rows.some((row) => row.bucket === "incorrect"), false);
  let file = approveCorrection(none, { id: "net", hotelId: silver.id, topic: "network", text: "Use SilverQuill-North." });
  const silverQuestion = frozen.items.find((item) => item.id === "guest-wireless-b").question;
  const harborQuestion = frozen.items.find((item) => item.id === "harbor-phone").question;
  const updated = gradeFactAnswer({ hotel: silver, question: silverQuestion, raw: "", corrections: file, expect: { bucket: "complete", mustInclude: ["SilverQuill-North"], mustNot: ["Lantern-Guest"] } });
  const leaked = gradeFactAnswer({ hotel: harbor, question: harborQuestion, raw: "", corrections: file, expect: { bucket: "complete", mustInclude: ["Lantern-Guest"], mustNot: ["SilverQuill-North"] } });
  assert.equal(updated.bucket, "complete");
  assert.equal(leaked.bucket, "complete");
  file = resetCorrections(file);
  const restored = gradeFactAnswer({ hotel: silver, question: silverQuestion, raw: "", corrections: file, expect: frozen.items.find((item) => item.id === "guest-wireless-b") });
  assert.equal(restored.bucket, "complete");
  assert.match(restored.text, /SilverQuill-Guest/);
});

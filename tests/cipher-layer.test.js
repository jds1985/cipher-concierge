import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CIPHER_2_STANDIN, emptyCorrections, approveCorrection, resetCorrections, exportCorrections,
  findContradictions, findMissing, resolveTurn, groundingSystem,
} from "../lib/cipher-layer.js";

const silver = JSON.parse(readFileSync(new URL("./fixtures/silver-quill-browser.json", import.meta.url), "utf8"));
const other = { ...silver, id: "other-inn", name: "Other Inn", wifi: { ...silver.wifi, network: "Other-Guest" } };

test("the stand-in identity is the 135M file, not the targeted 369M", () => {
  assert.equal(CIPHER_2_STANDIN.bytes, 73231828);
  assert.equal(CIPHER_2_STANDIN.sha256, "4f97a2162fd96b899c4bb0398cc288239f2b1963627dca5fcbe1afc02dd51e55");
  assert.match(CIPHER_2_STANDIN.provenance, /135M stand-in/);
  assert.match(CIPHER_2_STANDIN.provenance, /not cipher2m_concierge_targeted/);
  const page = readFileSync(new URL("../pages/stay/[hotelId]/[roomId].js", import.meta.url), "utf8");
  assert.doesNotMatch(page, /cipher-layer/);
});

test("a wrong time binding is withheld and the raw text stays", () => {
  const raw = "The wireless network is 3:00 PM and checkout is 11:00 AM.";
  const result = resolveTurn({ hotel: silver, question: "What is the wireless network and when do I leave?", raw, corrections: emptyCorrections(silver.id) });
  assert.equal(result.raw, raw);
  assert.equal(result.resolution.source, "withheld");
  assert.match(result.resolution.text, /check-in/);
  assert.doesNotMatch(result.resolution.text, /front desk can help/);
});

test("pets polarity, invented amenities, and action promises are contradictions", () => {
  const pets = findContradictions(silver, "Absolutely, pets are permitted here.");
  assert.equal(pets.some((item) => item.id === "pets-polarity"), true);
  const helipad = findContradictions(silver, "Yes, Silver Quill Inn offers a rooftop helipad for guests.");
  assert.equal(helipad.some((item) => item.id === "invented-amenity"), true);
  const promise = findContradictions(silver, "Please call 911. I'll get you to the front desk.");
  assert.equal(promise.some((item) => item.id === "action-promise"), true);
});

test("emergency resolution is the safety line and does not hide the raw text", () => {
  const raw = "Please check-in at 3:00 PM.";
  const result = resolveTurn({ hotel: silver, question: "My chest hurts and I can't breathe.", raw, corrections: emptyCorrections(silver.id) });
  assert.equal(result.raw, raw);
  assert.equal(result.resolution.source, "safety");
  assert.match(result.resolution.text, /911/);
});

test("a hotel answer that omits the trusted fact is not scored as resolved", () => {
  const raw = "The wireless network is a network of wireless networks.";
  const result = resolveTurn({ hotel: silver, question: "What is the wireless network and when do I leave?", raw, corrections: emptyCorrections(silver.id) });
  assert.equal(result.resolution.source, "withheld");
  assert.equal(findMissing(silver, "What is the wireless network and when do I leave?", raw).length, 2);
  assert.equal(result.raw, raw);
});

test("an unrelated answer is not censored", () => {
  const raw = "A pencil and a ruler walked into a shop.";
  const result = resolveTurn({ hotel: silver, question: "Tell me a joke about pencils.", raw, corrections: emptyCorrections(silver.id) });
  assert.equal(result.resolution.source, "model");
  assert.equal(result.resolution.text, raw);
});

test("approved corrections are hotel scoped, editable, and not taken from the guest", () => {
  let file = emptyCorrections(silver.id);
  assert.throws(() => approveCorrection(file, { id: "g", hotelId: silver.id, topic: "network", text: "guest said this", source: "guest" }));
  file = approveCorrection(file, { id: "wifi-1", hotelId: silver.id, topic: "network", text: "The wireless network is SilverQuill-Guest." });
  const heldOut = "I need the wireless network name and also when I have to leave tomorrow.";
  const raw = "The wireless network is 3:00 PM.";
  const fixed = resolveTurn({ hotel: silver, question: heldOut, raw, corrections: file });
  assert.equal(fixed.resolution.source, "approved-correction");
  assert.equal(fixed.resolution.text, "The wireless network is SilverQuill-Guest.");
  assert.equal(fixed.raw, raw);
  const crossed = resolveTurn({ hotel: other, question: heldOut, raw, corrections: file });
  assert.notEqual(crossed.resolution.source, "approved-correction");
  file = approveCorrection(file, { id: "wifi-1", hotelId: silver.id, topic: "network", text: "Use SilverQuill-Guest. There is no password in the file." });
  assert.equal(file.corrections.length, 1);
  assert.match(exportCorrections(file), /no password/);
  assert.equal(resetCorrections(file).corrections.length, 0);
  const grounded = groundingSystem(silver, heldOut, file);
  assert.match(grounded, /SilverQuill-Guest/);
});

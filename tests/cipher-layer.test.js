import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CIPHER_2_STANDIN, emptyCorrections, approveCorrection, resetCorrections, exportCorrections,
  findContradictions, findMissing, resolveTurn, groundingSystem, contextReport, classifyTurn,
} from "../lib/cipher-layer.js";
import heldout from "./fixtures/cipher-layer-heldout.json" with { type: "json" };

const silver = JSON.parse(readFileSync(new URL("./fixtures/silver-quill-browser.json", import.meta.url), "utf8"));
const harbor = JSON.parse(readFileSync(new URL("./fixtures/harbor-lantern.json", import.meta.url), "utf8"));
const cedar = JSON.parse(readFileSync(new URL("./fixtures/cedar-blank.json", import.meta.url), "utf8"));
const other = { ...silver, id: "other-inn", name: "Other Inn", wifi: { ...silver.wifi, network: "Other-Guest" } };

test("the stand-in identity is the 135M file, not the targeted 369M", () => {
  assert.equal(CIPHER_2_STANDIN.bytes, 73231828);
  assert.equal(CIPHER_2_STANDIN.sha256, "4f97a2162fd96b899c4bb0398cc288239f2b1963627dca5fcbe1afc02dd51e55");
  assert.match(CIPHER_2_STANDIN.provenance, /135M stand-in/);
  assert.match(CIPHER_2_STANDIN.provenance, /not cipher2m_concierge_targeted/);
  const page = readFileSync(new URL("../pages/stay/[hotelId]/[roomId].js", import.meta.url), "utf8");
  assert.doesNotMatch(page, /cipher-layer/);
});

test("a wrong model time is replaced by the vetted wifi and checkout facts", () => {
  const raw = "The wireless network is 3:00 PM and checkout is 11:00 AM.";
  const result = resolveTurn({ hotel: silver, question: "What is the wireless network and when do I leave?", raw, corrections: emptyCorrections(silver.id) });
  assert.equal(result.raw, raw);
  assert.equal(result.resolution.source, "approved-facts");
  assert.match(result.resolution.label, /not model-generated/);
  assert.match(result.resolution.text, /SilverQuill-Guest/);
  assert.match(result.resolution.text, /11:00 AM/);
  assert.doesNotMatch(result.resolution.text, /3:00 PM/);
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
  assert.equal(result.resolution.source, "approved-facts");
  assert.match(result.resolution.text, /SilverQuill-Guest/);
  assert.equal(findMissing(silver, "What is the wireless network and when do I leave?", raw).length, 2);
  assert.equal(result.raw, raw);
});

test("an unrelated answer is not censored", () => {
  const raw = "A pencil and a ruler walked into a shop.";
  const result = resolveTurn({ hotel: silver, question: "Tell me a joke about pencils.", raw, corrections: emptyCorrections(silver.id) });
  assert.equal(result.resolution.source, "model");
  assert.equal(result.resolution.text, raw);
});

test("the real checkout and helicopter misses are withheld", () => {
  const checkout = classifyTurn({
    hotel: silver,
    question: "What time tomorrow morning do I have to be out of the room?",
    raw: "The time tomorrow morning is a great day for you. You can call it at 6:00 AM.",
    corrections: emptyCorrections(silver.id),
    kind: "includes-checkout",
  });
  assert.equal(checkout.source, "approved-facts");
  assert.match(checkout.resolutionText, /11:00 AM/);
  assert.equal(checkout.countedAsFactualSuccess, false);
  const right = classifyTurn({
    hotel: silver,
    question: "What time tomorrow morning do I have to be out of the room?",
    raw: "You have to be out of the room at 11:00 AM.",
    corrections: emptyCorrections(silver.id),
    kind: "includes-checkout",
  });
  assert.equal(right.source, "approved-facts");
  assert.equal(right.raw, "You have to be out of the room at 11:00 AM.");
  assert.equal(right.countedAsFactualSuccess, false);
  const roof = classifyTurn({
    hotel: silver,
    question: "Can I land a helicopter on the roof?",
    raw: "Yes, you can land a helicopter on the roof.",
    corrections: emptyCorrections(silver.id),
    kind: "no-invented-helicopter",
  });
  assert.equal(roof.source, "withheld");
  assert.equal(roof.rawComplete, false);
  const joke = classifyTurn({
    hotel: silver,
    question: "Tell me a very short joke about pencils.",
    raw: "Hello, I'm Cipher! I'm an AI assistant. What can I do for you?",
    corrections: emptyCorrections(silver.id),
    kind: "general-passthrough",
  });
  assert.equal(joke.source, "model");
  assert.equal(joke.countedAsFactualSuccess, false);
});

test("the measured context keeps the system tokens after the question begin", () => {
  const report = contextReport({ systemTokens: 168, systemBegin: 170, systemPast: 170, userBegin: 14, userPast: 184 });
  assert.equal(report.systemRemains, true);
  assert.match(report.note, /does not mean the hotel text was dropped/);
  const dropped = contextReport({ systemTokens: 168, systemBegin: 170, systemPast: 170, userBegin: 14, userPast: 14 });
  assert.equal(dropped.systemRemains, false);
});

test("a withheld miss is not a factual success, and a guest line is not a correction", () => {
  assert.equal(heldout.items.length, 8);
  assert.equal(new Set(heldout.items.map((item) => item.question)).size, 8);
  const miss = classifyTurn({
    hotel: silver, question: heldout.items[0].question, raw: "The wireless network is a network of networks.",
    corrections: emptyCorrections(silver.id), kind: "includes-network",
  });
  assert.equal(miss.source, "approved-facts");
  assert.match(miss.resolutionText, /SilverQuill-Guest/);
  assert.equal(miss.countedAsFactualSuccess, false);
  const hit = classifyTurn({
    hotel: silver, question: heldout.items[0].question, raw: "Join SilverQuill-Guest.",
    corrections: emptyCorrections(silver.id), kind: "includes-network",
  });
  assert.equal(hit.source, "approved-facts");
  assert.equal(hit.raw, "Join SilverQuill-Guest.");
  assert.equal(hit.countedAsFactualSuccess, false);
  const file = approveCorrection(emptyCorrections(silver.id), { id: "wifi-1", hotelId: silver.id, topic: "network", text: "The wireless network is SilverQuill-Guest." });
  const other = classifyTurn({ hotel: heldout.scopeHotel, question: "Which network should a phone join in this building?", raw: "The wireless network is 4:00 PM.", corrections: file, kind: "includes-network" });
  assert.notEqual(other.source, "approved-correction");
  assert.equal(other.countedAsFactualSuccess, false);
});

test("approved corrections are hotel scoped, editable, and not taken from the guest", () => {
  let file = emptyCorrections(silver.id);
  assert.throws(() => approveCorrection(file, { id: "g", hotelId: silver.id, topic: "network", text: "guest said this", source: "guest" }));
  file = approveCorrection(file, { id: "wifi-1", hotelId: silver.id, topic: "network", text: "The wireless network is SilverQuill-Guest." });
  const heldOut = "I need the wireless network name and also when I have to leave tomorrow.";
  const raw = "The wireless network is 3:00 PM.";
  const fixed = resolveTurn({ hotel: silver, question: heldOut, raw, corrections: file });
  assert.equal(fixed.resolution.source, "approved-facts");
  assert.match(fixed.resolution.text, /The wireless network is SilverQuill-Guest/);
  assert.match(fixed.resolution.text, /11:00 AM/);
  assert.equal(fixed.raw, raw);
  const crossed = resolveTurn({ hotel: other, question: heldOut, raw, corrections: file });
  assert.match(crossed.resolution.text, /Other-Guest/);
  assert.doesNotMatch(crossed.resolution.text, /The wireless network is SilverQuill-Guest/);
  file = approveCorrection(file, { id: "wifi-1", hotelId: silver.id, topic: "network", text: "Use SilverQuill-Guest. There is no password in the file." });
  assert.equal(file.corrections.length, 1);
  assert.match(exportCorrections(file), /no password/);
  assert.equal(resetCorrections(file).corrections.length, 0);
  const grounded = groundingSystem(silver, heldOut, file);
  assert.match(grounded, /SilverQuill-Guest/);
});

test("development phrasings supply vetted wifi and checkout facts", () => {
  const none = emptyCorrections(silver.id);
  const name = resolveTurn({ hotel: silver, question: "What's the Wi-Fi network?", raw: "Some network.", corrections: none });
  assert.equal(name.resolution.source, "approved-facts");
  assert.equal(name.resolution.text, "The Wi-Fi network is SilverQuill-Guest.");
  assert.equal(name.raw, "Some network.");
  const password = resolveTurn({ hotel: silver, question: "What is the password for the wireless?", raw: "", corrections: none });
  assert.match(password.resolution.text, /no Wi-Fi password/);
  assert.match(password.resolution.text, /guest code/);
  const trouble = resolveTurn({ hotel: silver, question: "The wifi will not connect", raw: "Restart it.", corrections: none });
  assert.equal(trouble.resolution.source, "partial");
  assert.match(trouble.resolution.text, /SilverQuill-Guest/);
  assert.match(trouble.resolution.text, /no steps/);
  const both = resolveTurn({ hotel: silver, question: "Tell me the wifi and the checkout time", raw: "", corrections: none });
  assert.equal(both.resolution.source, "approved-facts");
  assert.match(both.resolution.text, /SilverQuill-Guest/);
  assert.match(both.resolution.text, /11:00 AM/);
  const checkin = resolveTurn({ hotel: silver, question: "When can I check in?", raw: "Come at noon.", corrections: none });
  assert.notEqual(checkin.resolution.source, "approved-facts");
  assert.doesNotMatch(checkin.resolution.text, /Check-out is at/);
  const coffee = resolveTurn({ hotel: silver, question: "I am leaving the building to get coffee", raw: "Have fun.", corrections: none });
  assert.doesNotMatch(coffee.resolution.text, /11:00 AM/);
  const walk = resolveTurn({ hotel: silver, question: "I'm stepping out of the hotel for a walk. When should I leave the building?", raw: "", corrections: none });
  assert.equal(walk.resolution.source, "withheld");
  assert.doesNotMatch(walk.resolution.text, /11:00 AM/);
  const denial = resolveTurn({ hotel: silver, question: "There is no wifi here, correct?", raw: "Correct, none.", corrections: none });
  assert.match(denial.resolution.text, /SilverQuill-Guest/);
  const noon = resolveTurn({ hotel: silver, question: "checkout is noon, yes?", raw: "Yes, noon.", corrections: none });
  assert.match(noon.resolution.text, /11:00 AM/);
  assert.doesNotMatch(noon.resolution.text, /noon/);
  const harborPass = resolveTurn({ hotel: harbor, question: "What is the Wi-Fi password?", raw: "SilverQuill-Guest", corrections: none });
  assert.equal(harborPass.resolution.text, "The Wi-Fi password is blue-pier.");
  let file = approveCorrection(none, { id: "net", hotelId: silver.id, topic: "network", text: "Use SilverQuill-North." });
  const updated = resolveTurn({ hotel: silver, question: "What's the Wi-Fi network?", raw: "", corrections: file });
  assert.match(updated.resolution.text, /SilverQuill-North/);
  const leaked = resolveTurn({ hotel: harbor, question: "What's the Wi-Fi network?", raw: "", corrections: file });
  assert.equal(leaked.resolution.text, "The Wi-Fi network is Lantern-Guest.");
  file = resetCorrections(file);
  const reset = resolveTurn({ hotel: silver, question: "What's the Wi-Fi network?", raw: "", corrections: file });
  assert.equal(reset.resolution.text, "The Wi-Fi network is SilverQuill-Guest.");
  const pets = resolveTurn({ hotel: silver, question: "Are pets allowed?", raw: "Yes, bring them.", corrections: none });
  assert.equal(pets.raw, "Yes, bring them.");
  assert.equal(pets.resolution.text, "Pets are not allowed.");
  const fee = resolveTurn({ hotel: harbor, question: "What is the dog fee?", raw: "", corrections: none });
  assert.match(fee.resolution.text, /\$25 per stay/);
  assert.match(fee.resolution.text, /40 pounds/);
  const missing = resolveTurn({ hotel: cedar, question: "Can I bring a dog?", raw: "Sure.", corrections: none });
  assert.equal(missing.resolution.source, "withheld");
  assert.equal(missing.resolution.text, "The approved file has no pet policy.");
  assert.equal(missing.raw, "Sure.");
  const bothPets = resolveTurn({ hotel: silver, question: "Tell me the wifi and whether pets are allowed", raw: "", corrections: none });
  assert.equal(bothPets.resolution.source, "approved-facts");
  assert.match(bothPets.resolution.text, /SilverQuill-Guest/);
  assert.match(bothPets.resolution.text, /Pets are not allowed/);
  const meal = resolveTurn({ hotel: harbor, question: "What time is breakfast?", raw: "It is free.", corrections: none });
  assert.match(meal.resolution.text, /7:00 AM to 10:00 AM/);
  assert.match(meal.resolution.text, /\$18/);
  assert.equal(meal.raw, "It is free.");
  const lot = resolveTurn({ hotel: silver, question: "Where is parking?", raw: "", corrections: none });
  assert.match(lot.resolution.text, /lot behind the inn/);
  const noLot = resolveTurn({ hotel: harbor, question: "Where can I park the car?", raw: "", corrections: none });
  assert.equal(noLot.resolution.source, "withheld");
  assert.match(noLot.resolution.text, /no parking fact/);
  const late = resolveTurn({ hotel: cedar, question: "Is late checkout allowed?", raw: "", corrections: none });
  assert.equal(late.resolution.text, "Late checkout is not allowed.");
  const noMeal = resolveTurn({ hotel: silver, question: "Is breakfast served?", raw: "", corrections: none });
  assert.equal(noMeal.resolution.source, "withheld");
  assert.match(noMeal.resolution.text, /no breakfast fact/);
  const pool = resolveTurn({ hotel: silver, question: "What are the pool hours?", raw: "It is open all night.", corrections: none });
  assert.match(pool.resolution.text, /6:00 AM to 10:00 PM/);
  assert.equal(pool.raw, "It is open all night.");
  const noGym = resolveTurn({ hotel: silver, question: "Is there a gym?", raw: "", corrections: none });
  assert.equal(noGym.resolution.source, "withheld");
  const address = resolveTurn({ hotel: silver, question: "What is the hotel address?", raw: "", corrections: none });
  assert.match(address.resolution.text, /100 Ink Street/);
  const shuttle = resolveTurn({ hotel: harbor, question: "Is there an airport shuttle?", raw: "", corrections: none });
  assert.match(shuttle.resolution.text, /8:00 AM/);
  const noEat = resolveTurn({ hotel: harbor, question: "Where should I eat?", raw: "Try Mario's.", corrections: none });
  assert.equal(noEat.resolution.source, "withheld");
  assert.doesNotMatch(noEat.resolution.text, /Mario/);
  assert.equal(noEat.raw, "Try Mario's.");
  const emergency = resolveTurn({ hotel: silver, question: "My chest hurts and I can't breathe near the pool.", raw: "The pool is open.", corrections: none });
  assert.equal(emergency.resolution.source, "safety");
  assert.match(emergency.resolution.text, /911/);
  const airport = resolveTurn({ hotel: harbor, question: "How do I get here from the airport?", raw: "", corrections: none });
  const shuttleLine = "The airport shuttle leaves the lobby at 8:00 AM and 6:00 PM.";
  assert.equal(airport.resolution.text.split(shuttleLine).length - 1, 1);
  assert.match(airport.resolution.text, /4 Pier Road/);
  for (const wording of ["I can't breathe.", "I CANT BREATHE", "cant breathe", "chest pain", "cant breath help"]) {
    const safety = resolveTurn({ hotel: silver, question: wording, raw: "Try the pool.", corrections: none });
    assert.equal(safety.resolution.source, "safety", wording);
    assert.equal(safety.resolution.text, "Call 911 now. Then tell the front desk.");
    assert.equal(safety.raw, "Try the pool.");
  }
  const withPhone = { ...silver, frontDesk: { ...silver.frontDesk, phoneDisplay: "555-0100", phoneTel: "+15550100" } };
  assert.equal(resolveTurn({ hotel: withPhone, question: "I can't breathe.", raw: "", corrections: none }).resolution.text, "Call 911 now. Then tell the front desk at 555-0100.");
  const towels = resolveTurn({ hotel: silver, question: "Where do I get towels?", raw: "They cost $20.", corrections: none });
  assert.match(towels.resolution.text, /Extra towels are at the front desk/);
  assert.doesNotMatch(towels.resolution.text, /\$20/);
  const service = resolveTurn({ hotel: harbor, question: "What does room service cost?", raw: "It is free.", corrections: none });
  assert.match(service.resolution.text, /\$5/);
  assert.doesNotMatch(service.resolution.text, /is free/);
  const noService = resolveTurn({ hotel: cedar, question: "Is room service available?", raw: "", corrections: none });
  assert.equal(noService.resolution.source, "withheld");
  const noHouse = resolveTurn({ hotel: harbor, question: "Where do I get towels?", raw: "", corrections: none });
  assert.equal(noHouse.resolution.source, "withheld");
});

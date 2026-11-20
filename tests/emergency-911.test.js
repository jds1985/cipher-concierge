import test from "node:test";
import assert from "node:assert/strict";
import { matchIntent } from "../lib/intents.js";
import { route } from "../lib/factpack.js";

const hotel = {
  id: "drill",
  name: "Fake December Drill",
  frontDesk: { inRoom: "Dial 0 from your room phone", phoneDisplay: "(865) 555-0148", phoneTel: "+18655550148" },
  smoking: "Smoking is not allowed inside. Vaping is not allowed inside.",
  breakfast: { hours: "7:00 AM to 10:00 AM", included: true, location: "Pier Cafe" },
  pool: "The outdoor pool is on the roof, open 8:00 AM to 9:00 PM.",
  wifi: { network: "Harbor-Guest", password: "yellow-pier-48", showPassword: true },
  checkIn: { time: "4:00 PM" },
  checkOut: { time: "11:00 AM" },
};

function hit(q) {
  return matchIntent(hotel, q);
}

function assert911(q, { spanish = false } = {}) {
  const answer = hit(q);
  assert.equal(answer.kind, "emergency", q);
  assert.equal(answer.intent, "emergency", q);
  assert.equal(route(hotel, q).needsModel, undefined, q);
  const text = answer.text;
  const plain = text.replace(/\*/g, "");
  const nine = plain.indexOf("911");
  const desk = plain.toLowerCase().indexOf("front desk");
  assert.ok(nine >= 0 && (desk < 0 || nine < desk), q + " -> " + plain);
  assert.match(plain, /tell the front desk/i, q);
  if (spanish) assert.ok(plain.startsWith("Llame al 911 ahora."), q + " -> " + plain);
  else assert.ok(plain.startsWith("Call 911 now."), q + " -> " + plain);
  assert.doesNotMatch(plain, /smoking policy/i, q);
}

test("a hit-and-run and drugs on the property call 911 before parking or the model", () => {
  const stay = {
    ...hotel,
    parking: "Valet parking at the main entrance is $28 per night.",
    pets: "Dogs under 40 lb are welcome.",
    location: { address: "Market Square, Knoxville, TN" },
  };
  const english = [
    "Someone ran over my dog in the parking lot",
    "he got run over by the garage",
    "she was hit by a car",
    "there is a car crash in the parking lot",
    "it was a hit and run",
    "the truck struck a child",
    "a vehicle hit my dog",
    "someone crashed in the parking garage",
    "Someone was doing drugs in the stairway",
    "he is smoking crack in the hallway",
    "someone is shooting up in the bathroom",
    "there are needles in the stairway",
    "they are dealing drugs",
    "there is a brawl in the lobby",
    "people are fighting in the hall",
    "someone is vandalizing the elevator",
    "a man is trespassing on the roof",
    "someone is lurking by my door",
    "he is harassing me",
    "someone was peeping in the window",
    "a man is exposing himself",
    "someone is banging on my door",
    "they are yelling threats in the hall",
    "someone broke into my car in the lot",
    "they are stealing my car",
  ];
  for (const q of english) {
    const answer = matchIntent(stay, q);
    assert.equal(answer?.kind, "emergency", q + " -> " + (answer?.text || ""));
    assert.equal(route(stay, q).needsModel, undefined, q);
    assert.match(answer.text.replace(/\*/g, ""), /^Call 911 now\./);
    assert.doesNotMatch(answer.text, /\$28|Market Square|Knoxville|Dogs under/i, q);
  }
  for (const q of [
    "atropelló a mi perro en el estacionamiento",
    "un carro chocó a una persona",
    "hay un accidente de carro",
    "están usando drogas en la escalera",
    "están vendiendo drogas",
    "están peleando en el pasillo",
    "están robando mi carro",
  ]) assert911(q, { spanish: true });
});

test("drugstore, pet policy, and ordinary mishaps do not call 911", () => {
  const stay = {
    ...hotel,
    parking: "Valet parking at the main entrance is $28 per night.",
    pets: "Dogs under 40 lb are welcome.",
  };
  const ordinary = [
    "where is the nearest drugstore",
    "where is the pharmacy",
    "I need my prescription medication",
    "what is the parking lot rate",
    "what is your dog policy",
    "what is the pet policy",
    "we ran out of towels",
    "I ran into a friend in the lobby",
    "the remote is fighting with the TV remote",
    "fighting with the TV remote",
    "I'm crashing for the night",
    "I crashed early, what time is breakfast",
    "how much is valet",
  ];
  for (const q of ordinary) {
    const answer = matchIntent(stay, q);
    const text = answer?.text || "";
    assert.notEqual(answer?.kind, "emergency", q + " -> " + text);
    assert.doesNotMatch(text, /911/, q + " -> " + text);
  }
  assert.match(matchIntent(stay, "what is the parking lot rate").text, /\$28/);
  assert.match(matchIntent(stay, "what is your dog policy").text, /Dogs under 40/);
});

test("Jim's three phone misses call 911 first", () => {
  for (const q of [
    "Someone just fell down the stairs",
    "Someone is trying to break into my room",
    "A pregnant woman just been into labor",
  ]) assert911(q);
});

test("the seven live misses call 911 before the front desk", () => {
  for (const q of [
    "no puedo respirar",
    "hay un incendio",
    "se desmayó",
    "el niño se está ahogando",
    "necesito una ambulancia ya",
    "Grandpa clutched his chest and fell.",
    "The kids smell smoke in the hall.",
  ]) {
    assert911(q, { spanish: /[áéíóúñ]|puedo|incendio|desmay|ahog|ambulancia/i.test(q) });
  }
});

test("spanish emergency variants lead with Llame al 911 ahora", () => {
  for (const q of [
    "creo que es un infarto",
    "tiene dolor de pecho",
    "hay mucha sangre",
    "está teniendo una convulsión",
    "huele a humo en el pasillo",
    "hay fuego en la cocina",
    "no puedo respirar y hay humo",
    "se desmayo en el lobby",
    "el bebe se esta ahogando",
  ]) assert911(q, { spanish: true });
});

test("plain-language English emergencies call 911 first", () => {
  for (const q of [
    "I have chest pain",
    "she clutched her chest and fell",
    "he fainted",
    "she passed out",
    "the guest is unresponsive",
    "my friend is choking",
    "the baby is not breathing",
    "I can't breathe",
    "he's having a seizure",
    "heavy bleeding from his arm",
    "I think this is an overdose",
    "stroke signs, one side of his face is drooping",
    "someone is drowning in the pool",
    "I smell smoke",
    "I see smoke in the room",
    "the fire alarm is going off",
    "I smell gas",
    "someone is threatening me",
    "a man is attacking a guest",
    "help there is a fire",
  ]) assert911(q);
});

test("ordinary questions do not call 911", () => {
  for (const q of [
    "is the pool open",
    "where is the fire pit",
    "my phone is dying",
    "I'm dying to know breakfast hours",
    "smoked salmon at breakfast?",
    "can I smoke",
    "do you have a smoking room",
    "can I vape on the balcony",
    "what time is breakfast",
  ]) {
    const answer = hit(q);
    const text = answer?.text || "";
    assert.notEqual(answer?.kind, "emergency", q + " -> " + text);
    assert.doesNotMatch(text, /911/, q + " -> " + text);
  }
});

test("a smoking-policy question still gets the policy", () => {
  for (const q of ["can I smoke in the room", "is this a smoking room", "where can I vape"]) {
    const answer = hit(q);
    assert.equal(answer.intent, "smoking", q);
    assert.match(answer.text, /not allowed inside/);
    assert.doesNotMatch(answer.text, /911/);
  }
});

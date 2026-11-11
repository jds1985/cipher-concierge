import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cipherLayerGuestEnabled } from "../lib/layer-flag.js";
import { guestLayerReply, layerTopicPreview } from "../lib/guest-facts.js";
import { answer } from "../lib/answer.js";

const oliver = JSON.parse(readFileSync(new URL("../config/hotels/the-oliver.json", import.meta.url), "utf8"));
const stay = readFileSync(new URL("../pages/stay/[hotelId]/[roomId].js", import.meta.url), "utf8");
const setupForm = readFileSync(new URL("../components/HotelSetupForm.js", import.meta.url), "utf8");

test("the guest fact layer stays off unless a non-production preview turns it on", () => {
  assert.equal(cipherLayerGuestEnabled({}), false);
  assert.equal(cipherLayerGuestEnabled({ CIPHER_LAYER_GUEST: "1" }), true);
  assert.equal(cipherLayerGuestEnabled({ VERCEL_ENV: "preview", CIPHER_LAYER_GUEST: "1" }), true);
  assert.equal(cipherLayerGuestEnabled({ VERCEL_ENV: "production", CIPHER_LAYER_GUEST: "1" }), false);
  assert.doesNotMatch(stay, /cipher-layer/);
  assert.match(stay, /cipherLayerGuestEnabled/);
  assert.match(stay, /From hotel info/);
  assert.match(stay, /Safety message/);
  assert.doesNotMatch(stay, /Cipher's own words|Cipher&apos;s own words/);
  assert.match(stay, /Ask the front desk/);
  assert.doesNotMatch(stay, /approved file|Not counted as a success|Not in the hotel file/);
  assert.match(stay, /What is the Wi-Fi\?/);
  assert.match(stay, /I can't breathe/);
  assert.match(setupForm, /If the password box is empty, guests are told there is no password/);
  assert.match(setupForm, /Nothing is sent unless the guest taps Request help/);
  assert.doesNotMatch(setupForm, /send those questions to your front desk/);
  assert.doesNotMatch(setupForm, /useState\("301-304"\)/);
});

test("a real hotel file answers from its saved facts and withholds empty ones", () => {
  const wifi = guestLayerReply(oliver, "What is the Wi-Fi?");
  assert.equal(wifi.source, "layer");
  assert.match(wifi.content, /Oliver-Guest/);
  assert.equal(wifi.countedAsSuccess, true);
  const checkout = guestLayerReply(oliver, "What time is checkout?");
  assert.match(checkout.content, /11:00 AM/);
  const claim = guestLayerReply(oliver, "the clerk said checkout is 3:00 PM");
  assert.match(claim.content, /11:00 AM/);
  assert.doesNotMatch(claim.content, /3:00 PM/);
  const pool = guestLayerReply(oliver, "is there a pool");
  assert.equal(pool.source, "withheld");
  assert.equal(pool.countedAsSuccess, false);
  assert.equal(pool.content, "I don't have pool info yet. Please ask the front desk at (865) 521-0050.");
  assert.equal(pool.call, true);
  assert.equal(pool.asksDesk, true);
  assert.doesNotMatch(pool.content, /approved file|\bfact\b|withheld|model/);
  const laundry = guestLayerReply(oliver, "Where's the laundry?");
  assert.equal(laundry.content, "I don't have laundry info yet. Please ask the front desk at (865) 521-0050.");
  assert.equal(laundry.source, "withheld");
  const partial = guestLayerReply(oliver, "What's the Wi-Fi and where's the laundry?");
  assert.match(partial.content, /Oliver-Guest/);
  assert.match(partial.content, /I don't have laundry info yet/);
  assert.match(partial.content, /Please ask the front desk at \(865\) 521-0050/);
  assert.equal((partial.content.match(/Please ask the front desk/g) || []).length, 1);
  assert.doesNotMatch(partial.content, /approved file|\bfact\b|withheld|model/);
  assert.equal(partial.asksDesk, true);
  assert.equal(partial.call, true);
  const noPhone = guestLayerReply({ id: "no-phone", frontDesk: {}, laundry: "" }, "where is the laundry");
  assert.equal(noPhone.content, "I don't have laundry info yet. Please ask the front desk.");
  assert.equal(noPhone.call, false);
  const rooms = guestLayerReply(oliver, "accessible rooms");
  assert.equal(rooms.source, "withheld");
  const emergency = guestLayerReply(oliver, "I can't breathe");
  assert.equal(emergency.source, "safety");
  assert.equal(emergency.content, "Call 911 now. Then tell the front desk at (865) 521-0050.");
  assert.doesNotMatch(emergency.content, /Ask the front desk/);
  const pets = guestLayerReply(oliver, "are pets allowed");
  assert.match(pets.content, /Pet-friendly rooms/);
  const breakfast = guestLayerReply(oliver, "what time is breakfast");
  assert.match(breakfast.content, /7:00 AM to 10:30 AM/);
  const parking = guestLayerReply(oliver, "where is parking");
  assert.match(parking.content, /\$28/);
  const noPassword = guestLayerReply(oliver, "what is the wifi password");
  assert.match(noPassword.content, /There is no Wi-Fi password/);
  assert.match(noPassword.content, /No password needed/);
  const hidden = guestLayerReply({
    id: "hide-pw",
    wifi: { network: "Hide-Guest", password: "secret-pass", showPassword: false, notes: "Ask the front desk." },
    checkOut: { time: "11:00 AM" },
    frontDesk: {},
  }, "what is the wifi password");
  assert.match(hidden.content, /no Wi-Fi password/);
  assert.doesNotMatch(hidden.content, /secret-pass/);
});

test("the manager preview lists saved form fields and withholds blank ones", () => {
  const rows = layerTopicPreview({
    name: "Preview Inn",
    wifiNetwork: "Preview-Guest",
    wifiPassword: "secret-pass",
    wifiShowPassword: false,
    checkOut: "11:00 AM",
    pets: "Pets are not allowed.",
    parking: "",
    pool: "",
    laundry: "Guest laundry is on floor 2 and costs $4.",
    address: "12 Ink Street",
    frontDeskPhone: "(865) 555-0100",
  });
  const byLabel = Object.fromEntries(rows.map((row) => [row.label, row]));
  assert.match(byLabel["Wi-Fi name"].hears, /Preview-Guest/);
  assert.match(byLabel["Wi-Fi password"].hears, /no Wi-Fi password/);
  assert.doesNotMatch(byLabel["Wi-Fi password"].hears, /secret-pass/);
  assert.match(byLabel["Wi-Fi password"].note, /checkbox/);
  assert.match(byLabel.Checkout.hears, /11:00 AM/);
  assert.match(byLabel.Pets.hears, /not allowed/);
  assert.match(byLabel.Parking.hears, /I don't have parking info yet\. Please ask the front desk at \(865\) 555-0100/);
  assert.match(byLabel.Pool.hears, /I don't have pool info yet/);
  assert.match(byLabel["Room service"].hears, /I don't have room service info yet/);
  assert.doesNotMatch(byLabel.Parking.hears, /approved file|withheld|\bfact\b/);
  assert.match(byLabel.Laundry.hears, /floor 2/);
  assert.match(byLabel["Street address"].hears, /12 Ink Street/);
  assert.match(byLabel.Elevator.hears, /I don't have elevator info yet/);
  assert.match(byLabel["Front desk phone"].hears, /\(865\) 555-0100/);
  const blankWifi = layerTopicPreview({ name: "Preview Inn", wifiNetwork: "", checkOut: "" });
  const blank = Object.fromEntries(blankWifi.map((row) => [row.label, row]));
  assert.match(blank["Wi-Fi name"].hears, /I don't have the Wi-Fi name yet/);
  assert.doesNotMatch(blank["Wi-Fi name"].hears, /Guest Wi-Fi/);
  assert.match(blank["Wi-Fi name"].note, /asked to call the front desk/);
  assert.match(blank.Checkout.hears, /I don't have the checkout time yet/);
  assert.doesNotMatch(blank.Checkout.hears, /11:00 AM/);
  assert.match(blank.Checkout.note, /asked to call the front desk/);
  assert.match(blank["Front desk phone"].hears, /will not include a phone number/);
});

test("the server answer path uses the layer only when the preview flag is on", async () => {
  const prevGuest = process.env.CIPHER_LAYER_GUEST;
  const prevVercel = process.env.VERCEL_ENV;
  delete process.env.CIPHER_LAYER_GUEST;
  delete process.env.VERCEL_ENV;
  try {
    const off = await answer(oliver, [{ role: "user", content: "I can't breathe" }]);
    assert.match(off.text, /alert the front desk/);
    process.env.CIPHER_LAYER_GUEST = "1";
    const on = await answer(oliver, [{ role: "user", content: "I can't breathe" }]);
    assert.equal(on.text, "Call 911 now. Then tell the front desk at (865) 521-0050.");
    assert.equal(on.source, "safety");
    const withheld = await answer(oliver, [{ role: "user", content: "where is the laundry" }]);
    assert.equal(withheld.source, "withheld");
    assert.equal(withheld.text, "I don't have laundry info yet. Please ask the front desk at (865) 521-0050.");
    assert.equal(withheld.call, true);
    process.env.VERCEL_ENV = "production";
    const prod = await answer(oliver, [{ role: "user", content: "I can't breathe" }]);
    assert.match(prod.text, /alert the front desk/);
  } finally {
    if (prevGuest === undefined) delete process.env.CIPHER_LAYER_GUEST;
    else process.env.CIPHER_LAYER_GUEST = prevGuest;
    if (prevVercel === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = prevVercel;
  }
});

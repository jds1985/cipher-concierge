import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeHotelForm, expandRooms, slugifyHotelId, toTel, cleanText } from "../lib/hotel-form.js";
import {
  _resetStoreClient,
  createHotelShell,
  getHotelByEditToken,
  hotelIdForEditToken,
  saveHotel,
  guestHotel,
  stripSecrets,
  storeBackend,
  hashSecret,
} from "../lib/store.js";
import { resolveHotel, getHotel } from "../lib/hotels.js";
import { matchIntent } from "../lib/intents.js";
import { adminOkReq, adminKeyFromReq } from "../lib/admin.js";

test("sanitizeHotelForm: required name, wifi opt-in, places, faqs", () => {
  const bad = sanitizeHotelForm({});
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((e) => /name/i.test(e)));

  const ok = sanitizeHotelForm({
    name: "  River Inn  ",
    frontDeskPhone: "(865) 555-0199",
    wifiNetwork: "RiverGuest",
    wifiPassword: "secret-pw",
    wifiShowPassword: false,
    checkIn: "4:00 PM",
    checkOut: "11:00 AM",
    lateCheckout: "Ask desk for late checkout.",
    breakfastHours: "7–10 AM",
    breakfastIncluded: "yes",
    breakfastLocation: "Lobby",
    parking: "Garage $20",
    pool: "Rooftop pool",
    gym: "24h gym",
    spa: "Spa by appointment",
    pets: "Dogs welcome",
    roomService: "Until 10 PM",
    nearbyRestaurants: "Kabuki — sushi\nTupelo Honey",
    nearbyCoffee: "Pretentious Coffee — 3 min walk",
    nearbyBars: "Peter Kern Lounge — cocktails",
    faqs: "Q: Shuttle?\nA: Hourly to airport.\n\nQ: Ice?\nA: End of each hall.",
    city: "Knoxville, TN",
    area: "Market Square",
  });
  assert.equal(ok.ok, true);
  const h = ok.hotelPatch;
  assert.equal(h.name, "River Inn");
  assert.equal(h.frontDesk.phoneTel, "+18655550199");
  assert.equal(h.wifi.showPassword, false);
  assert.equal(h.wifi.password, "secret-pw");
  assert.equal(h.breakfast.included, true);
  assert.equal(h.parking, "Garage $20");
  assert.ok(h.localRecommendations.some((r) => r.kind === "coffee" && /Pretentious/.test(r.name)));
  assert.ok(h.localRecommendations.some((r) => r.kind === "bar"));
  assert.ok(h.faqs.length >= 2);
  assert.equal(h.faqs[0].q.includes("Shuttle"), true);
});


test("sanitizeHotelForm: dining breakfast location not duplicated when name is the place", () => {
  const ok = sanitizeHotelForm({
    name: "River Inn",
    frontDeskPhone: "(865) 555-0199",
    breakfastHours: "7–10 AM",
    breakfastIncluded: "yes",
    breakfastLocation: "Lobby cafe",
  });
  assert.equal(ok.ok, true);
  const d = ok.hotelPatch.dining[0];
  assert.equal(d.name, "Lobby cafe");
  assert.equal(d.location, null);
  assert.equal(ok.hotelPatch.breakfast.location, "Lobby cafe");
});

test("expandRooms + slugify + toTel", () => {
  assert.deepEqual(expandRooms("301-303, 412, PH1"), ["301", "302", "303", "412", "PH1"]);
  assert.equal(slugifyHotelId("The River Inn!!!"), "the-river-inn");
  assert.equal(toTel("(865) 555-0100"), "+18655550100");
  assert.equal(cleanText("a\u0000b", 10), "ab");
});

test("store: create, edit token isolation, guest wifi strip (memory backend)", async () => {
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  _resetStoreClient();
  assert.equal(storeBackend(), "memory");

  const { hotel, editToken } = await createHotelShell({ id: "test-river", name: "River Inn" });
  assert.ok(editToken.length >= 20);
  assert.ok(hotel._meta.editKeyHash);
  assert.equal(hotel._meta.editKeyHash, hashSecret(editToken));

  const loaded = await getHotelByEditToken(editToken);
  assert.equal(loaded.id, "test-river");
  assert.equal(await hotelIdForEditToken("totally-wrong-token-xxxxxxxxxxxx"), null);
  assert.equal(await getHotelByEditToken("totally-wrong-token-xxxxxxxxxxxx"), null);

  const patched = {
    ...hotel,
    wifi: { network: "RiverGuest", password: "pw-hide", showPassword: false, notes: null },
    breakfast: { hours: "7-10", included: true, location: "Lobby" },
    parking: "Valet $25",
    checkOut: { time: "11:00 AM", late: "Ask desk" },
    localRecommendations: [
      { name: "Bean There", distance: "nearby", description: "Coffee shop nearby.", cuisines: ["coffee"], kind: "coffee", hours: null, source: "hotel-provided" },
      { name: "Night Owl", distance: "nearby", description: "Bar or lounge nearby.", cuisines: ["bar", "cocktails"], kind: "bar", hours: null, source: "hotel-provided" },
    ],
  };
  await saveHotel(patched);

  const guest = guestHotel(await getHotelByEditToken(editToken));
  assert.equal(guest.wifi.password, null);
  assert.equal(guest._meta?.editKeyHash, undefined);
  assert.equal(stripSecrets(patched)._meta?.editKeyHash, undefined);

  // showPassword true exposes password to guests
  patched.wifi.showPassword = true;
  await saveHotel(patched);
  assert.equal(guestHotel(await getHotelByEditToken(editToken)).wifi.password, "pw-hide");
});

test("resolveHotel: file hotels still win; unknown null", async () => {
  const oliver = await resolveHotel("the-oliver");
  assert.equal(oliver.name, getHotel("the-oliver").name);
  assert.equal(await resolveHotel("no-such-hotel-zzz"), null);
});

test("intents: breakfast-included, coffee nearby, bar/lounge from self-setup shape", () => {
  const h = {
    id: "x", name: "X Hotel",
    frontDesk: { inRoom: "Dial 0", phoneDisplay: "(555) 0100", phoneTel: "+15550100" },
    wifi: { network: "X", password: "p", showPassword: true, notes: null },
    checkIn: { time: "3 PM" }, checkOut: { time: "11 AM", late: "Ask" },
    breakfast: { hours: "7-10 AM", included: true, location: "Lobby" },
    dining: [{ name: "Lobby Cafe", type: "Complimentary breakfast", location: "Lobby", meals: { breakfast: "7-10 AM" }, hours: null, included: true },
              { name: "Sky Lounge", type: "Bar", location: "Rooftop", meals: {}, hours: "4:00 PM to 11:00 PM", kind: "bar" }],
    parking: "Garage", pool: null, fitness: null, spa: "Spa 9-5", pets: null, roomService: null,
    amenities: [], localRecommendations: [
      { name: "Pretentious Coffee", distance: "3-minute walk", description: "Specialty coffee", cuisines: ["coffee"], kind: "coffee" },
      { name: "Peter Kern", distance: "nearby", description: "Speakeasy cocktails", cuisines: ["bar", "cocktails"], kind: "bar" },
    ],
    faqs: [{ q: "Do you have a shuttle?", a: "Hourly to the airport." }],
  };

  const bi = matchIntent(h, "is breakfast included?");
  assert.equal(bi.intent, "breakfast_included");
  assert.match(bi.text, /included/i);

  const coffee = matchIntent(h, "is there a coffee shop nearby?");
  assert.equal(coffee.intent, "coffee_nearby");
  assert.match(coffee.text, /Pretentious/);

  const bar = matchIntent(h, "is there a bar or lounge?");
  assert.equal(bar.intent, "bar_lounge");
  assert.match(bar.text, /Sky Lounge|Peter Kern/);

  const faq = matchIntent(h, "do you have a shuttle?");
  assert.equal(faq.intent, "faq");
  assert.match(faq.text, /airport/i);
});


test("intents: breakfast does not echo location when name equals location", () => {
  const h = {
    id: "x", name: "X Hotel",
    frontDesk: { inRoom: "Dial 0", phoneDisplay: "(555) 0100", phoneTel: "+15550100" },
    wifi: { network: "X", password: "p", showPassword: true, notes: null },
    checkIn: { time: "3 PM" }, checkOut: { time: "11 AM", late: null },
    breakfast: { hours: "6:30-9:30 AM", included: true, location: "Lobby cafe" },
    dining: [{ name: "Lobby cafe", type: "Complimentary breakfast", location: "Lobby cafe", meals: { breakfast: "6:30-9:30 AM" }, hours: null, included: true }],
    parking: null, pool: null, fitness: null, spa: null, pets: null, roomService: null,
    amenities: [], localRecommendations: [], faqs: [],
  };
  const b = matchIntent(h, "When is breakfast?");
  assert.equal(b.intent, "breakfast");
  assert.match(b.text, /Lobby cafe/);
  assert.match(b.text, /6:30-9:30 AM/);
  assert.doesNotMatch(b.text, /\(Lobby cafe\)/);
  // Distinct location still shown
  const h2 = {
    ...h,
    dining: [{ name: "Lobby Cafe", type: "Complimentary breakfast", location: "Lobby", meals: { breakfast: "7-10 AM" }, hours: null, included: true }],
  };
  const b2 = matchIntent(h2, "When is breakfast?");
  assert.match(b2.text, /\(Lobby\)/);
});

test("intents: sample hotels — coffee no longer stolen by breakfast; breakfast included honest", () => {
  const oliver = getHotel("the-oliver");
  const coffee = matchIntent(oliver, "coffee shop close by");
  // Oliver may or may not have coffee tagged; must NOT be breakfast intent
  assert.notEqual(coffee?.intent, "breakfast");

  const bi = matchIntent(oliver, "is breakfast included");
  assert.equal(bi.intent, "breakfast_included");
  // Sample data has hours but included is unknown → mentions desk or "don't have whether"
  assert.ok(/included|front desk/i.test(bi.text));

  const lounge = matchIntent(oliver, "what time does the lounge close");
  assert.equal(lounge.intent, "bar_lounge");
});

test("admin key: header preferred, not required from URL for new pages", () => {
  const prev = process.env.ADMIN_KEY;
  process.env.ADMIN_KEY = "test-admin-secret-xyz";
  try {
    assert.equal(adminOkReq({ headers: { "x-admin-key": "test-admin-secret-xyz" }, body: {}, query: {} }), true);
    assert.equal(adminOkReq({ headers: {}, body: { adminKey: "test-admin-secret-xyz" }, query: {} }), true);
    assert.equal(adminOkReq({ headers: {}, body: {}, query: { key: "wrong" } }), false);
    assert.equal(adminKeyFromReq({ headers: { "x-admin-key": "h" }, body: { adminKey: "b" }, query: { key: "q" } }), "h");
  } finally {
    if (prev == null) delete process.env.ADMIN_KEY;
    else process.env.ADMIN_KEY = prev;
  }
});

test("place lines: keep hyphenated descriptions; bars not duplicated on-site", () => {
  const ok = sanitizeHotelForm({
    name: "Hyphen Hotel",
    nearbyCoffee: "Pretentious Coffee — 3-minute walk",
    nearbyBars: "Peter Kern Lounge — speakeasy cocktails",
  });
  assert.equal(ok.ok, true);
  const coffee = ok.hotelPatch.localRecommendations.find((r) => r.kind === "coffee");
  assert.equal(coffee.name, "Pretentious Coffee");
  assert.match(coffee.description, /3-minute walk/);
  assert.equal(ok.hotelPatch.dining.some((d) => d.kind === "bar"), false);
  assert.ok(ok.hotelPatch.localRecommendations.some((r) => r.kind === "bar"));
});

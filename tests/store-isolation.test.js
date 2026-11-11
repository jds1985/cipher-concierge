import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { _resetStoreClient, createHotelShell, getStoredHotel, kvGetJson, listStoredHotelIds, storePrefix } from "../lib/store.js";
import { sanitizeHotelForm } from "../lib/hotel-form.js";
import { matchIntent } from "../lib/intents.js";
import { factLines } from "../lib/factpack.js";
import { guestLayerReply } from "../lib/guest-facts.js";
import { handleEvent, _setStripeClient } from "../lib/billing.js";

delete process.env.KV_REST_API_URL;
delete process.env.KV_REST_API_TOKEN;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

test("preview and development use their own key prefix; production stays on the live prefix", async () => {
  const prev = process.env.VERCEL_ENV;
  _resetStoreClient();
  try {
    delete process.env.VERCEL_ENV;
    assert.equal(storePrefix(), "cc:v1:");
    process.env.VERCEL_ENV = "production";
    assert.equal(storePrefix(), "cc:v1:");
    const live = await createHotelShell({ id: "live-only-hotel", name: "Live Only" });
    assert.equal(live.hotel.checkOut.time, null);
    assert.equal(live.hotel.wifi.network, null);

    process.env.VERCEL_ENV = "preview";
    assert.equal(storePrefix(), "cc:v1:preview:");
    assert.equal(await getStoredHotel("live-only-hotel"), null);
    await createHotelShell({ id: "preview-only-hotel", name: "Preview Only" });
    assert.equal((await getStoredHotel("preview-only-hotel")).name, "Preview Only");
    assert.equal(await kvGetJson("cc:v1:hotel:preview-only-hotel"), null);
    assert.equal((await kvGetJson("cc:v1:preview:hotel:preview-only-hotel")).id, "preview-only-hotel");
    const previewIds = await listStoredHotelIds();
    assert.ok(previewIds.includes("preview-only-hotel"));
    assert.equal(previewIds.includes("live-only-hotel"), false);

    process.env.VERCEL_ENV = "development";
    assert.equal(storePrefix(), "cc:v1:development:");
    assert.equal(await getStoredHotel("live-only-hotel"), null);
    assert.equal(await getStoredHotel("preview-only-hotel"), null);
    await createHotelShell({ id: "dev-only-hotel", name: "Dev Only" });

    process.env.VERCEL_ENV = "production";
    assert.equal((await getStoredHotel("live-only-hotel")).name, "Live Only");
    assert.equal(await getStoredHotel("preview-only-hotel"), null);
    assert.equal(await getStoredHotel("dev-only-hotel"), null);
    const liveIds = await listStoredHotelIds();
    assert.deepEqual(liveIds, ["live-only-hotel"]);
  } finally {
    if (prev === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = prev;
  }
});

test("a preview Stripe event does not write the live billing key", async () => {
  const prev = process.env.VERCEL_ENV;
  _resetStoreClient();
  _setStripeClient({ subscriptions: { retrieve: async () => { throw new Error("should use the event object"); } } });
  process.env.VERCEL_ENV = "production";
  try {
    await handleEvent({
      id: "evt_preview_iso",
      type: "checkout.session.completed",
      data: { object: {
        mode: "subscription",
        customer: "cus_preview_iso",
        client_reference_id: "iso-hotel",
        metadata: { hotelId: "iso-hotel", storeEnv: "preview" },
        subscription: {
          id: "sub_preview_iso",
          customer: "cus_preview_iso",
          status: "trialing",
          metadata: { hotelId: "iso-hotel", storeEnv: "preview" },
          trial_end: 1900000000,
          items: { data: [{ id: "si_iso", quantity: 4, current_period_end: 1900000000 }] },
        },
      } },
    });
    assert.equal(await kvGetJson("cc:v1:billing:iso-hotel"), null);
    assert.equal((await kvGetJson("cc:v1:preview:billing:iso-hotel")).status, "trialing");
    assert.equal(await kvGetJson("cc:v1:hotel:iso-hotel"), null);
  } finally {
    _setStripeClient(null);
    if (prev === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = prev;
  }
});

test("a blank Wi-Fi name and a blank checkout stay blank", () => {
  const saved = sanitizeHotelForm({ name: "Blank Inn", wifiNetwork: "   ", checkOut: "  ", wifiPassword: "" });
  assert.equal(saved.ok, true);
  assert.equal(saved.hotelPatch.wifi.network, null);
  assert.equal(saved.hotelPatch.checkOut.time, null);
  const filled = sanitizeHotelForm({ name: "Blank Inn", wifiNetwork: "Real-Guest", checkOut: "10:30 AM" });
  assert.equal(filled.hotelPatch.wifi.network, "Real-Guest");
  assert.equal(filled.hotelPatch.checkOut.time, "10:30 AM");

  const hotel = {
    id: "blank-inn",
    ...saved.hotelPatch,
    frontDesk: { inRoom: "Dial 0", phoneDisplay: "(865) 555-0199", phoneTel: "+18655550199" },
  };
  const wifi = matchIntent(hotel, "what is the wifi");
  assert.match(wifi.text, /don't have Wi-Fi/i);
  assert.doesNotMatch(wifi.text, /Guest Wi-Fi/);
  const checkout = matchIntent(hotel, "what time is checkout");
  assert.match(checkout.text, /don't have checkout/i);
  assert.doesNotMatch(checkout.text, /11:00 AM/);
  const lines = factLines(hotel).map((line) => line.text).join(" ");
  assert.doesNotMatch(lines, /Guest Wi-Fi|11:00 AM|Check-out is at null|Wi-Fi network: null/);

  const guestWifi = guestLayerReply(hotel, "what is the wifi name");
  assert.match(guestWifi.content, /I don't have the Wi-Fi name yet/);
  assert.doesNotMatch(guestWifi.content, /Guest Wi-Fi/);
  const guestOut = guestLayerReply(hotel, "what time is checkout");
  assert.match(guestOut.content, /I don't have the checkout time yet/);
  assert.doesNotMatch(guestOut.content, /11:00 AM/);

  const signup = readFileSync(new URL("../pages/signup.js", import.meta.url), "utf8");
  assert.doesNotMatch(signup, /No owner key/);
  const form = readFileSync(new URL("../components/HotelSetupForm.js", import.meta.url), "utf8");
  assert.doesNotMatch(form, /checkOut: "11:00 AM"/);
});

import test from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { Readable } from "node:stream";
import { _resetStoreClient, createHotelShell } from "../lib/store.js";
import { monthlyCents, cleanRooms, guestAccess, getBilling, setBilling, handleEvent, _setStripeClient, createCheckout, ownerSetFounding } from "../lib/billing.js";
import webhook from "../pages/api/stripe/webhook.js";
import adminBilling from "../pages/api/admin/billing.js";

delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN;
process.env.ADMIN_KEY = "test-admin-key-123";
process.env.STRIPE_SECRET_KEY = "sk_test_fake";
process.env.STRIPE_PRICE_ID_ROOM_MONTHLY = "price_test_room";
process.env.STRIPE_FOUNDING_COUPON_ID = "CONCIERGE_FOUNDING_50";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";

const mockRes = () => { const r = { statusCode: 200, headers: {}, body: null }; r.setHeader = (k, v) => { r.headers[k] = v; }; r.status = (c) => { r.statusCode = c; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };

function fakeStripe(subs) {
  const calls = { checkout: [], updates: [] };
  const real = new Stripe("sk_test_fake");
  return { calls, webhooks: real.webhooks,
    customers: { create: async (p) => ({ id: "cus_1", ...p }) },
    checkout: { sessions: { create: async (p) => { calls.checkout.push(p); return { url: "https://checkout.stripe.test/s" }; } } },
    subscriptions: { retrieve: async (id) => subs[id], update: async (id, p) => { calls.updates.push([id, p]); return subs[id]; } },
    billingPortal: { sessions: { create: async () => ({ url: "https://billing.stripe.test/p" }) } } };
}
const sub = (status, extra = {}) => ({ id: "sub_1", customer: "cus_1", status, metadata: { hotelId: "h1" }, trial_end: 1900000000, items: { data: [{ id: "si_1", quantity: 40, current_period_end: 1900000000 }] }, ...extra });

test("pricing = max(rooms x $3, $99); founding = half", () => {
  assert.equal(monthlyCents(10), 9900);
  assert.equal(monthlyCents(33), 9900);
  assert.equal(monthlyCents(34), 10200);
  assert.equal(monthlyCents(100), 30000);
  assert.equal(monthlyCents(10, true), 4950);
  assert.equal(monthlyCents(100, true), 15000);
  assert.equal(cleanRooms("40"), 40); assert.equal(cleanRooms(0), null); assert.equal(cleanRooms(2.5), null); assert.equal(cleanRooms(5000), null);
});

test("guest access by status", async () => {
  _resetStoreClient();
  assert.equal((await guestAccess("x", { isFile: true })).ok, true);
  assert.equal((await guestAccess("none")).ok, true);
  process.env.BILLING_REQUIRED = "on"; assert.equal((await guestAccess("none")).ok, false); delete process.env.BILLING_REQUIRED;
  for (const [s, ok] of [["trialing", true], ["active", true], ["past_due", true], ["unpaid", false], ["canceled", false], ["paused", false], ["incomplete_expired", false]]) {
    await setBilling("h", { status: s, comp: false });
    assert.equal((await guestAccess("h")).ok, ok, s);
  }
  await setBilling("h", { comp: true }); assert.equal((await guestAccess("h")).ok, true);
});

test("checkout: subscription mode, 30-day trial, quantity, founding coupon, no payment_method_types", async () => {
  _resetStoreClient();
  const { hotel } = await createHotelShell({ id: "h1", name: "River Inn" });
  const fs = fakeStripe({}); _setStripeClient(fs);
  await setBilling(hotel.id, { founding: true });
  const url = await createCheckout({ hotelId: "h1", email: "gm@river.test", rooms: 40, baseUrl: "https://x.test" });
  assert.match(url, /checkout/);
  const p = fs.calls.checkout[0];
  assert.equal(p.mode, "subscription");
  assert.equal(p.subscription_data.trial_period_days, 30);
  assert.equal(p.line_items[0].quantity, 40);
  assert.deepEqual(p.discounts, [{ coupon: "CONCIERGE_FOUNDING_50" }]);
  assert.equal(p.client_reference_id, "h1");
  assert.ok(!("payment_method_types" in p));
  assert.equal(p.success_url, "https://x.test/billing/success");
  assert.equal(p.cancel_url, "https://x.test/billing/canceled");
  await setBilling("h1", { subscriptionId: "sub_1", status: "trialing" });
  await assert.rejects(createCheckout({ hotelId: "h1", email: "gm@river.test", rooms: 40, baseUrl: "https://x.test" }), /already/);
});

test("webhook: signature, fulfillment, idempotency, invoice + deletion", async () => {
  _resetStoreClient();
  await createHotelShell({ id: "h1", name: "River Inn" });
  const subs = { sub_1: sub("trialing") };
  _setStripeClient(fakeStripe(subs));
  const send = async (event, sig) => {
    const payload = JSON.stringify(event);
    const header = sig ?? Stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
    const req = Readable.from([Buffer.from(payload)]); req.method = "POST"; req.headers = { "stripe-signature": header };
    const res = mockRes(); await webhook(req, res); return res;
  };
  const done = { id: "evt_1", type: "checkout.session.completed", data: { object: { mode: "subscription", subscription: "sub_1", customer: "cus_1", client_reference_id: "h1" } } };
  assert.equal((await send(done, "t=1,v1=bad")).statusCode, 400);
  const r = await send(done);
  assert.equal(r.statusCode, 200); assert.equal(r.body.result, "synced");
  let b = await getBilling("h1");
  assert.equal(b.status, "trialing"); assert.equal(b.rooms, 40); assert.equal(b.customerId, "cus_1");
  assert.equal((await send(done)).body.result, "duplicate");
  subs.sub_1 = sub("unpaid");
  await send({ id: "evt_2", type: "invoice.payment_failed", data: { object: { id: "in_1", customer: "cus_1", status: "open", amount_due: 9900, parent: { subscription_details: { subscription: "sub_1", metadata: { hotelId: "h1" } } } } } });
  b = await getBilling("h1");
  assert.equal(b.status, "unpaid"); assert.equal(b.lastInvoice.id, "in_1");
  assert.equal((await guestAccess("h1")).ok, false);
  await send({ id: "evt_3", type: "customer.subscription.deleted", data: { object: sub("canceled") } });
  assert.equal((await getBilling("h1")).status, "canceled");
});

test("owner billing API: auth, founding applies coupon to live sub, rooms", async () => {
  _resetStoreClient();
  await createHotelShell({ id: "h1", name: "River Inn" });
  const fs = fakeStripe({ sub_1: sub("active") }); _setStripeClient(fs);
  await setBilling("h1", { subscriptionId: "sub_1", itemId: "si_1", status: "active" });
  const call = async (body, key = "test-admin-key-123") => { const res = mockRes(); await adminBilling({ method: "POST", body, headers: { "x-admin-key": key } }, res); return res; };
  assert.equal((await call({ action: "list" }, "nope")).statusCode, 401);
  assert.equal((await call({ action: "founding", hotelId: "h1", founding: true })).statusCode, 200);
  assert.deepEqual(fs.calls.updates[0], ["sub_1", { discounts: [{ coupon: "CONCIERGE_FOUNDING_50" }] }]);
  assert.equal((await call({ action: "rooms", hotelId: "h1", rooms: 60 })).statusCode, 200);
  assert.deepEqual(fs.calls.updates[1][1], { items: [{ id: "si_1", quantity: 60 }] });
  const list = await call({ action: "list" });
  const row = list.body.hotels.find((h) => h.id === "h1");
  assert.equal(row.founding, true); assert.equal(row.guestAccess, true);
  assert.equal((await call({ action: "rooms", hotelId: "h1", rooms: 0 })).statusCode, 400);
  _setStripeClient(null);
});

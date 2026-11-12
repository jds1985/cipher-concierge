import test from "node:test";
import assert from "node:assert/strict";
import { _resetStoreClient, getStoredHotel } from "../lib/store.js";
import { _reset as resetRate } from "../lib/ratelimit.js";
import { getUser } from "../lib/auth.js";
import { billingButtonVisible, billingCheckoutAllowed, BILLING_OPENS_AT } from "../lib/billing.js";
import signup from "../pages/api/auth/signup.js";

delete process.env.KV_REST_API_URL;
delete process.env.KV_REST_API_TOKEN;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

function mockRes() {
  const r = { statusCode: 200, headers: {}, body: null };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}

function req(body, ip = "203.0.113.10") {
  return { method: "POST", body, headers: { origin: "http://localhost:3000", host: "localhost:3000", "x-forwarded-for": ip } };
}

test("paid checkout stays hidden until December 11, 2026, and live keys stay off before then", () => {
  const before = BILLING_OPENS_AT - 1000;
  const after = BILLING_OPENS_AT + 1000;
  assert.equal(billingButtonVisible({ STRIPE_SECRET_KEY: "sk_test_x", VERCEL_ENV: "preview" }, before), false);
  assert.equal(billingButtonVisible({ STRIPE_SECRET_KEY: "sk_test_x", VERCEL_ENV: "production" }, before), false);
  assert.equal(billingButtonVisible({ STRIPE_SECRET_KEY: "sk_live_x", VERCEL_ENV: "production" }, before), false);
  assert.equal(billingCheckoutAllowed({ STRIPE_SECRET_KEY: "sk_live_x", VERCEL_ENV: "production" }, before), false);
  assert.equal(billingCheckoutAllowed({ STRIPE_SECRET_KEY: "sk_test_x", VERCEL_ENV: "production" }, before), false);
  assert.equal(billingCheckoutAllowed({ STRIPE_SECRET_KEY: "sk_test_x", VERCEL_ENV: "preview" }, before), true);
  assert.equal(billingButtonVisible({ STRIPE_SECRET_KEY: "sk_test_x", VERCEL_ENV: "preview" }, after), true);
  assert.equal(billingCheckoutAllowed({ STRIPE_SECRET_KEY: "sk_live_x", VERCEL_ENV: "production" }, after), true);
});

test("public sign-up creates a hotel and a session, and rejects duplicates and bad input", async () => {
  _resetStoreClient();
  resetRate();
  const first = mockRes();
  await signup(req({
    hotelName: "Test Maple Lodge",
    email: "Maple@Lodge.test",
    password: "maple-lodge-pass",
    passwordAgain: "maple-lodge-pass",
    website: "",
  }), first);
  assert.equal(first.statusCode, 201);
  assert.equal(first.body.next, "/manage");
  assert.match(first.headers["Set-Cookie"], /cc_sess=/);
  assert.doesNotMatch(JSON.stringify(first.body), /editToken|editKey|password/);
  const user = await getUser("maple@lodge.test");
  assert.equal(user.hotelId, "test-maple-lodge");
  const hotel = await getStoredHotel("test-maple-lodge");
  assert.equal(hotel.name, "Test Maple Lodge");

  const dup = mockRes();
  await signup(req({
    hotelName: "Another Inn",
    email: "maple@lodge.test",
    password: "another-password",
    passwordAgain: "another-password",
  }, "203.0.113.11"), dup);
  assert.equal(dup.statusCode, 409);

  const short = mockRes();
  await signup(req({ hotelName: "Short Stay", email: "short@stay.test", password: "short", passwordAgain: "short" }, "203.0.113.12"), short);
  assert.equal(short.statusCode, 400);

  const mismatch = mockRes();
  await signup(req({ hotelName: "Mismatch Inn", email: "mis@match.test", password: "password-one", passwordAgain: "password-two" }, "203.0.113.13"), mismatch);
  assert.equal(mismatch.statusCode, 400);

  const bot = mockRes();
  await signup(req({ hotelName: "Bot Hotel", email: "bot@hotel.test", password: "password-bot1", passwordAgain: "password-bot1", website: "http://spam.test" }, "203.0.113.14"), bot);
  assert.equal(bot.statusCode, 400);
  assert.equal(await getUser("bot@hotel.test"), null);

  const sample = mockRes();
  await signup(req({ hotelName: "The Oliver Hotel", email: "not-oliver@example.test", password: "oliver-password", passwordAgain: "oliver-password" }, "203.0.113.15"), sample);
  assert.equal(sample.statusCode, 201);
  const sampleUser = await getUser("not-oliver@example.test");
  assert.notEqual(sampleUser.hotelId, "the-oliver");
  assert.equal((await getStoredHotel("the-oliver")), null);

  resetRate();
  _resetStoreClient();
  const ip = "198.51.100.20";
  for (let i = 0; i < 5; i++) {
    const ok = mockRes();
    await signup(req({
      hotelName: `Rate Hotel ${i}`,
      email: `rate-${i}@limit.test`,
      password: "rate-limit-pass",
      passwordAgain: "rate-limit-pass",
    }, ip), ok);
    assert.equal(ok.statusCode, 201, `signup ${i}`);
  }
  const blocked = mockRes();
  await signup(req({
    hotelName: "Rate Hotel blocked",
    email: "rate-blocked@limit.test",
    password: "rate-limit-pass",
    passwordAgain: "rate-limit-pass",
  }, ip), blocked);
  assert.equal(blocked.statusCode, 429);
  assert.equal(await getUser("rate-blocked@limit.test"), null);
});

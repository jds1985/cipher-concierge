import test from "node:test";
import assert from "node:assert/strict";
import { _resetStoreClient } from "../lib/store.js";
import { _reset as resetRate } from "../lib/ratelimit.js";
import { welcomeEmailConfigured, welcomeEmailContent, sendWelcomeEmail, CIPHER_CTS_LOGO_URL } from "../lib/welcome-email.js";
import signup from "../pages/api/auth/signup.js";

delete process.env.KV_REST_API_URL;
delete process.env.KV_REST_API_TOKEN;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.RESEND_API_KEY;

function mockRes() {
  const r = { statusCode: 200, headers: {}, body: null };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}

test("welcome email is large, high contrast, and includes the public Cipher CTS logo", () => {
  assert.equal(welcomeEmailConfigured({}), false);
  assert.equal(welcomeEmailConfigured({ RESEND_API_KEY: "not-a-key" }), false);
  assert.equal(welcomeEmailConfigured({ RESEND_API_KEY: "re_test_key" }), true);
  const msg = welcomeEmailContent({ hotelName: "Test Store <Inn>", loginUrl: "https://preview.example/login" });
  assert.equal(msg.subject, "Welcome to Cipher Concierge");
  assert.match(msg.text, /Test Store Inn is ready/);
  assert.match(msg.text, /fill in what guests should hear/);
  assert.match(msg.text, /https:\/\/preview\.example\/login/);
  assert.match(msg.html, /font-size:22px/);
  assert.match(msg.html, /background:#000/);
  assert.match(msg.html, /color:#fff/);
  assert.match(msg.html, /background:#ffe14a/);
  assert.match(msg.html, new RegExp(CIPHER_CTS_LOGO_URL.replace(/[.]/g, "\\.")));
  assert.match(msg.html, /alt="Cipher CTS"/);
  assert.match(msg.html, /https:\/\/preview\.example\/login/);
  assert.doesNotMatch(msg.html, /password|owner key/i);
  assert.doesNotMatch(msg.html, /Test Store <Inn>/);
});

test("a missing key or a failed send does not block sign-up", async () => {
  const skipped = await sendWelcomeEmail({ to: "a@b.test", hotelName: "Inn", loginUrl: "https://x/login", env: {} });
  assert.deepEqual(skipped, { sent: false, reason: "not-configured" });

  const failed = await sendWelcomeEmail({
    to: "a@b.test",
    hotelName: "Inn",
    loginUrl: "https://x/login",
    env: { RESEND_API_KEY: "re_test_key" },
    fetchImpl: async () => { throw new Error("offline"); },
  });
  assert.deepEqual(failed, { sent: false, reason: "error" });

  const rejected = await sendWelcomeEmail({
    to: "a@b.test",
    hotelName: "Inn",
    loginUrl: "https://x/login",
    env: { RESEND_API_KEY: "re_test_key" },
    fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({ message: "The domain is not verified" }) }),
  });
  assert.equal(rejected.sent, false);
  assert.equal(rejected.status, 403);
  assert.match(rejected.error, /not verified/);

  let posted = null;
  const sent = await sendWelcomeEmail({
    to: "manager@hotel.test",
    hotelName: "Harbor",
    loginUrl: "https://preview.example/login",
    env: { RESEND_API_KEY: "re_test_key" },
    fetchImpl: async (url, opts) => {
      posted = { url, body: JSON.parse(opts.body), auth: opts.headers.Authorization };
      return { ok: true, status: 200, json: async () => ({ id: "email_test_1" }) };
    },
  });
  assert.equal(sent.sent, true);
  assert.equal(sent.id, "email_test_1");
  assert.equal(posted.url, "https://api.resend.com/emails");
  assert.equal(posted.auth, "Bearer re_test_key");
  assert.deepEqual(posted.body.to, ["manager@hotel.test"]);
  assert.match(posted.body.html, /Harbor is ready/);
  assert.doesNotMatch(posted.body.html, /re_test_key/);
  assert.doesNotMatch(posted.body.text, /re_test_key/);

  _resetStoreClient();
  resetRate();
  const res = mockRes();
  await signup({
    method: "POST",
    body: { hotelName: "Welcome Inn", email: "welcome@inn.test", password: "welcome-pass-1", passwordAgain: "welcome-pass-1", website: "" },
    headers: { origin: "http://localhost:3000", host: "localhost:3000", "x-forwarded-for": "203.0.113.77" },
  }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.welcome, "skipped");
  assert.equal(res.body.next, "/manage");
});

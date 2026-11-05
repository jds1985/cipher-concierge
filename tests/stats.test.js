import test from "node:test";
import assert from "node:assert/strict";
import { _resetStoreClient, createHotelShell, STORE_PREFIX, kvGetJson } from "../lib/store.js";
import { setHotelLogin, createSession } from "../lib/auth.js";
import { signRoom } from "../lib/token.js";
import { bumpQuestion, getStats, utcDay, _getDay } from "../lib/stats.js";
import { createRequest, markRequestDone } from "../lib/requests.js";
import chatHandler from "../pages/api/chat.js";
import statsHandler from "../pages/api/stats/index.js";
import { _reset as resetRl } from "../lib/ratelimit.js";

delete process.env.KV_REST_API_URL;
delete process.env.KV_REST_API_TOKEN;
process.env.CIPHER_SERVER_MODEL = "off";

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: null };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}
let ipN = 1;
const mk = (method, { body, query, cookie, ip } = {}) => ({
  method,
  body,
  query: query || {},
  headers: { host: "x.test", ...(cookie ? { cookie } : {}) },
  socket: { remoteAddress: ip || "10.0.1." + (ipN++ % 250) },
});
async function call(h, r) {
  const res = mockRes();
  await h(r, res);
  return res;
}

async function setupHotels() {
  _resetStoreClient();
  resetRl();
  await createHotelShell({ id: "inn-a", name: "Inn A" });
  await createHotelShell({ id: "inn-b", name: "Inn B" });
  await setHotelLogin({ hotelId: "inn-a", email: "gm@a.com", password: "correct horse battery" });
  await setHotelLogin({ hotelId: "inn-b", email: "gm@b.com", password: "correct horse battery" });
  const a = await createSession({ email: "gm@a.com", hotelId: "inn-a" });
  const b = await createSession({ email: "gm@b.com", hotelId: "inn-b" });
  return { ca: "cc_sess=" + (a.token || a), cb: "cc_sess=" + (b.token || b) };
}

test("chat answer increments counter without storing message text", async () => {
  await setupHotels();
  const room = "301";
  const t = signRoom("the-oliver", room);
  const secretText = "SECRET_GUEST_QUESTION_NEVER_STORE_xyz";
  const res = await call(chatHandler, mk("POST", {
    body: {
      hotelId: "the-oliver",
      roomId: room,
      t,
      messages: [{ role: "user", content: secretText }],
    },
  }));
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.ok(res.body.intent || res.body.kind);

  const day = await _getDay("the-oliver");
  assert.equal(day.questions, 1);
  assert.ok(Object.keys(day.byIntent).length >= 1);

  // Ensure the guest message text is not present anywhere in the day's stored stats object.
  const raw = JSON.stringify(await kvGetJson(`${STORE_PREFIX}stat:the-oliver:day:${utcDay()}`));
  assert.ok(raw);
  assert.doesNotMatch(raw, /SECRET_GUEST_QUESTION/);
  assert.doesNotMatch(raw, new RegExp(secretText));
});

test("GET /api/stats requires session and is hotel-scoped", async () => {
  const { ca, cb } = await setupHotels();
  assert.equal((await call(statsHandler, mk("GET"))).statusCode, 401);

  await bumpQuestion({ hotelId: "inn-a", intent: "wifi" });
  await bumpQuestion({ hotelId: "inn-a", intent: "wifi" });
  await bumpQuestion({ hotelId: "inn-b", intent: "checkout" });

  const sa = await call(statsHandler, mk("GET", { cookie: ca, query: { range: "today" } }));
  assert.equal(sa.statusCode, 200);
  assert.equal(sa.body.questions, 2);
  assert.equal(sa.body.byIntent.find((x) => x.intent === "wifi")?.count, 2);
  assert.ok(!sa.body.byIntent.some((x) => x.intent === "checkout"));

  const sb = await call(statsHandler, mk("GET", { cookie: cb, query: { range: "7d" } }));
  assert.equal(sb.statusCode, 200);
  assert.equal(sb.body.questions, 1);
  assert.equal(sb.body.byIntent[0].intent, "checkout");
});

test("request create and done bump counters", async () => {
  await setupHotels();
  const r = await createRequest({ hotelId: "inn-a", roomId: "214", type: "towels", note: "2 please" });
  let day = await _getDay("inn-a");
  assert.equal(day.requestsCreated, 1);
  assert.equal(day.requestsDone, 0);

  await markRequestDone("inn-a", r.id);
  day = await _getDay("inn-a");
  assert.equal(day.requestsDone, 1);

  // Marking done again must not double-count.
  await markRequestDone("inn-a", r.id);
  day = await _getDay("inn-a");
  assert.equal(day.requestsDone, 1);

  const stats = await getStats("inn-a", "today");
  assert.equal(stats.requestsCreated, 1);
  assert.equal(stats.requestsDone, 1);
  // Note text must not appear in stats storage.
  const raw = JSON.stringify(await kvGetJson(`${STORE_PREFIX}stat:inn-a:day:${utcDay()}`));
  assert.doesNotMatch(raw, /2 please/);
});

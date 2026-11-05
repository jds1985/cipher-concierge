import test from "node:test";
import assert from "node:assert/strict";
import { _resetStoreClient, createHotelShell, STORE_PREFIX } from "../lib/store.js";
import { setHotelLogin, createSession } from "../lib/auth.js";
import { signRoom } from "../lib/token.js";
import { cleanNote, listRequests } from "../lib/requests.js";
import { matchIntent } from "../lib/intents.js";
import reqHandler from "../pages/api/requests/index.js";
import doneHandler from "../pages/api/requests/[id]/done.js";
import { _reset as resetRl } from "../lib/ratelimit.js";

delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN;

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: null };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}
let ipN = 1;
const mk = (method, { body, query, cookie, ip } = {}) => ({ method, body, query: query || {},
  headers: { host: "x.test", ...(cookie ? { cookie } : {}) }, socket: { remoteAddress: ip || "10.0.0." + (ipN++ % 250) } });
async function call(h, r) { const res = mockRes(); await h(r, res); return res; }

async function setup() {
  _resetStoreClient(); resetRl();
  await createHotelShell({ id: "inn-a", name: "Inn A" });
  await createHotelShell({ id: "inn-b", name: "Inn B" });
  await setHotelLogin({ hotelId: "inn-a", email: "gm@a.com", password: "correct horse battery" });
  await setHotelLogin({ hotelId: "inn-b", email: "gm@b.com", password: "correct horse battery" });
  const a = await createSession({ email: "gm@a.com", hotelId: "inn-a" });
  const b = await createSession({ email: "gm@b.com", hotelId: "inn-b" });
  return { ca: "cc_sess=" + (a.token || a), cb: "cc_sess=" + (b.token || b) };
}
const guest = (over = {}) => ({ hotelId: "inn-a", roomId: "214", t: signRoom("inn-a", "214"), type: "towels", ...over });

test("guest creates with valid token; manager lists (hotel-scoped) and marks done", async () => {
  const { ca, cb } = await setup();
  const c = await call(reqHandler, mk("POST", { body: guest({ note: "2 bath <b>towels</b>" }) }));
  assert.equal(c.statusCode, 200, JSON.stringify(c.body));
  assert.equal(c.body.status, "open");
  const id = c.body.id;

  assert.equal((await call(reqHandler, mk("GET"))).statusCode, 401);
  const la = await call(reqHandler, mk("GET", { cookie: ca, query: { status: "open" } }));
  assert.equal(la.statusCode, 200);
  assert.equal(la.body.requests.length, 1);
  assert.equal(la.body.requests[0].roomId, "214");
  assert.ok(!la.body.requests[0].note.includes("<"));
  const lb = await call(reqHandler, mk("GET", { cookie: cb }));
  assert.equal(lb.body.requests.length, 0);

  // other hotel's manager can't mark it done
  assert.equal((await call(doneHandler, mk("POST", { cookie: cb, query: { id } }))).statusCode, 404);
  assert.equal((await call(doneHandler, mk("POST", { query: { id } }))).statusCode, 401);
  const d = await call(doneHandler, mk("POST", { cookie: ca, query: { id } }));
  assert.equal(d.statusCode, 200); assert.equal(d.body.status, "done");
  assert.equal((await call(reqHandler, mk("GET", { cookie: ca, query: { status: "open" } }))).body.requests.length, 0);
  assert.equal((await listRequests("inn-a", { status: "done" })).length, 1);
});

test("rejects bad token, wrong hotel token, bad type", async () => {
  await setup();
  assert.equal((await call(reqHandler, mk("POST", { body: guest({ t: "x".repeat(22) }) }))).statusCode, 403);
  assert.equal((await call(reqHandler, mk("POST", { body: guest({ hotelId: "inn-b" }) }))).statusCode, 403);
  assert.equal((await call(reqHandler, mk("POST", { body: guest({ type: "pizza" }) }))).statusCode, 400);
  assert.equal((await call(reqHandler, mk("POST", { body: guest({ hotelId: "nope" }) }))).statusCode, 404);
  assert.equal((await listRequests("inn-a")).length, 0);
});

test("rate limits per room and per IP", async () => {
  await setup();
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await call(reqHandler, mk("POST", { body: guest() }))).statusCode);
  assert.deepEqual(codes.slice(0, 3), [200, 200, 200]);
  assert.equal(codes[3], 429);
  resetRl();
  const ipCodes = [];
  for (let i = 0; i < 7; i++) {
    const room = String(300 + i);
    ipCodes.push((await call(reqHandler, mk("POST", { ip: "9.9.9.9", body: guest({ roomId: room, t: signRoom("inn-a", room) }) }))).statusCode);
  }
  assert.equal(ipCodes[5], 429);
});

test("note sanitized and capped; intents no longer say they can't send", () => {
  assert.equal(cleanNote("a\u0000b <script>"), "a b script");
  assert.equal(cleanNote("x".repeat(500)).length, 200);
  assert.equal(cleanNote(42), "");
  const h = { name: "Inn", frontDesk: { inRoom: "Dial 0" } };
  for (const q of ["can I get extra towels", "the ac is broken"]) {
    const m = matchIntent(h, q, new Date());
    assert.ok(["housekeeping", "maintenance"].includes(m.intent));
    assert.match(m.text, /Send to front desk/);
    assert.doesNotMatch(m.text, /can't/);
  }
  assert.ok(STORE_PREFIX);
});

import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { _resetStoreClient, createHotelShell, getStoredHotel, guestHotel, kvGetJson, storePrefix } from "../lib/store.js";
import {
  setHotelLogin, checkLogin, createSession, sessionFromToken, destroySession, normalizeEmail,
  generatePassword, passwordProblem, sessionCookie, readCookie, hotelForRequest, sameOrigin,
} from "../lib/auth.js";
import { getHotelByEditToken } from "../lib/store.js";
import loadHandler from "../pages/api/hotel/load.js";
import saveHandler from "../pages/api/hotel/save.js";
import loginHandler from "../pages/api/auth/login.js";
import adminLoginHandler from "../pages/api/admin/hotel-login.js";
import { _reset as resetRl } from "../lib/ratelimit.js";

delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN;
process.env.ADMIN_KEY = "test-admin-key-123";

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: null };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.redirect = (c, u) => { res.statusCode = c; res.headers.location = u; return res; };
  return res;
}
const req = (body, headers = {}) => ({ method: "POST", body, headers: { host: "x.test", ...headers }, socket: { remoteAddress: "1.2.3." + Math.floor(Math.random() * 250) } });

test("helpers", () => {
  assert.equal(normalizeEmail("  GM@Hotel.COM "), "gm@hotel.com");
  assert.equal(normalizeEmail("nope"), null);
  const p = generatePassword();
  assert.ok(p.length >= 20 && !passwordProblem(p));
  assert.ok(passwordProblem("short"));
  const c = sessionCookie("abc");
  assert.match(c, /HttpOnly/); assert.match(c, /SameSite=Lax/); assert.match(c, /Path=\//);
  assert.equal(readCookie({ headers: { cookie: "a=1; cc_sess=xyz" } }, "cc_sess"), "xyz");
  assert.equal(sameOrigin({ headers: { host: "x.test", origin: "https://evil.test" } }), false);
  assert.equal(sameOrigin({ headers: { host: "x.test", origin: "https://x.test" } }), true);
});

test("password is bcrypt-hashed, login works, wrong password fails, email not leaked to guests", async () => {
  _resetStoreClient(); resetRl();
  const { hotel } = await createHotelShell({ id: "inn-a", name: "Inn A" });
  const r = await setHotelLogin({ hotelId: hotel.id, email: "GM@InnA.com", password: "correct horse battery" });
  assert.equal(r.email, "gm@inna.com");
  const u = await kvGetJson(`${storePrefix()}user:gm@inna.com`);
  assert.ok(u.passHash.startsWith("$2"));
  assert.ok(!JSON.stringify(u).includes("correct horse"));
  assert.ok(await bcrypt.compare("correct horse battery", u.passHash));

  const ok = await checkLogin({ email: "gm@inna.com", password: "correct horse battery", ip: "9.9.9.1" });
  assert.equal(ok.user.hotelId, "inn-a");
  const bad = await checkLogin({ email: "gm@inna.com", password: "wrong password!!", ip: "9.9.9.1" });
  assert.equal(bad.status, 401);
  const none = await checkLogin({ email: "nobody@x.com", password: "whatever12345", ip: "9.9.9.1" });
  assert.equal(none.status, 401);
  assert.equal(none.error, bad.error); // no account enumeration

  const g = guestHotel(await getStoredHotel("inn-a"));
  assert.equal(g._meta.managerEmail, undefined);
  assert.equal(g._meta.editKeyHash, undefined);
});

test("login is rate limited per email", async () => {
  _resetStoreClient(); resetRl();
  await createHotelShell({ id: "inn-rl", name: "RL" });
  await setHotelLogin({ hotelId: "inn-rl", email: "rl@x.com", password: "good-password-1" });
  let last;
  for (let i = 0; i < 9; i++) last = await checkLogin({ email: "rl@x.com", password: "bad-password-" + i, ip: "5.5.5." + i });
  assert.equal(last.status, 429);
  const blocked = await checkLogin({ email: "rl@x.com", password: "good-password-1", ip: "5.5.6.1" });
  assert.equal(blocked.status, 429);
});

test("sessions: create, resolve, destroy, revoke on password reset", async () => {
  _resetStoreClient(); resetRl();
  await createHotelShell({ id: "inn-s", name: "S" });
  await setHotelLogin({ hotelId: "inn-s", email: "s@x.com", password: "first-password" });
  const { user } = await checkLogin({ email: "s@x.com", password: "first-password", ip: "1" });
  const t = await createSession(user);
  assert.deepEqual(await sessionFromToken(t), { email: "s@x.com", hotelId: "inn-s" });
  await destroySession(t);
  assert.equal(await sessionFromToken(t), null);
  const t2 = await createSession(user);
  await setHotelLogin({ hotelId: "inn-s", email: "s@x.com", password: "second-password" });
  assert.equal(await sessionFromToken(t2), null, "reset revokes old sessions");
  assert.equal(await sessionFromToken("x".repeat(43)), null);
});

test("one email cannot manage two hotels; changing email removes old login", async () => {
  _resetStoreClient(); resetRl();
  await createHotelShell({ id: "h1", name: "H1" });
  await createHotelShell({ id: "h2", name: "H2" });
  await setHotelLogin({ hotelId: "h1", email: "a@x.com", password: "pw-aaaaaaaaaa" });
  await assert.rejects(setHotelLogin({ hotelId: "h2", email: "a@x.com", password: "pw-bbbbbbbbbb" }), /different hotel/);
  await setHotelLogin({ hotelId: "h1", email: "b@x.com", password: "pw-cccccccccc" });
  assert.equal((await checkLogin({ email: "a@x.com", password: "pw-aaaaaaaaaa", ip: "2" })).status, 401);
  await assert.rejects(setHotelLogin({ hotelId: "nope", email: "c@x.com" }), /not found/);
});

test("API: session isolates hotels; body hotel id ignored; token backup still works", async () => {
  _resetStoreClient(); resetRl();
  const a = await createHotelShell({ id: "iso-a", name: "Iso A" });
  await createHotelShell({ id: "iso-b", name: "Iso B" });
  await setHotelLogin({ hotelId: "iso-a", email: "a@iso.com", password: "pw-iso-a-123" });
  await setHotelLogin({ hotelId: "iso-b", email: "b@iso.com", password: "pw-iso-b-123" });

  const lr = mockRes();
  await loginHandler(req({ email: "b@iso.com", password: "pw-iso-b-123" }, { origin: "https://x.test" }), lr);
  assert.equal(lr.statusCode, 200);
  const cookie = lr.headers["set-cookie"].split(";")[0];
  assert.match(lr.headers["set-cookie"], /HttpOnly/);

  // Session for B tries to save with id/hotelId of A -> still writes B only
  const sr = mockRes();
  await saveHandler(req({ id: "iso-a", hotelId: "iso-a", name: "Hacked" }, { cookie, origin: "https://x.test" }), sr);
  assert.equal(sr.statusCode, 200);
  assert.equal(sr.body.hotel.id, "iso-b");
  assert.equal((await getStoredHotel("iso-a")).name, "Iso A");
  assert.equal((await getStoredHotel("iso-b")).name, "Hacked");
  assert.ok((await getStoredHotel("iso-b"))._meta.managerEmail, "manager email survives save");

  const ld = mockRes();
  await loadHandler(req({}, { cookie }), ld);
  assert.equal(ld.body.hotel.id, "iso-b");

  const noAuth = mockRes();
  await loadHandler(req({}), noAuth);
  assert.equal(noAuth.statusCode, 401);

  const csrf = mockRes();
  await saveHandler(req({ name: "X" }, { cookie, origin: "https://evil.test" }), csrf);
  assert.equal(csrf.statusCode, 403);

  const tok = mockRes();
  await loadHandler(req({ token: a.editToken }), tok);
  assert.equal(tok.body.hotel.id, "iso-a");
});

test("admin hotel-login API requires ADMIN_KEY and returns generated password once", async () => {
  _resetStoreClient(); resetRl();
  await createHotelShell({ id: "adm", name: "Adm" });
  const r1 = mockRes();
  await adminLoginHandler(req({ hotelId: "adm", email: "m@adm.com" }), r1);
  assert.equal(r1.statusCode, 401);
  const r2 = mockRes();
  await adminLoginHandler(req({ hotelId: "adm", email: "m@adm.com" }, { "x-admin-key": "test-admin-key-123" }), r2);
  assert.equal(r2.statusCode, 200);
  assert.equal(r2.body.generated, true);
  assert.ok((await checkLogin({ email: "m@adm.com", password: r2.body.password, ip: "3" })).user);
});

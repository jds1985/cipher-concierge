// Offline support for the guest chat. Bump VERSION on any change so updates still arrive (old caches are deleted).
// - Cipher runtime (JS + WASM) and /_next/static chunks: cache-first (immutable, content-hashed).
// - Guest page HTML (/stay/<hotel>/<room>?t=…): network-first so room-token checks stay on the server when online;
//   only 200 responses are stored, and the cached copy is used only when the network fails.
// Model bytes and the fact pack are cached by the worker / page. No other routes or API responses are cached.
const VERSION = "v2";
const C = `cipher-runtime-${VERSION}`, P = `cipher-pages-${VERSION}`;
const SHELL = ["/cipher/cipher-worker.js", "/cipher/cipher-mt.js", "/cipher/cipher-mt.wasm", "/cipher/cipher-st.js", "/cipher/cipher-st.wasm",
  "/brand/hex_circuit.svg", "/brand/hex_circuit_small.svg", "/favicon.svg", "/favicon-48.png"];
const isStay = (u) => /^\/stay\/[^/]+\/[^/]+\/?$/.test(u.pathname);
const isAsset = (u) => (u.pathname.startsWith("/cipher/") && !u.pathname.startsWith("/cipher/models/")) || u.pathname.startsWith("/_next/static/") || u.pathname.startsWith("/fonts/") || u.pathname.startsWith("/brand/") || /^\/favicon[\w.-]*$/.test(u.pathname);
self.addEventListener("install", (e) => e.waitUntil(caches.open(C).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => /^cipher-(runtime|pages)-/.test(k) && k !== C && k !== P).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
// The page reports its own URL and the chunks it already loaded (they were fetched before this worker took control).
self.addEventListener("message", (e) => {
  const m = e.data || {};
  if (m.type !== "cache-page") return;
  e.waitUntil((async () => {
    const page = new URL(m.page, location.origin);
    if (page.origin === location.origin && isStay(page)) { const r = await fetch(page.href, { cache: "no-store" }).catch(() => null); if (r && r.status === 200) await (await caches.open(P)).put(page.href, r); }
    const c = await caches.open(C);
    for (const a of m.assets || []) { const u = new URL(a, location.origin); if (u.origin === location.origin && isAsset(u) && !(await c.match(u.href))) await c.add(u.href).catch(() => {}); }
  })());
});
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== "GET") return;
  if (e.request.mode === "navigate" && isStay(u)) {
    e.respondWith(caches.open(P).then(async (c) => {
      try { const r = await fetch(e.request); if (r.status === 200) c.put(u.href, r.clone()); return r; }
      catch (err) { return (await c.match(u.href)) || Response.error(); }
    }));
    return;
  }
  if (!isAsset(u)) return;
  e.respondWith(caches.open(C).then(async (c) => (await c.match(e.request)) || fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; })));
});

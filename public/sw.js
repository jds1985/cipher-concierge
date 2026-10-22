// Caches the on-phone Cipher runtime (JS + WASM) so repeat visits need no download. Model bytes and the
// fact pack are cached separately (worker / page). Pages and APIs are never cached here.
const C = "cipher-runtime-v1";
const SHELL = ["/cipher/cipher-worker.js", "/cipher/cipher-mt.js", "/cipher/cipher-mt.wasm", "/cipher/cipher-st.js", "/cipher/cipher-st.wasm"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(C).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("cipher-runtime-") && k !== C).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== "GET") return;
  const runtime = u.pathname.startsWith("/cipher/") && !u.pathname.startsWith("/cipher/models/");
  const asset = u.pathname.startsWith("/_next/static/") || u.pathname.startsWith("/fonts/");
  if (!runtime && !asset) return;
  e.respondWith(caches.open(C).then(async (c) => (await c.match(e.request)) || fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; })));
});

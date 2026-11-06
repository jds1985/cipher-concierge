// Lab-only cache. Scope is /lab/. It does not register for /stay and does not cache /api.
const CACHE = "liquid-lab-v1";
const isLabGet = (url, request) => url.origin === location.origin && request.method === "GET" && url.pathname.startsWith("/lab/");

self.addEventListener("install", (e) => e.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("message", (e) => {
  const m = e.data || {};
  if (m.type !== "cache-lab") return;
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const page = new URL(m.page, location.origin);
    if (page.origin === location.origin && page.pathname.startsWith("/lab/")) {
      const r = await fetch(page.href).catch(() => null);
      if (r && r.ok) await cache.put(page.href, r);
    }
    for (const asset of m.assets || []) {
      const u = new URL(asset, location.origin);
      if (u.origin !== location.origin || !u.pathname.startsWith("/lab/") || u.pathname.startsWith("/lab/models/")) continue;
      if (await cache.match(u.href)) continue;
      const r = await fetch(u.href).catch(() => null);
      if (r && r.ok) await cache.put(u.href, r);
    }
  })());
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (!isLabGet(url, e.request)) return;
  // Weight files stream straight through. A service worker that caches a 206 or a
  // 250 MB body can fail the response the page is waiting on.
  if (url.pathname.startsWith("/lab/models/")) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(e.request);
    try {
      const fresh = await fetch(e.request);
      if (fresh.ok && fresh.status === 200) cache.put(e.request, fresh.clone()).catch(() => {});
      return fresh;
    } catch {
      return hit || Response.error();
    }
  })());
});

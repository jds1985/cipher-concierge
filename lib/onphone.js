// Browser-only helpers for on-phone mode: capability check, Cipher WASM worker wrapper, cached fact pack.
export const MODEL = { url: "/cipher/models/sft.ctern", size: 73231828 };
const SIMD = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

// Why this device can't run Cipher locally (null = it can). ?mode=server|phone overrides for testing.
export function unsupportedReason(force) {
  if (force === "server") return "forced";
  if (force === "phone") return null;
  if (typeof WebAssembly !== "object" || typeof Worker === "undefined") return "no-wasm";
  try { if (!WebAssembly.validate(SIMD)) return "no-simd"; } catch { return "no-simd"; }
  if (typeof caches === "undefined") return "no-cache-storage";
  if (navigator.deviceMemory && navigator.deviceMemory < 2) return "low-memory";
  return null;
}

export function loadCipher({ threads = Math.min(4, navigator.hardwareConcurrency || 2), ctx = 1024, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const w = new Worker("/cipher/cipher-worker.js"); let seq = 0; const pending = new Map(); let onTok = null;
    w.onerror = (e) => reject(new Error(e.message || "worker failed"));
    w.onmessage = (ev) => { const m = ev.data;
      if (m.type === "progress") onProgress && onProgress(m);
      else if (m.type === "token") onTok && onTok(m.piece);
      else if (m.type === "log") console.log("[cipher]", m.msg);
      else { const key = m.id ?? "load"; const p = pending.get(key); if (p) { pending.delete(key); m.type === "error" ? p.rej(new Error(m.msg)) : p.res(m); } } };
    const call = (msg, key) => new Promise((res, rej) => { pending.set(key, { res, rej }); w.postMessage(msg); });
    call({ type: "load", url: MODEL.url, size: MODEL.size, threads, ctx, temp: 0.3, rep: 1.15 }, "load").then((info) => resolve({
      info,
      reset: () => { const id = ++seq; return call({ type: "reset", id }, id); },
      setSystem: (text) => { const id = ++seq; return call({ type: "system", id, text }, id); },
      generate: (text, { onToken, maxNew = 120 } = {}) => { const id = ++seq; onTok = onToken; return call({ type: "generate", id, text, maxNew }, id); },
      stop: () => w.postMessage({ type: "stop" }),
    }), reject);
  });
}

// Hotel fact pack: fetched once per version (signed room link required), then served from Cache Storage.
export async function loadFactPack({ hotelId, roomId, t, version }) {
  const key = `/cipher/factpack/${hotelId}-${version}.json`;
  const c = await caches.open("cipher-factpack-v1");
  const hit = await c.match(key);
  if (hit) return { hotel: await hit.json(), fromCache: true };
  const r = await fetch("/api/factpack", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hotelId, roomId, t }) });
  if (!r.ok) throw new Error("fact pack HTTP " + r.status);
  const body = await r.text();
  await c.put(key, new Response(body, { headers: { "content-type": "application/json" } }));
  for (const k of await c.keys()) if (new URL(k.url).pathname.startsWith(`/cipher/factpack/${hotelId}-`) && !k.url.endsWith(key)) c.delete(k);
  return { hotel: JSON.parse(body), fromCache: false };
}

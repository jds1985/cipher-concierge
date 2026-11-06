/** @type {import('next').NextConfig} */
const dev = process.env.NODE_ENV !== "production";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""}`,
  "worker-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");
// Isolated lab only. connect-src stays 'self' so a guest question cannot be posted off-origin.
// script-src and worker-src allow blob: because onnxruntime-web imports its WASM helper from a blob URL.
// The lab page does not set COEP. That policy blocks those blob URLs, and this runtime uses one WASM thread.
// The negative lookahead keeps every existing route on the production policy above.
const labCsp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:${dev ? " 'unsafe-eval'" : ""}`,
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");
const security = (policy) => [
  { key: "Content-Security-Policy", value: policy },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
];
export default {
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true },
  async headers() {
    return [
      { source: "/:path((?!lab).*)", headers: security(csp) },
      { source: "/lab/:path*", headers: security(labCsp) },
      { source: "/lab/liquid/:path*", headers: [
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
        { key: "Cache-Control", value: "no-store" },
      ] },
      { source: "/lab/models/:path*", headers: [
        { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
      ] },
      { source: "/lab/vendor/:path*", headers: [
        { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
      ] },
      { source: "/lab/vendor/:file*.wasm", headers: [{ key: "Content-Type", value: "application/wasm" }] },
      { source: "/lab/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/lab/" }] },
      // Cross-origin isolation (SharedArrayBuffer) for the multi-threaded on-phone Cipher runtime.
      ...["/stay/:path*", "/cipher/:path*", "/sw.js"].map((source) => ({ source, headers: [
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
      ] })),
      { source: "/cipher/:file*.wasm", headers: [{ key: "Content-Type", value: "application/wasm" }] },
      { source: "/cipher/models/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] },
      { source: "/stay/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "Cache-Control", value: "no-store" }] },
      { source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

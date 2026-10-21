export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  let cipher = "down";
  try { const r = await fetch((process.env.CIPHER_URL || "http://127.0.0.1:8899/v1/chat/completions").replace(/\/v1\/.*$/, "/health"), { signal: AbortSignal.timeout(2000) }); cipher = r.ok ? "up" : "down"; } catch {}
  res.status(200).json({ app: "ok", cipher });
}

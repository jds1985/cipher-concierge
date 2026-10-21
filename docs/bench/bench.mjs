// Concurrent load on cipher-serve: N simultaneous guests, each one Cipher-path request (~app prompt size, max_tokens 120).
import fs from "fs";
const URL_ = process.env.U || "http://127.0.0.1:8899/v1/chat/completions";
const pid = +process.env.PID, N = +process.argv[2];
const sys = "You are Cipher, the private concierge for The Oliver Hotel in Knoxville, TN. Be warm and brief (2-3 sentences). Use only these hotel facts; if they do not answer the question, say the front desk can help.\nFacts:\n- The Oliver Hotel is on Market Square in Knoxville, TN.\n- Front desk: Dial 0 from your room phone or call (865) 521-0050.\n- Tupelo Honey (2-minute walk): Southern comfort food on Market Square.";
const rss = () => +fs.readFileSync(`/proc/${pid}/status`, "utf8").match(/VmRSS:\s+(\d+)/)[1] / 1024;
const cpu = () => { const f = fs.readFileSync(`/proc/${pid}/stat`, "utf8").split(") ")[1].split(" "); return (+f[11] + +f[12]) / 100; };
let peak = rss(); const t0 = Date.now(), c0 = cpu();
const iv = setInterval(() => (peak = Math.max(peak, rss())), 100);
async function one(i) {
  const s = Date.now(); let first = null, toks = 0, buf = "";
  const r = await fetch(URL_, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ role: "system", content: sys }, { role: "user", content: `Guest ${i}: what is a fun thing to do downtown tonight?` }], stream: true, max_tokens: 120, temperature: 0.3, ignore_eos: true }) });
  const dec = new TextDecoder();
  for await (const ch of r.body) { buf += dec.decode(ch, { stream: true }); let k; while ((k = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, k); buf = buf.slice(k + 1); if (l.includes('"content"')) { toks++; first ??= Date.now() - s; } } }
  return { first, total: Date.now() - s, toks };
}
const res = await Promise.all(Array.from({ length: N }, (_, i) => one(i)));
clearInterval(iv);
const wall = (Date.now() - t0) / 1000, cpuS = cpu() - c0, tot = res.reduce((a, r) => a + r.toks, 0);
const q = (a, p) => a.sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))];
console.log(JSON.stringify({ N, wall_s: +wall.toFixed(1), tokens: tot, agg_tok_s: +(tot / wall).toFixed(1),
  ttft_ms_p50: q(res.map((r) => r.first), .5), ttft_ms_max: Math.max(...res.map((r) => r.first)),
  total_ms_p50: q(res.map((r) => r.total), .5), total_ms_max: Math.max(...res.map((r) => r.total)),
  peak_rss_mb: +peak.toFixed(0), avg_cores_busy: +(cpuS / wall).toFixed(2) }));

#!/usr/bin/env node
// Real Chrome run of the isolated Liquid lab. Does not call cipher-serve.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import puppeteer from "puppeteer-core";
import { signRoom } from "../lib/token.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3210;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SECRET = "liquid-lab-test-secret-not-for-production-01";
const ART = "/opt/cursor/artifacts";
const OUT = join(ROOT, "tests/results/2026-11-06_liquid-browser");
const PROD_CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

const FACTS = [
  { id: "wifi", q: "What's the wifi password?", must: ["Oliver-Guest", "No password needed"], model: false },
  { id: "quiet", q: "What are the quiet hours?", must: ["10:00 PM to 8:00 AM"], model: false },
  { id: "multi", q: "What time is checkout and what's the wifi?", must: ["11:00 AM", "Oliver-Guest"], model: false },
  { id: "spa", q: "Do you have a spa?", must: ["don't have spa"], mustNot: [/our spa/i, /yes, we have a spa/i], model: false },
  { id: "emergency", q: "I think I'm having a heart attack", must: ["911"], model: false },
];
const BOUNDED = process.env.LIQUID_BOUNDED === "1";
const OPEN = [
  { id: "rain", q: "It's raining. What can we do inside this afternoon?", runs: BOUNDED ? 1 : 3 },
  { id: "pack", q: "What should I pack for a hike in the Smokies?", runs: BOUNDED ? 1 : 3 },
  { id: "joke", q: "Tell me a short clean joke.", runs: BOUNDED ? 1 : 3 },
];

mkdirSync(ART, { recursive: true });
mkdirSync(OUT, { recursive: true });

async function waitPhase(page, ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    let phase = "";
    try {
      phase = await Promise.race([
        page.evaluate(() => document.querySelector("[data-testid=liquid-status]")?.getAttribute("data-phase") || ""),
        new Promise((resolve) => setTimeout(() => resolve("evaluate-timeout"), 5000)),
      ]);
    } catch { phase = "evaluate-failed"; }
    if (phase === "ready" || phase === "error") return phase;
    if (phase === "evaluate-timeout" || phase === "evaluate-failed") return phase;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return "timeout";
}

function chromeRssKb() {
  try {
    const text = execSync("ps -eo rss=,comm=", { encoding: "utf8" });
    return text.split("\n").filter((l) => /chrome|chromium/i.test(l)).reduce((s, l) => s + Number(l.trim().split(/\s+/)[0] || 0), 0);
  } catch { return null; }
}

function run(cmd, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    child.stdout.on("data", (d) => { log += d; });
    child.stderr.on("data", (d) => { log += d; });
    child.on("exit", (code) => code === 0 ? resolve(log) : reject(new Error(`${cmd} ${args.join(" ")} exited ${code}\n${log.slice(-4000)}`)));
  });
}

function startServer(flag) {
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      QR_SECRET: SECRET,
      QR_KEY_VERSION: "1",
      LIQUID_BROWSER_EXPERIMENT: flag,
      CIPHER_SERVER_MODEL: "off",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => { log += d; });
  child.stderr.on("data", (d) => { log += d; });
  child.logs = () => log;
  return child;
}

async function stopServer(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const t = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 5000);
    child.on("exit", () => { clearTimeout(t); resolve(); });
  });
}

async function waitHttp(url, child) {
  const start = Date.now();
  let last = "";
  while (Date.now() - start < 60000) {
    if (child.exitCode != null) throw new Error("server exited\n" + child.logs().slice(-2000));
    try {
      const r = await fetch(url);
      return r;
    } catch (e) { last = String(e); }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("server did not listen: " + last + "\n" + child.logs().slice(-2000));
}

function hostOf(url) {
  try { return new URL(url).host; } catch { return url; }
}

function questionLeaked(q, entries) {
  const needle = q.trim();
  return entries.filter((e) => {
    const blob = `${e.url}\n${e.post || ""}`;
    return blob.includes(needle) || blob.includes(encodeURIComponent(needle));
  });
}

function foreign(entries) {
  return entries.filter((e) => {
    const host = hostOf(e.url);
    return host && host !== `127.0.0.1:${PORT}` && host !== `localhost:${PORT}`;
  });
}

async function shot(page, name) {
  const path = join(ART, name);
  await page.screenshot({ path, fullPage: true });
  writeFileSync(join(OUT, name), readFileSync(path));
  return path;
}

async function ask(page, q, net, mark) {
  const startLen = net.length;
  const before = await page.evaluate(() => window.__liquidLab.transcript.length);
  const t0 = Date.now();
  await page.locator("[data-testid=composer]").fill(q);
  await page.locator("[data-testid=send]").click();
  await page.waitForFunction((n) => window.__liquidLab && window.__liquidLab.transcript.length > n && !window.__liquidLab.busy, { timeout: BOUNDED ? 80000 : 240000 }, before);
  const row = await page.evaluate(() => window.__liquidLab.transcript.at(-1));
  const during = net.slice(startLen);
  return { ...row, wallMs: Date.now() - t0, phase: mark, requests: during, leaks: questionLeaked(q, during), foreign: foreign(during) };
}

function scoreFact(spec, row) {
  const text = row.text || "";
  const missing = (spec.must || []).filter((s) => !text.includes(s));
  const banned = (spec.mustNot || []).filter((re) => re.test(text)).map(String);
  const modelOk = row.modelCalled === false;
  let resolution = "full";
  if (!modelOk || missing.length || banned.length) resolution = missing.length && text ? "partial" : "fail";
  if (row.source === "error" || row.source === "waiting") resolution = "blocked";
  return { resolution, missing, banned, modelOk };
}

function scoreOpen(row) {
  const text = `${row.text || ""}`;
  const raw = `${row.raw || ""}`;
  const shown = [];
  if (/\bspa\b/i.test(text)) shown.push("spa");
  if (/\bpool\b/i.test(text)) shown.push("pool");
  if (/\bshuttle\b/i.test(text)) shown.push("shuttle");
  if (/\bpassword\s+is\b/i.test(text)) shown.push("invented-password");
  const desk = /front desk/i.test(text);
  let resolution = "blocked";
  if (row.source === "liquid" && shown.length === 0 && text.length >= 20 && !desk) resolution = "full";
  else if (row.source === "liquid" && shown.length === 0) resolution = "partial";
  else if (row.source === "liquid" && shown.length) resolution = "false-claim";
  else if (row.source === "liquid-withheld") resolution = "withheld";
  else if (row.modelCalled && shown.length) resolution = "false-claim";
  return { resolution, shownFalseClaims: shown, unnecessaryDeskReferral: desk && resolution !== "false-claim", raw, text };
}

const report = {
  startedAt: new Date().toISOString(),
  gate: {},
  browser: {},
  load: {},
  rows: [],
  privacy: { leaks: [], foreign: [] },
  offline: {},
  staff: {},
  memory: {},
  error: null,
};

let server;
let browser;
try {
  if (process.env.LIQUID_SKIP_BUILD === "1") console.log("skip build");
  else {
    console.log("build");
    await run(process.execPath, ["node_modules/next/dist/bin/next", "build"], { NEXT_TELEMETRY_DISABLED: "1", NODE_ENV: "production" });
  }

  console.log("gate off");
  server = startServer("");
  await waitHttp(ORIGIN + "/api/health", server);
  const off = await fetch(ORIGIN + "/lab/liquid/the-oliver/101");
  const home = await fetch(ORIGIN + "/");
  const homeCsp = home.headers.get("content-security-policy");
  const stay = await fetch(ORIGIN + "/stay/the-oliver/101");
  report.gate = {
    labStatusWhenOff: off.status,
    homeStatus: home.status,
    homeCspMatchesProduction: homeCsp === PROD_CSP,
    homeCsp,
    stayCsp: stay.headers.get("content-security-policy"),
    stayCoep: stay.headers.get("cross-origin-embedder-policy"),
  };
  if (off.status !== 404) throw new Error("lab was reachable with the flag off: " + off.status);
  if (homeCsp !== PROD_CSP) throw new Error("home CSP changed:\n" + homeCsp);
  await stopServer(server);

  console.log("gate on");
  server = startServer("1");
  await waitHttp(ORIGIN + "/api/health", server);
  const on = await fetch(ORIGIN + "/lab/liquid/the-oliver/101");
  report.gate.labStatusWithoutToken = on.status;
  report.gate.labCsp = on.headers.get("content-security-policy");

  const token = signRoom("the-oliver", "305", SECRET);
  const runtime = process.env.LIQUID_RUNTIME || "";
  const maxNew = process.env.LIQUID_MAX_NEW || "";
  const url = `${ORIGIN}/lab/liquid/the-oliver/305?t=${token}${runtime ? `&runtime=${encodeURIComponent(runtime)}` : ""}${maxNew ? `&maxNew=${encodeURIComponent(maxNew)}` : ""}`;
  report.bounded = { runtime: runtime || "auto", maxNew: maxNew || "64", bounded: BOUNDED };
  browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: "new",
    protocolTimeout: 300000,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--enable-precise-memory-info",
      "--enable-unsafe-webgpu",
      "--enable-features=Vulkan,WebGPU",
      "--use-angle=swiftshader",
      "--window-size=1280,900",
      "--js-flags=--max-old-space-size=8192",
    ],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const net = [];
  page.on("request", (req) => {
    net.push({ t: Date.now(), method: req.method(), url: req.url(), post: req.postData() || null, type: req.resourceType() });
  });
  page.on("requestfailed", (req) => {
    net.push({ t: Date.now(), method: req.method(), url: req.url(), failed: req.failure()?.errorText || "failed", type: req.resourceType() });
  });
  const consoleLog = [];
  page.on("console", (msg) => consoleLog.push({ type: msg.type(), text: msg.text().slice(0, 500) }));
  page.on("pageerror", (err) => consoleLog.push({ type: "pageerror", text: String(err).slice(0, 1500) }));

  report.browser.chrome = await browser.version();
  report.memory.rssKbBefore = chromeRssKb();
  await page.goto(`${ORIGIN}/lab/liquid/the-oliver/999`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await shot(page, "01-invalid-qr.png");
  const invalidText = await page.evaluate(() => document.body.innerText.slice(0, 400));
  report.gate.invalidQrText = invalidText;

  report.memory.rssKbAtNav = chromeRssKb();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1500));
  await shot(page, "02-loading.png");
  const loadCap = BOUNDED ? 150000 : 360000;
  const loadPhase = await waitPhase(page, loadCap);
  report.loadWall = { phase: loadPhase, capMs: loadCap };
  if (loadPhase === "timeout" || loadPhase === "evaluate-timeout" || loadPhase === "evaluate-failed") {
    report.blocker = `Backend did not finish load and warmup within ${loadCap}ms (phase ${loadPhase}). No guest generation was counted.`;
  }
  const loadState = await Promise.race([
    page.evaluate(() => ({
      status: window.cipherLiquid ? window.cipherLiquid.getState() : null,
      ua: navigator.userAgent,
      deviceMemory: navigator.deviceMemory || null,
      hardwareConcurrency: navigator.hardwareConcurrency || null,
      webgpu: !!navigator.gpu,
      heap: performance.memory ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize, limit: performance.memory.jsHeapSizeLimit } : null,
    })),
    new Promise((resolve) => setTimeout(() => resolve({ status: null, evaluate: "timeout" }), 8000)),
  ]);
  report.load = loadState;
  report.memory.rssKbAfterLoad = chromeRssKb();
  await shot(page, "03-runtime.png");
  const modelReady = loadPhase === "ready" && !!(loadState.status && loadState.status.phase === "ready");
  if (!modelReady && !report.blocker) report.blocker = "model did not reach ready: " + ((loadState.status && (loadState.status.error || loadState.status.phase)) || loadPhase);
  if (loadPhase !== "ready" && loadPhase !== "error") {
    try { await shot(page, "03-runtime-blocked.png"); } catch { /* page may be wedged */ }
    throw new Error(report.blocker || "load wall exceeded before warmup finished");
  }

  const assetBytes = net.filter((e) => e.method === "GET" && /\/lab\/(models|vendor)\//.test(e.url));
  report.load.assetRequestsBeforeQuestions = assetBytes.length;
  report.load.assetUrls = [...new Set(assetBytes.map((e) => e.url.split("?")[0]))];

  for (const spec of FACTS) {
    const row = await ask(page, spec.q, net, "online-facts");
    const score = scoreFact(spec, row);
    report.rows.push({ ...spec, ...row, requests: undefined, score, requestCount: row.requests.length, postCount: row.requests.filter((r) => r.method === "POST").length });
    report.privacy.leaks.push(...row.leaks.map((e) => ({ q: spec.q, url: e.url, method: e.method })));
    report.privacy.foreign.push(...row.foreign.map((e) => ({ q: spec.q, url: e.url })));
    if (spec.id === "wifi") await shot(page, "04-wifi.png");
    if (spec.id === "emergency") await shot(page, "05-emergency.png");
    if (spec.id === "spa") await shot(page, "06-spa.png");
  }

  if (!modelReady) {
    report.rows.push({ id: "open-blocked", q: OPEN[0].q, source: "waiting", modelCalled: false, text: report.error, score: { resolution: "blocked" } });
  }
  const rain1 = modelReady ? await ask(page, OPEN[0].q, net, "online-open") : null;
  if (!rain1) {
    report.finishedAt = new Date().toISOString();
  } else {
  report.rows.push({ id: "rain", run: 1, q: OPEN[0].q, ...rain1, requests: undefined, score: scoreOpen(rain1), requestCount: rain1.requests.length, postCount: rain1.requests.filter((r) => r.method === "POST").length });
  report.privacy.leaks.push(...rain1.leaks.map((e) => ({ q: OPEN[0].q, url: e.url, method: e.method })));
  report.privacy.foreign.push(...rain1.foreign.map((e) => ({ q: OPEN[0].q, url: e.url })));
  report.memory.rssKbAfterFirstGen = chromeRssKb();
  report.memory.heapAfterFirstGen = rain1.heap || null;
  await shot(page, "07-rain.png");

  const offlineStart = net.length;
  await page.setOfflineMode(true);
  let offlineRow = null;
  try {
    offlineRow = await ask(page, OPEN[2].q, net, "offline-memory");
    report.rows.push({ id: "joke", run: 1, q: OPEN[2].q, ...offlineRow, requests: undefined, score: scoreOpen(offlineRow), requestCount: offlineRow.requests.length, offline: true });
    report.offline.generation = { ok: offlineRow.source === "liquid" || offlineRow.source === "liquid-withheld", source: offlineRow.source, ms: offlineRow.ms, requestCount: offlineRow.requests.length };
    report.privacy.leaks.push(...offlineRow.leaks.map((e) => ({ q: OPEN[2].q, url: e.url })));
  } catch (e) {
    report.offline.generation = { ok: false, error: String(e).slice(0, 800) };
  }
  await shot(page, "08-offline-generation.png");

  report.offline.reload = { ok: false };
  try {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForFunction(() => {
      const phase = document.querySelector("[data-testid=liquid-status]")?.getAttribute("data-phase");
      return phase === "ready" || phase === "error";
    }, { timeout: BOUNDED ? 20000 : 360000 });
    const phase = await page.evaluate(() => document.querySelector("[data-testid=liquid-status]")?.getAttribute("data-phase") || "");
    report.offline.reload = { ok: phase === "ready", phase };
    await shot(page, "09-offline-reload.png");
  } catch (e) {
    report.offline.reload = { ok: false, error: String(e).slice(0, 800), requests: net.slice(offlineStart).length };
  }
  await page.setOfflineMode(false);
  if (!report.offline.reload.ok) {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => document.querySelector("[data-testid=liquid-status]")?.getAttribute("data-phase") === "ready" || document.querySelector("[data-testid=liquid-status]")?.getAttribute("data-phase") === "error", { timeout: BOUNDED ? 20000 : 360000 });
  }

  const rest = [
    { id: "rain", q: OPEN[0].q, from: 2, to: 3 },
    { id: "pack", q: OPEN[1].q, from: 1, to: 3 },
    { id: "joke", q: OPEN[2].q, from: offlineRow ? 2 : 1, to: 3 },
  ];
  for (const item of rest) {
    for (let run = item.from; run <= item.to; run++) {
      const row = await ask(page, item.q, net, "online-open");
      report.rows.push({ id: item.id, run, q: item.q, ...row, requests: undefined, score: scoreOpen(row), requestCount: row.requests.length, postCount: row.requests.filter((r) => r.method === "POST").length });
      report.privacy.leaks.push(...row.leaks.map((e) => ({ q: item.q, url: e.url, method: e.method })));
      report.privacy.foreign.push(...row.foreign.map((e) => ({ q: item.q, url: e.url })));
      if (item.id === "pack" && run === 1) await shot(page, "10-pack.png");
      if (item.id === "joke" && run === item.to) await shot(page, "11-joke.png");
    }
  }

  const postsBefore = net.filter((e) => e.method === "POST").length;
  await page.locator("[data-testid=staff-note]").fill("Two bath towels please");
  const disabled = await page.$eval("[data-testid=staff-send]", (el) => el.disabled);
  await page.locator("[data-testid=staff-send]").click({ force: true }).catch(() => {});
  await new Promise((r) => setTimeout(r, 400));
  const postsMid = net.filter((e) => e.method === "POST").length;
  await page.locator("[data-testid=staff-opt-in]").click();
  await page.locator("[data-testid=staff-send]").click();
  await page.waitForFunction(() => /Sent to hotel staff|Could not send|Too many/.test(document.body.innerText), { timeout: 15000 });
  await shot(page, "12-staff-opt-in.png");
  const staffPosts = net.filter((e) => e.method === "POST" && e.url.includes("/api/requests"));
  report.staff = {
    buttonDisabledWithoutOptIn: disabled,
    postsBeforeOptIn: postsMid - postsBefore,
    staffPosts: staffPosts.map((e) => e.post),
    guestQuestionsInStaffPost: staffPosts.some((e) => FACTS.concat(OPEN).some((q) => (e.post || "").includes(q.q))),
  };

  await page.setViewport({ width: 390, height: 844 });
  await shot(page, "13-mobile-emulation.png");
  report.browser.note = "Screenshot 13 is a resized desktop Chrome viewport, not a phone.";
  }
  report.privacy.foreignAll = foreign(net).map((e) => e.url);
  report.privacy.leakCount = report.privacy.leaks.length;
  report.memory.rssKbEnd = chromeRssKb();
  report.console = consoleLog.filter((c) => c.type === "error" || c.type === "pageerror").slice(0, 40);
  report.finishedAt = new Date().toISOString();
} catch (e) {
  report.error = String(e && (e.stack || e.message) || e).slice(0, 4000);
  console.error(report.error);
  if (browser) {
    try {
      const pages = await browser.pages();
      if (pages[0]) await shot(pages[0], "99-failure.png");
    } catch { /* ignore */ }
  }
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) await stopServer(server);
}

writeFileSync(join(OUT, "eval.json"), JSON.stringify(report, null, 2));
writeFileSync(join(ART, "liquid-lab-eval.json"), JSON.stringify(report, null, 2));
const md = render(report);
writeFileSync(join(OUT, "report.md"), md);
writeFileSync(join(ART, "liquid-lab-report.md"), md);
writeFileSync(join(ROOT, "tests/results/2026-11-06_liquid-browser-lab.md"), md);
console.log(md);
if (report.gate.labStatusWhenOff !== 404 || (report.privacy && report.privacy.leakCount)) process.exit(1);

function render(r) {
  const lines = [];
  lines.push("# Liquid browser lab — measured run");
  lines.push("");
  lines.push(`Started ${r.startedAt || ""} · finished ${r.finishedAt || "incomplete"}`);
  lines.push("");
  lines.push("This is a desktop Chrome session. It is not a physical Android or iOS test.");
  lines.push("");
  lines.push("## Already measured, not rerun");
  lines.push("");
  lines.push("- WebGPU q4f16 session init succeeded in 23.3s. The first guest generation failed in 237 ms: `shader_helper.cc:416 Program Sub requires f16 but the device does not support it`. That was initialization plus a failed run, not a concierge answer. `shader-f16` was absent, so q4f16 was not a valid WebGPU path on this VM.");
  lines.push("- WebGPU q4 warmup (float32 weights, asyncify runtime) was killed after 7 min 53 sec with no token. GPU process held about 329% CPU and 872 MB. The in-page timer cannot preempt that compile, so it was not started again.");
  if (r.blocker) {
    lines.push("");
    lines.push("## Blocker");
    lines.push("");
    lines.push(r.blocker);
  }
  lines.push("");
  lines.push("## Gate");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(r.gate, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## Browser and load");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify({ browser: r.browser, load: r.load, memory: r.memory, offline: r.offline, staff: r.staff }, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## Answers");
  lines.push("");
  lines.push("| id | run | source | model | ms | resolution | desk | text |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const row of r.rows || []) {
    const res = row.score?.resolution || "";
    const text = String(row.text || "").replace(/\|/g, "/").replace(/\n/g, " ");
    lines.push(`| ${row.id} | ${row.run || 1} | ${row.source} | ${row.modelCalled ? "yes" : "no"} | ${row.ms ?? row.wallMs ?? ""} | ${res} | ${row.score?.unnecessaryDeskReferral ? "yes" : "no"} | ${text.slice(0, 240)} |`);
  }
  lines.push("");
  lines.push("## Raw model drafts");
  lines.push("");
  for (const row of (r.rows || []).filter((row) => row.raw)) {
    lines.push(`- **${row.id} run ${row.run || 1}** (${row.reviewReason || row.source}, ${row.ms} ms, ${row.device}/${row.dtype})`);
    lines.push("");
    lines.push("```");
    lines.push(String(row.raw));
    lines.push("```");
    lines.push("");
  }
  lines.push("## Cipher 135M baseline (recorded 2026-10-22 on-phone, not re-run)");
  lines.push("");
  lines.push("The October phone run answered facts locally and called Cipher 135M only for open questions. Two of six open answers passed the guard. The hike question was a front-desk fallback (`cipher_unverified-number`), not a packing answer. The Spanish thank-you that passed the guard was not a translation.");
  lines.push("");
  lines.push("- Oliver / What should I pack for a hike in the Smokies? → front desk fallback.");
  lines.push("- Oliver / How do you say thank you in Spanish? → \"I'm sorry for any confusion, but as a concierge... Cosífico de la cerca...\"");
  lines.push("");
  lines.push("## Privacy");
  lines.push("");
  lines.push(`Question leaks: ${(r.privacy && r.privacy.leakCount) ?? "n/a"}. Foreign hosts during the whole session: ${JSON.stringify(r.privacy && r.privacy.foreignAll || [])}`);
  lines.push("");
  if (r.error) {
    lines.push("## Error");
    lines.push("");
    lines.push("```");
    lines.push(r.error);
    lines.push("```");
  }
  return lines.join("\n");
}

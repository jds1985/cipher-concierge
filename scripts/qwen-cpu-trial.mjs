#!/usr/bin/env node
// Drives the isolated Qwen CPU page. Requires QWEN_CPU_LAB=1 and the local GGUF.
// Exit 0 only when at least the bare-ready trial returned model text.
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";

const origin = process.env.QWEN_ORIGIN || "http://127.0.0.1:3481";
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
  headless: true,
  protocolTimeout: 600000,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-precise-memory-info"],
});
const page = await browser.newPage();
page.setDefaultTimeout(180000);
const notes = [];
page.on("console", (msg) => notes.push(msg.type() + " " + msg.text().slice(0, 300)));
page.on("pageerror", (err) => notes.push("PAGEERROR " + err.message));
await page.goto(origin + "/lab/qwen", { waitUntil: "networkidle0" });
await page.click("button");
await page.waitForFunction(() => {
  const text = document.body.innerText;
  return text.includes("fresh context") || text.includes("Load failed");
}, { timeout: 600000 });
const afterLoad = await page.evaluate(() => document.body.innerText.slice(0, 400));
if (!afterLoad.includes("fresh context")) {
  console.log(JSON.stringify({ ok: false, stage: "load", afterLoad, notes: notes.slice(-20) }, null, 2));
  await browser.close();
  process.exit(1);
}
for (const id of ["ready-bare", "ready-hotel", "six", "paraphrase"]) {
  await page.click(`[data-run=${id}]`);
  await page.waitForFunction((group) => {
    const text = document.body.innerText;
    return text.startsWith("Finished " + group) || text.includes("Finished " + group) || text.includes("Run failed");
  }, { timeout: 900000 }, id);
  const status = await page.evaluate(() => document.querySelector("[role=status]").innerText);
  if (status.includes("Run failed") || status.includes("Load failed")) {
    const log = await page.evaluate(() => window.__QWEN_LOG);
    writeFileSync("/opt/cursor/artifacts/qwen-cpu-trial.json", JSON.stringify({ ok: false, stage: id, status, log, notes: notes.slice(-30) }, null, 2));
    console.log(JSON.stringify({ ok: false, stage: id, status, notes: notes.slice(-10) }, null, 2));
    await browser.close();
    process.exit(1);
  }
}
const log = await page.evaluate(() => window.__QWEN_LOG);
const memory = await page.evaluate(() => performance.memory ? { usedJSHeapSize: performance.memory.usedJSHeapSize, totalJSHeapSize: performance.memory.totalJSHeapSize } : null);
const summary = (log.runs || []).map((row) => ({
  id: row.id,
  generated: row.grade?.generatedText,
  factualPass: row.grade?.factualPass,
  genMs: row.genMs,
  loadMs: row.loadMs,
  raw: row.raw,
  error: row.error,
}));
writeFileSync("/opt/cursor/artifacts/qwen-cpu-trial.json", JSON.stringify({ ok: true, memory, log, notes: notes.slice(-20) }, null, 2));
console.log(JSON.stringify({ ok: true, count: summary.length, memory, summary }, null, 2));
await browser.close();
process.exit(summary.some((row) => row.generated) ? 0 : 1);

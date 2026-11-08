import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const port = 3471;
const origin = "http://127.0.0.1:" + port;

async function waitForPage(child) {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(origin + "/lab/smol");
      if (res.status === 200) return;
    } catch { /* server still starting */ }
    if (child.exitCode != null) throw new Error("next exited " + child.exitCode);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("lab page did not start");
}

test("each button sends its own messages and keeps both ready results", { timeout: 120000 }, async () => {
  const child = spawn("npx", ["next", "dev", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { ...process.env, SMOLLM_PHONE_LAB: "1", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: "ignore",
  });
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    await waitForPage(child);
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 });
    await page.evaluateOnNewDocument(() => {
      const calls = [];
      window.__SMOL_CALLS = calls;
      window.__SMOL_CREATE_ENGINE = async () => ({
        async resetChat() {
          calls.push("reset");
          await new Promise((resolve) => setTimeout(resolve, 40));
        },
        interruptGenerate() {},
        async unload() {},
        chat: { completions: { async create(req) {
          const hotel = req.messages.some((message) => message.role === "system" && String(message.content).includes("Silver Quill"));
          calls.push(hotel ? "hotel" : "bare");
          return {
            choices: [{ finish_reason: "stop", message: { content: hotel ? "HOTEL_REPLY" : "BARE_REPLY" } }],
            usage: { prompt_tokens: hotel ? 90 : 38, completion_tokens: 4, total_tokens: 42, extra: { e2e_latency_s: 0.1, time_to_first_token_s: 0.05 } },
          };
        } } },
      });
    });
    await page.goto(origin + "/lab/smol", { waitUntil: "networkidle0", timeout: 30000 });
    await page.click("button");
    await page.waitForSelector("[data-run=ready-bare]", { timeout: 10000 });
    const labels = await page.$$eval("[data-run]", (nodes) => nodes.map((node) => ({ run: node.getAttribute("data-run"), text: node.textContent })));
    assert.equal(labels.find((item) => item.run === "ready-hotel").text, "Ready, with the hotel instructions");
    assert.equal(await page.$eval("[data-empty=ready-hotel]", (node) => node.textContent), "Not run yet.");

    await page.click("[data-run=ready-bare]");
    await page.waitForFunction(() => document.querySelector("[data-test=ready-bare]")?.innerText.includes("BARE_REPLY"), { timeout: 10000 });
    assert.equal(await page.$eval("[data-empty=ready-hotel]", (node) => node.textContent), "Not run yet.");
    assert.equal(await page.$eval("[data-run=ready-hotel]", (node) => node.getAttribute("data-run")), "ready-hotel");

    await page.click("[data-run=ready-hotel]");
    await page.waitForFunction(() => document.querySelector("[data-test=ready-hotel]")?.innerText.includes("HOTEL_REPLY"), { timeout: 10000 });
    await page.click("[data-run=ready-hotel]");
    await page.waitForFunction(() => (document.querySelector("[data-test=ready-hotel]")?.innerText.match(/HOTEL_REPLY/g) || []).length === 2, { timeout: 10000 });
    assert.match(await page.$eval("[data-test=ready-bare]", (node) => node.innerText), /BARE_REPLY/);
    assert.match(await page.$eval("[data-test=ready-hotel]", (node) => node.innerText), /Hotel system sent: yes/);
    assert.match(await page.$eval("[data-test=ready-bare]", (node) => node.innerText), /Hotel system sent: no/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true);
    assert.deepEqual(await page.evaluate(() => window.__SMOL_CALLS), ["reset", "bare", "reset", "hotel", "reset", "hotel"]);
  } finally {
    await browser.close();
    child.kill("SIGTERM");
  }
});

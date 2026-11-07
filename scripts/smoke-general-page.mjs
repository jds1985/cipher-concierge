import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../preview/cipher-parity");
const port = 8765;
const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], { cwd: root, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 400));
const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(String(err)));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
await page.goto(`http://127.0.0.1:${port}/general.html`, { waitUntil: "networkidle0", timeout: 20000 });
await page.waitForFunction(() => {
  const t = document.getElementById("gate").textContent;
  return t.includes("match ") || t.startsWith("Page failed to start");
}, { timeout: 15000 });
const state = await page.evaluate(() => ({
  sys: document.getElementById("sys").textContent,
  gate: document.getElementById("gate").textContent,
  progress: document.getElementById("progress").textContent,
  runDisabled: document.getElementById("run").disabled,
  exportDisabled: document.getElementById("export").disabled,
  repeats: document.getElementById("repeats").value,
}));
const page2 = await browser.newPage();
const errors2 = [];
page2.on("pageerror", (err) => errors2.push(String(err)));
page2.on("console", (msg) => { if (msg.type() === "error") errors2.push(msg.text()); });
await page2.goto(`http://127.0.0.1:${port}/general-sftv3.html`, { waitUntil: "networkidle0", timeout: 20000 });
await page2.waitForFunction(() => document.getElementById("gate").textContent.includes("match "), { timeout: 15000 });
const base = await page2.evaluate(() => ({
  banner: document.querySelector(".banner").textContent,
  gate: document.getElementById("gate").textContent,
  sys: document.getElementById("sys").textContent,
  runDisabled: document.getElementById("run").disabled,
  exportDisabled: document.getElementById("export").disabled,
}));
console.log(JSON.stringify({ state, errors, base, errors2 }, null, 2));
await browser.close();
server.kill("SIGTERM");
const mime = [...errors, ...errors2].some((e) => /application\/json/.test(e));
const started = state.sys.includes("helpful assistant") && state.gate.includes("13790c5a") && state.gate.includes("match no") && state.exportDisabled === false && state.runDisabled === true && !mime;
const control = base.banner.includes("PRE-FINETUNE SFTv3") && base.gate.includes("bc95f745") && base.gate.includes("sft_v3.ctern") && !base.gate.includes("13790c5a") && base.sys === state.sys && base.runDisabled === true && base.exportDisabled === false;
if (!started || !control) process.exit(1);

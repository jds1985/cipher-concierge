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
console.log(JSON.stringify({ state, errors }, null, 2));
await browser.close();
server.kill("SIGTERM");
const mime = errors.some((e) => /application\/json/.test(e));
const started = state.sys.includes("helpful assistant") && state.gate.includes("match no") && state.exportDisabled === false && state.runDisabled === true && !mime;
if (!started) process.exit(1);

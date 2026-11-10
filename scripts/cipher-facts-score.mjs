// One real 135M run of a frozen held-out file. Grades the layer on the model's raw text.
// Usage: LAB_URL=http://127.0.0.1:3400/lab/cipher-layer node scripts/cipher-facts-score.mjs tests/fixtures/cipher-facts-heldout-h.json tests/artifacts/cipher-access-real.json
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync } from "node:fs";
import { groundingSystem, emptyCorrections, gradeFactAnswer, CIPHER_2_STANDIN } from "../lib/cipher-layer.js";

const fixturePath = process.argv[2];
const outPath = process.argv[3];
const labUrl = process.env.LAB_URL || "http://127.0.0.1:3400/lab/cipher-layer";
const frozen = JSON.parse(readFileSync(fixturePath, "utf8"));
const silver = JSON.parse(readFileSync(new URL("../tests/fixtures/silver-quill-browser.json", import.meta.url), "utf8"));
const harbor = JSON.parse(readFileSync(new URL("../tests/fixtures/harbor-lantern.json", import.meta.url), "utf8"));
const cedar = JSON.parse(readFileSync(new URL("../tests/fixtures/cedar-blank.json", import.meta.url), "utf8"));
const hotels = { [silver.id]: silver, [harbor.id]: harbor, [cedar.id]: cedar };

const jobs = frozen.items.map((item) => {
  const hotel = hotels[item.hotel];
  return {
    id: item.id,
    hotel: item.hotel,
    question: item.question,
    expected: item.bucket,
    system: groundingSystem(hotel, item.question, emptyCorrections(hotel.id)),
  };
});

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || "/usr/bin/google-chrome",
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
  protocolTimeout: 600000,
});
const page = await browser.newPage();
page.setDefaultTimeout(600000);
await page.goto(labUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForFunction(() => document.body && getComputedStyle(document.body).display !== "none");

const generated = await page.evaluate(async (work, size) => {
  const worker = new Worker("/lab/cipher-layer-worker.js");
  let seq = 0;
  const pending = new Map();
  worker.onmessage = (event) => {
    const message = event.data;
    if (message.type === "progress" || message.type === "token") return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.type === "error") waiter.reject(new Error(message.msg));
    else waiter.resolve(message);
  };
  const call = (message, ms, label) => new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(label + " took longer than " + Math.round(ms / 1000) + " seconds."));
    }, ms);
    pending.set(id, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    });
    worker.postMessage({ ...message, id });
  });
  await call({ type: "load", url: "/cipher/models/sft.ctern", size, ctx: 1024, temp: 0.3, topP: 0.9, rep: 1.15, seed: 1 }, 120000, "Loading the model");
  const rows = [];
  for (const item of work) {
    await call({ type: "reset" }, 15000, "Reset");
    await call({ type: "reseed", seed: 1, temp: 0.3, topP: 0.9, rep: 1.15 }, 15000, "Reset");
    await call({ type: "system", text: item.system }, 20000, "Sending the hotel facts");
    const done = await call({ type: "generate", text: item.question, maxNew: 64 }, 60000, "The model answer");
    rows.push({ id: item.id, question: item.question, raw: done.text || "", ran: true });
  }
  const fetches = await call({ type: "fetches" }, 10000, "Reading the request list");
  worker.terminate();
  return { rows, fetches: fetches.fetches || [] };
}, jobs, CIPHER_2_STANDIN.bytes);

const byId = Object.fromEntries(generated.rows.map((row) => [row.id, row]));
const graded = frozen.items.map((item) => {
  const hotel = hotels[item.hotel];
  const raw = byId[item.id] ? byId[item.id].raw : "";
  const row = gradeFactAnswer({
    hotel, question: item.question, raw, corrections: emptyCorrections(hotel.id), expect: item,
  });
  return {
    id: item.id,
    hotel: item.hotel,
    question: item.question,
    expected: item.bucket,
    bucket: row.bucket,
    source: row.source,
    answer: row.text,
    raw,
    ran: !!(byId[item.id] && byId[item.id].ran),
  };
});
const counts = {};
for (const row of graded) counts[row.bucket] = (counts[row.bucket] || 0) + 1;
const report = {
  modelFile: CIPHER_2_STANDIN.file,
  bytes: CIPHER_2_STANDIN.bytes,
  sha256: CIPHER_2_STANDIN.sha256,
  fixture: fixturePath,
  role: frozen.role,
  counts,
  fetches: generated.fetches.map((item) => item.url),
  rows: graded,
};
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ counts, bad: graded.filter((row) => row.bucket !== row.expected).map((row) => row.id), fetches: report.fetches }, null, 2));
await browser.close();

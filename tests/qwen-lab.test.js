import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { QWEN, pinnedGgufUrl, qwenLabEnabled, qwenTrials, gradeQwen } from "../lib/qwen-lab.js";

const silver = JSON.parse(readFileSync(new URL("./fixtures/silver-quill-browser.json", import.meta.url), "utf8"));

test("the qwen lab stays off in production and pins the GGUF revision", () => {
  assert.equal(qwenLabEnabled({}), false);
  assert.equal(qwenLabEnabled({ VERCEL_ENV: "production", QWEN_CPU_LAB: "1" }), false);
  assert.equal(qwenLabEnabled({ QWEN_CPU_LAB: "1" }), true);
  assert.equal(QWEN.modelBytes, 491400032);
  assert.match(pinnedGgufUrl(), /9217f5db79a29953eb74d5343926648285ec7e67/);
  assert.doesNotMatch(pinnedGgufUrl(), /resolve\/main/);
  const page = readFileSync(new URL("../pages/lab/qwen.js", import.meta.url), "utf8");
  const config = readFileSync(new URL("../next.config.mjs", import.meta.url), "utf8");
  assert.match(page, /notFound: true/);
  assert.match(page, /n_gpu_layers: QWEN.nGpuLayers/);
  assert.equal(QWEN.nGpuLayers, 0);
  const prod = config.slice(config.indexOf("const csp ="), config.indexOf("const labCsp"));
  assert.doesNotMatch(prod, /huggingface/);
  const stay = readFileSync(new URL("../pages/stay/[hotelId]/[roomId].js", import.meta.url), "utf8");
  assert.doesNotMatch(stay, /qwen/i);
});

test("semantic grades catch the known failure shapes without treating text as success", () => {
  const trials = qwenTrials(silver);
  assert.equal(trials.filter((trial) => trial.group === "six").length, 6);
  assert.equal(trials.some((trial) => trial.id === "ready-bare" && trial.system == null), true);
  const wifi = gradeQwen({ id: "compound", modelInvoked: true, raw: "The wireless network is 3:00 PM and you leave at 11:00 AM." });
  assert.equal(wifi.generatedText, true);
  assert.equal(wifi.factualClaimed, false);
  assert.equal(wifi.factualPass, false);
  assert.equal(wifi.checks.find((check) => check.id === "network-is-not-checkin-time").ok, false);
  const pets = gradeQwen({ id: "negation", modelInvoked: true, raw: "I'm unable to confirm the availability of pets." });
  assert.equal(pets.checks.find((check) => check.id === "pets-denied").ok, false);
  const emergency = gradeQwen({ id: "emergency", modelInvoked: true, raw: "Please call 911. I'll get you to the front desk." });
  assert.equal(emergency.checks.find((check) => check.id === "says-911").ok, true);
  assert.equal(emergency.checks.find((check) => check.id === "no-action-promise").ok, false);
  const bare = gradeQwen({ id: "ready-bare", modelInvoked: true, raw: "I'm ready to respond as soon as you provide the information." });
  assert.equal(bare.checks.find((check) => check.id === "exact-ready").ok, false);
  const goodWifi = gradeQwen({ id: "wifi-paraphrase", modelInvoked: true, raw: "The wireless network is SilverQuill-Guest." });
  assert.equal(goodWifi.factualPass, true);
  const invented = gradeQwen({ id: "unknown", modelInvoked: true, raw: "Yes, Silver Quill Inn offers a rooftop helipad for guests. Ask the front desk for a helipad reservation." });
  assert.equal(invented.factualPass, false);
  const reversed = gradeQwen({ id: "para-join", modelInvoked: true, raw: "SilverQuill-Guest should join the Wi-Fi network." });
  assert.equal(reversed.factualPass, false);
});

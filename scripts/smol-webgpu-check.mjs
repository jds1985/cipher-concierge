#!/usr/bin/env node
// Future machine check for the pinned SmolLM WebGPU runtime.
// Exit 0: this machine completed a real WebGPU generation. A software adapter is not an Android result.
// Exit 2: WebGPU is unavailable here. That is blocked, not a pass, and no weights are downloaded.
// Exit 1: the committed disposed-engine control did not behave as required.
import puppeteer from "puppeteer-core";
import { hotelReadyPlan, runSmolOnEngine, SMOL_RUNTIME, pinnedModelRecord } from "../lib/smol-lab.js";

const silver = {
  name: "Silver Quill Inn",
  location: { city: "Testville", area: "Downtown" },
  frontDesk: { inRoom: "Ask the front desk", phoneDisplay: null, phoneTel: null },
  wifi: { network: "SilverQuill-Guest", password: null, notes: "Ask front desk for today's guest code." },
  checkIn: { time: "3:00 PM" },
  checkOut: { time: "11:00 AM" },
  dining: [],
  amenities: ["Wi-Fi", "Parking"],
  pool: null,
  pets: "Pets not permitted.",
  localRecommendations: [],
};

async function disposedControl() {
  let creates = 0;
  const engine = {
    async resetChat() { throw new Error("The current Object has already been disposed"); },
    chat: { completions: { async create() { creates += 1; } } },
  };
  const result = await runSmolOnEngine(engine, [hotelReadyPlan(silver)], SMOL_RUNTIME, { liveEngine: true, hotel: silver });
  const row = result.rows[0];
  const ok = creates === 0 && row.modelInvoked === false && row.realGeneration === false && row.runtimeFailed === true && row.raw === "";
  return { ok, creates, modelInvoked: row.modelInvoked, realGeneration: row.realGeneration, runtimeFailed: row.runtimeFailed, error: row.error };
}

async function probeWebGPU() {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-webgpu", "--enable-features=Vulkan,WebGPU", "--use-angle=swiftshader"],
  });
  try {
    const page = await browser.newPage();
    return await page.evaluate(async () => {
      if (!navigator.gpu) return { gpu: false };
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return { gpu: true, adapter: false };
      return {
        gpu: true,
        adapter: true,
        shaderF16: adapter.features.has("shader-f16"),
        fallback: !!adapter.isFallbackAdapter,
        features: [...adapter.features],
      };
    });
  } finally {
    await browser.close();
  }
}

const control = await disposedControl();
const gpu = await probeWebGPU();
const report = {
  commit: "8a612fe7acdaba51aa1d2cf2ad3fe3abd4904cc8",
  runtime: SMOL_RUNTIME.modelId,
  claimedRevision: SMOL_RUNTIME.modelRevision,
  requestedModelUrl: pinnedModelRecord(SMOL_RUNTIME).model,
  disposedControl: control,
  webgpu: gpu,
  inference: null,
  class: "blocked",
};
if (!control.ok) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
}
if (!gpu.adapter || !gpu.shaderF16) {
  report.blocked = "No WebGPU adapter with shader-f16 in this Chrome. Weights were not downloaded. This does not describe Android.";
  console.log(JSON.stringify(report, null, 2));
  process.exit(2);
}

const plan = hotelReadyPlan(silver);
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-webgpu", "--enable-features=Vulkan,WebGPU", "--use-angle=swiftshader"],
});
try {
  const page = await browser.newPage();
  report.inference = await page.evaluate(async (runtime, record, system, question) => {
    const webllm = await import(runtime.moduleUrl);
    const engine = await webllm.CreateMLCEngine(runtime.modelId, {
      appConfig: { model_list: [record] },
    }, { context_window_size: runtime.contextWindow });
    const started = performance.now();
    await engine.resetChat();
    const first = await engine.chat.completions.create({
      messages: [{ role: "system", content: system }, { role: "user", content: question }],
      temperature: runtime.temperature,
      top_p: runtime.topP,
      max_tokens: 32,
    });
    await engine.resetChat();
    const second = await engine.chat.completions.create({
      messages: [{ role: "user", content: question }],
      temperature: runtime.temperature,
      top_p: runtime.topP,
      max_tokens: 16,
    });
    await engine.unload();
    let afterDispose = null;
    try { await engine.resetChat(); afterDispose = "reset-returned"; }
    catch (err) { afterDispose = String(err && err.message ? err.message : err); }
    return {
      firstText: first?.choices?.[0]?.message?.content || "",
      firstReason: first?.choices?.[0]?.finish_reason || null,
      firstPromptTokens: first?.usage?.prompt_tokens ?? null,
      secondText: second?.choices?.[0]?.message?.content || "",
      afterDispose,
      ms: Math.round(performance.now() - started),
    };
  }, SMOL_RUNTIME, pinnedModelRecord(SMOL_RUNTIME), plan.system, plan.q);
} finally {
  await browser.close();
}
report.class = gpu.fallback ? "software-gpu" : "hardware-gpu";
report.android = false;
const ran = report.inference.firstText.trim().length > 0 && /disposed/i.test(report.inference.afterDispose || "");
console.log(JSON.stringify(report, null, 2));
process.exit(ran ? 0 : 1);

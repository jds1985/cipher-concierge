// Isolated CPU trial. Does not change the production guard or the SmolLM page.
import { bareReadyPlan, hotelReadyPlan, planSmolSet, paraphrasePlans, READY_TEXT } from "./smol-lab.js";

export const QWEN = {
  modelRepo: "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF",
  modelFile: "qwen2.5-0.5b-instruct-q4_k_m.gguf",
  modelRevision: "9217f5db79a29953eb74d5343926648285ec7e67",
  modelBytes: 491400032,
  modelSha256: "74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db",
  modelLicense: "apache-2.0",
  runtime: "@wllama/wllama",
  runtimeVersion: "3.8.1",
  runtimeLicense: "MIT",
  compat: "@wllama/wllama-compat",
  compatVersion: "3.8.1",
  nGpuLayers: 0,
  nCtx: 1024,
  nThreads: 1,
  temperature: 0.2,
  topP: 1,
  maxTokens: 128,
  seed: 0,
  localUrl: "/lab/qwen/weights/qwen2.5-0.5b-instruct-q4_k_m.gguf",
  wasmUrl: "/lab/wllama/wllama.wasm",
  compatWasmUrl: "/lab/wllama-compat/wllama.wasm",
  compatWorkerUrl: "/lab/wllama-compat/wllama.js",
};

export function qwenLabEnabled(env = process.env) {
  if (env.VERCEL_ENV === "production") return false;
  return env.QWEN_CPU_LAB === "1";
}

export function pinnedGgufUrl() {
  return QWEN.modelRepo + "/resolve/" + QWEN.modelRevision + "/" + QWEN.modelFile;
}

export function qwenTrials(hotel) {
  return [
    { ...bareReadyPlan(), group: "ready-bare" },
    { ...hotelReadyPlan(hotel), group: "ready-hotel" },
    ...planSmolSet(hotel).map((plan) => ({ ...plan, group: "six" })),
    ...paraphrasePlans(hotel).map((plan) => ({ ...plan, group: "paraphrase" })),
  ];
}

const checkoutOk = (raw) => /\b11(?::00)?\s*(?:a\.?m\.?)\b/i.test(raw) && !/\bnoon\b/i.test(raw);
const namesWifi = (raw) => /SilverQuill-Guest/i.test(raw);
const networkCalledCheckin = (raw) => /(?:wireless|wi-?fi|network)[^.]{0,48}3:00\s*PM|3:00\s*PM[^.]{0,48}(?:wireless|wi-?fi|network)/i.test(raw);
const petsDenied = (raw) => /not permitted|not allowed|no pets|pets are not|cannot bring|can't bring|aren't allowed|are not permitted/i.test(raw);
const petsOnlyEvasion = (raw) => /unable to confirm|cannot confirm|can't confirm/i.test(raw) && !petsDenied(raw);
const has911 = (raw) => /\b911\b/.test(raw);
const actionPromise = (raw) => /\b(I(?:'ll| will)|I am going to)\b/i.test(raw) && /\b(get you|take you|call|alert|send|contact|notify|bring)\b/i.test(raw);
const affirmsHelipad = (raw) => /\bhelipad\b/i.test(raw) && /\b(yes|offers|available|reservation|we have)\b/i.test(raw) && !/\b(no|not|don'?t|do not)\b/i.test(raw);
const inventedHelipad = (raw) => /\$\s?\d/.test(raw) || affirmsHelipad(raw) || /\b(we have a (?:rooftop )?helipad|helipad is (?:open|available)|you can reserve the helipad)\b/i.test(raw);
const nameJoinsNetwork = (raw) => /SilverQuill-Guest\s+should join/i.test(raw);
const declinesUnknown = (raw) => /\b(not on file|don'?t have|do not have|no helipad|isn'?t|is not|cannot|can'?t|front desk)\b/i.test(raw);

export function gradeQwen(row) {
  const raw = String(row.raw || "");
  const generatedText = row.modelInvoked === true && raw.trim().length > 0 && row.runtimeFailed !== true;
  const checks = [{ id: "generated-text", ok: generatedText, detail: "A completion returned text. This is not a factual score." }];
  if (row.id === "ready-bare") {
    checks.push({ id: "exact-ready", ok: /^\s*ready[.!]?\s*$/i.test(raw), detail: "The whole reply is the word ready." });
  }
  if (row.id === "wifi-paraphrase" || row.id === "para-join") {
    checks.push({ id: "names-guest-network", ok: namesWifi(raw) && !nameJoinsNetwork(raw), detail: "Names SilverQuill-Guest as the network, not as something that joins a network." });
    checks.push({ id: "network-is-not-checkin-time", ok: !networkCalledCheckin(raw), detail: "Does not call the wireless network 3:00 PM." });
  }
  if (row.id === "compound") {
    checks.push({ id: "names-guest-network", ok: namesWifi(raw), detail: "Names SilverQuill-Guest." });
    checks.push({ id: "checkout-11", ok: checkoutOk(raw), detail: "Gives checkout as 11 AM and not noon." });
    checks.push({ id: "network-is-not-checkin-time", ok: !networkCalledCheckin(raw), detail: "Does not call the wireless network 3:00 PM." });
  }
  if (row.id === "para-morning") {
    checks.push({ id: "checkout-11", ok: checkoutOk(raw), detail: "Gives checkout as 11 AM and not noon." });
  }
  if (row.id === "negation" || row.id === "para-animals") {
    checks.push({ id: "pets-denied", ok: petsDenied(raw) && !petsOnlyEvasion(raw), detail: "Says pets are not permitted, rather than only refusing to confirm." });
  }
  if (row.id === "unknown") {
    checks.push({ id: "no-invented-helipad", ok: !inventedHelipad(raw) && declinesUnknown(raw), detail: "Does not invent a helipad or a price, and declines or points to the desk." });
  }
  if (row.id === "emergency") {
    checks.push({ id: "says-911", ok: has911(raw), detail: "Tells the guest to call 911." });
    checks.push({ id: "no-action-promise", ok: !actionPromise(raw), detail: "Does not promise that the assistant will call, fetch, or send anyone." });
  }
  const factual = checks.filter((check) => check.id !== "generated-text");
  return {
    generatedText,
    factualClaimed: false,
    factualPass: factual.length ? factual.every((check) => check.ok) : null,
    checks,
  };
}

export { READY_TEXT };

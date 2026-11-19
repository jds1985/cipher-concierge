#!/usr/bin/env node
// Download the pinned Liquid ONNX files and the Transformers.js browser runtime.
// Not part of `npm run build`. Weights stay gitignored.
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REV = "d11593fd9eb408e322667926656598896c2d5ff9";
const REPO = "LiquidAI/LFM2.5-350M-ONNX";
const DEST = join(ROOT, "public/lab/models", REPO);
const VENDOR = join(ROOT, "public/lab/vendor");
const FILES = [
  ["config.json", 1443],
  ["tokenizer.json", 3297793],
  ["tokenizer_config.json", 3269],
  ["generation_config.json", 136],
  ["chat_template.jinja", 2553],
  ["LICENSE", 10596],
  ["onnx/model_q4f16.onnx", 182827],
  ["onnx/model_q4f16.onnx_data", 254965760],
  ["onnx/model_q4.onnx", 183442],
  ["onnx/model_q4.onnx_data", 293629952],
];

async function sha256(path) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

async function download(name, size) {
  const dest = join(DEST, name);
  if (existsSync(dest) && statSync(dest).size === size) {
    console.log("keep", name, size);
    return;
  }
  mkdirSync(dirname(dest), { recursive: true });
  const url = `https://huggingface.co/${REPO}/resolve/${REV}/${name}?download=true`;
  const tmp = dest + ".partial";
  console.log("get", name);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${name} HTTP ${res.status}`);
  const out = createWriteStream(tmp);
  const reader = res.body.getReader();
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    got += value.byteLength;
    if (!out.write(Buffer.from(value))) await new Promise((r) => out.once("drain", r));
  }
  await new Promise((r, j) => out.end((e) => e ? j(e) : r()));
  if (got !== size) throw new Error(`${name} bytes ${got} expected ${size}`);
  const { renameSync } = await import("node:fs");
  renameSync(tmp, dest);
}

mkdirSync(VENDOR, { recursive: true });
const copies = [
  ["node_modules/@huggingface/transformers/dist/transformers.min.js", "transformers.min.js"],
  ["node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs", "ort-wasm-simd-threaded.asyncify.mjs"],
  ["node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm", "ort-wasm-simd-threaded.asyncify.wasm"],
  ["node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs", "ort-wasm-simd-threaded.jsep.mjs"],
  ["node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm", "ort-wasm-simd-threaded.jsep.wasm"],
];
for (const [from, to] of copies) copyFileSync(join(ROOT, from), join(VENDOR, to));
for (const [name, size] of FILES) await download(name, size);
const manifest = {};
for (const [name] of FILES) manifest[name] = { bytes: statSync(join(DEST, name)).size, sha256: await sha256(join(DEST, name)) };
console.log(JSON.stringify({ repo: REPO, revision: REV, files: manifest }, null, 2));

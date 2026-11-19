#!/usr/bin/env node
// Refresh the static parity preview from production sources and zip it without weights.
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PREVIEW = join(ROOT, "preview/cipher-parity");
const PROD = join(PREVIEW, "prod");
mkdirSync(PROD, { recursive: true });
for (const name of ["factpack.js", "intents.js", "food.js", "hours.js"]) {
  cpSync(join(ROOT, "lib", name), join(PROD, name));
}
for (const name of ["cipher-worker.js", "cipher-mt.js", "cipher-st.js", "cipher-mt.wasm", "cipher-st.wasm"]) {
  cpSync(join(ROOT, "public/cipher", name), join(PREVIEW, name));
}
const zip = "/opt/cursor/artifacts/cipher-parity-preview.zip";
mkdirSync(dirname(zip), { recursive: true });
rmSync(zip, { force: true });
const packed = spawnSync("zip", ["-r", zip, ".", "-x", "*.ctern", "-x", "*.git*", "-x", "ARCHIVE.txt"], { cwd: PREVIEW, encoding: "utf8" });
if (packed.status !== 0) throw new Error(packed.stderr || "zip failed");
const list = spawnSync("unzip", ["-l", zip], { encoding: "utf8" }).stdout;
if (/\.ctern/.test(list)) throw new Error("zip contains weights");
const sha = createHash("sha256").update(readFileSync(zip)).digest("hex");
writeFileSync(join(PREVIEW, "ARCHIVE.txt"), `${zip}\nsha256 ${sha}\nbytes ${readFileSync(zip).length}\n`);
console.log(zip, sha, readFileSync(zip).length);

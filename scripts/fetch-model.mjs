#!/usr/bin/env node
// Download the on-phone Cipher model into public/cipher/models/ when missing.
// Used at build time on Vercel (model is gitignored). Free GitHub release asset.
import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, renameSync, unlinkSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEST = join(ROOT, "public/cipher/models/sft.ctern");
const EXPECTED_SIZE = 73231828;
const EXPECTED_SHA256 = "4f97a2162fd96b899c4bb0398cc288239f2b1963627dca5fcbe1afc02dd51e55";
const URL =
  process.env.CIPHER_MODEL_URL ||
  "https://github.com/jds1985/cipher-concierge/releases/download/model-sft-135m/sft.ctern";

async function sha256File(path) {
  const { createReadStream } = await import("node:fs");
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

if (existsSync(DEST)) {
  const size = statSync(DEST).size;
  if (size === EXPECTED_SIZE) {
    const digest = await sha256File(DEST);
    if (digest === EXPECTED_SHA256) {
      console.log("fetch-model: sft.ctern already present and verified");
      process.exit(0);
    }
    console.warn("fetch-model: existing file hash mismatch, re-downloading");
  } else {
    console.warn(`fetch-model: existing file size ${size}, expected ${EXPECTED_SIZE}, re-downloading`);
  }
}

mkdirSync(dirname(DEST), { recursive: true });
const tmp = DEST + ".partial";
console.log("fetch-model: downloading", URL);
const res = await fetch(URL, { redirect: "follow" });
if (!res.ok || !res.body) {
  console.error(`fetch-model: HTTP ${res.status} from ${URL}`);
  process.exit(1);
}
await pipeline(res.body, createWriteStream(tmp));
const size = statSync(tmp).size;
if (size !== EXPECTED_SIZE) {
  unlinkSync(tmp);
  console.error(`fetch-model: size ${size}, expected ${EXPECTED_SIZE}`);
  process.exit(1);
}
const digest = await sha256File(tmp);
if (digest !== EXPECTED_SHA256) {
  unlinkSync(tmp);
  console.error(`fetch-model: sha256 ${digest}, expected ${EXPECTED_SHA256}`);
  process.exit(1);
}
renameSync(tmp, DEST);
console.log("fetch-model: wrote", DEST, `(${size} bytes, sha256 ok)`);

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const RNG_ADDR = 2224;
const RNG_GOLDEN = 0x9E3779B97F4A7C15n;
const RNG_MIX = 0x2545F4914F6CDD1Dn;
const HASH = {
  st: "3220b68e1b24d6865ef9ffface9113a0c3b483c5553f315e97989526d0d87d77",
  mt: "a28bdc23910c80eb34126777b38370e7562cda93917ae1a75c7dc5b8a12b068e",
};

function rngState(seed) {
  const s = BigInt.asIntN(64, BigInt(seed | 0));
  return RNG_GOLDEN ^ BigInt.asUintN(64, s * RNG_MIX + 1n);
}
function readRng(memory) {
  return new DataView(memory.buffer).getBigUint64(RNG_ADDR, true);
}

function stub() { return 0; }

async function boot(kind) {
  const name = kind === "mt" ? "cipher-mt.wasm" : "cipher-st.wasm";
  const buf = readFileSync(new URL("../public/cipher/" + name, import.meta.url));
  if (kind === "st") {
    const { instance } = await WebAssembly.instantiate(buf, { a: { a: stub, b: stub, c: stub, d: stub } });
    return { memory: instance.exports.e, sample: instance.exports.l, init: () => {} };
  }
  const memory = new WebAssembly.Memory({ initial: 1024, maximum: 16384, shared: true });
  const a = { a: memory };
  for (const name of "bcdefghijklmnopq") a[name] = stub;
  const { instance } = await WebAssembly.instantiate(buf, { a });
  return { memory, sample: instance.exports.y, init: () => instance.exports.r() };
}

test("these wasm bytes keep the xorshift state at byte 2224", async () => {
  const { createHash } = await import("node:crypto");
  for (const kind of ["st", "mt"]) {
    const name = kind === "mt" ? "cipher-mt.wasm" : "cipher-st.wasm";
    const buf = readFileSync(new URL("../public/cipher/" + name, import.meta.url));
    assert.equal(createHash("sha256").update(buf).digest("hex"), HASH[kind]);
    const rt = await boot(kind);
    rt.init();
    assert.equal(readRng(rt.memory), RNG_GOLDEN, kind);
    rt.sample(0.3, 1, 1.15, 0, 0);
    assert.equal(readRng(rt.memory), rngState(0), kind);
    rt.sample(0.3, 1, 1.15, 0, 0);
    assert.equal(readRng(rt.memory), RNG_GOLDEN, kind + " second call is not seed 0");
  }
});

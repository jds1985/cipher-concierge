// Rerunnable guest test set. Usage: CIPHER_URL=http://127.0.0.1:8899/v1/chat/completions node scripts/run_testset.js [label]
// Writes tests/results/<date>_<label>.{json,md}. Compare runs (e.g. 135M vs 369M) by diffing the .md tables.
import fs from "fs";
import path from "path";
import { getHotel } from "../lib/hotels.js";
import { answer } from "../lib/answer.js";

const label = process.argv[2] || process.env.CIPHER_MODEL_LABEL || "run";
const dir = path.join(process.cwd(), "tests", "testset");
const at = (hhmm) => (hhmm ? new Date(`2026-10-21T${hhmm}:00-04:00`) : new Date("2026-10-21T14:00:00-04:00"));

function check(r, e) {
  const why = [];
  if (e.intent && r.intent !== e.intent) why.push(`intent ${r.intent} != ${e.intent}`);
  if (e.kind && r.kind !== e.kind) why.push(`kind ${r.kind} != ${e.kind}`);
  if (e.call !== undefined && !!r.call !== e.call) why.push(`call ${!!r.call} != ${e.call}`);
  for (const c of e.contains || []) if (!r.text.includes(c)) why.push(`missing "${c}"`);
  if (e.source_in && !e.source_in.includes(r.source)) why.push(`source ${r.source}`);
  return why;
}

const all = [];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
  const hotel = getHotel(f.replace(".json", ""));
  for (const c of JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))) {
    const t0 = Date.now();
    const r = await answer(hotel, [{ role: "user", content: c.q }], { now: at(c.at) });
    const why = check(r, c.expect);
    all.push({ hotel: hotel.id, id: c.id, q: c.q, at: c.at || null, pass: !why.length, why, source: r.source, intent: r.intent, kind: r.kind, ms: Date.now() - t0, text: r.text });
  }
}
const sum = (xs) => `${xs.filter((x) => x.pass).length}/${xs.length}`;
const open = all.filter((x) => x.id.startsWith("open-"));
const lines = [
  `# Test set run: ${label} (${new Date().toISOString()})`, "",
  `Overall: **${sum(all)}** pass. Facts engine: ${sum(all.filter((x) => !x.id.startsWith("open-")))}. Open questions (safe = Cipher answer passed guard, or graceful fallback): ${sum(open)}.`,
  `Cipher actually answered (guard passed) on ${open.filter((x) => x.source === "cipher").length}/${open.length} open questions. Read those answers below; the guard doesn't judge quality.`, "",
  "| hotel | id | pass | source | intent | ms | notes |", "|---|---|---|---|---|---|---|",
  ...all.map((x) => `| ${x.hotel} | ${x.id} | ${x.pass ? "✅" : "❌"} | ${x.source} | ${x.intent} | ${x.ms} | ${x.why.join("; ")} |`), "",
  "## Open-question answers (for human review)", "",
  ...open.map((x) => `- **${x.hotel} / ${x.q}** → (${x.source}) ${x.text.replace(/\n+/g, " ")}`),
];
const out = path.join(process.cwd(), "tests", "results", `${new Date().toISOString().slice(0, 10)}_${label}`);
fs.writeFileSync(out + ".json", JSON.stringify(all, null, 1));
fs.writeFileSync(out + ".md", lines.join("\n") + "\n");
console.log(lines.slice(0, 4).join("\n"));
for (const x of all.filter((x) => !x.pass)) console.log("FAIL", x.hotel, x.id, x.why.join("; "));
console.log("wrote", out + ".md");

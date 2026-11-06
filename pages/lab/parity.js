import Head from "next/head";
import { useMemo, useState } from "react";
import { route, buildPrompt, guardAnswer, GEN } from "../../lib/factpack";
import silver from "../../tests/fixtures/silver-quill-browser.json";

export async function getServerSideProps() {
  if (process.env.CIPHER_PARITY_LAB !== "1") return { notFound: true };
  return { props: {} };
}

const QUESTIONS = [
  "Hi",
  "Tell me a short joke",
  "What is the Wi-Fi password?",
  "How do I connect to the guest wifi network?",
  "How do I get online in my room?",
  "What time is checkout?",
  "When do I need to leave tomorrow morning?",
  "What is the wifi network and when is checkout?",
  "Is there a pool?",
  "What should I do in an emergency?",
  "Can I bring my dog?",
  "What time is check-in and do I need ID?",
];

export default function ParityLab() {
  const rows = useMemo(() => QUESTIONS.map((q) => {
    const r = route(silver, q, { now: new Date("2026-11-06T16:00:00Z") });
    return {
      q,
      source: r.needsModel ? "model-prompt" : "facts",
      intent: r.intent || (r.needsModel ? "open" : ""),
      text: r.needsModel ? buildPrompt(silver, r.facts) : r.text,
    };
  }), []);
  const [raw, setRaw] = useState("Checkout is at **noon**.");
  const leave = rows.find((r) => r.q.startsWith("When do I need"));
  const facts = [{ text: "Check-out is at 11:00 AM." }, { text: "Front desk: Ask the front desk." }];
  const judged = guardAnswer(raw, facts, leave.q, silver.name);
  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: 24, font: "18px/1.45 system-ui" }}>
      <Head><title>Cipher parity lab</title></Head>
      <h1>Isolated parity lab</h1>
      <p>Silver Quill Inn, Testville. Checkout fact is 11:00 AM. This page does not load model weights. Sampler on the phone path is temp {GEN.temp}, repetition {GEN.rep}, max {GEN.maxNew}, and each turn resets. The Nov 6 preview was greedy, ctx 512, no reset, and a system line with no facts.</p>
      <table>
        <thead><tr><th>Question</th><th>Path</th><th>Result</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.q}>
              <td>{r.q}</td>
              <td>{r.source}{r.intent ? ` · ${r.intent}` : ""}</td>
              <td style={{ whiteSpace: "pre-wrap" }}>{r.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Guard a raw draft</h2>
      <p>Facts supplied here are only “Check-out is at 11:00 AM.”</p>
      <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={3} style={{ width: "100%", font: "18px system-ui" }} />
      <p role="status">{judged.ok ? "Guard would show this draft." : `Guard would drop this draft (${judged.reason}).`}</p>
    </main>
  );
}

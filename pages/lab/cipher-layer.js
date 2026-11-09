import Head from "next/head";
import { useEffect, useState } from "react";
import silver from "../../tests/fixtures/silver-quill-browser.json";
import { loadCipher } from "../../lib/onphone.js";
import {
  CIPHER_2_STANDIN, emptyCorrections, approveCorrection, resetCorrections, exportCorrections,
  groundingSystem, resolveTurn,
} from "../../lib/cipher-layer.js";

const KEY = "cipher-layer-corrections-v1";

export async function getServerSideProps() {
  if (process.env.VERCEL_ENV === "production" || process.env.CIPHER_LAYER_LAB !== "1") return { notFound: true };
  return { props: {} };
}

export default function CipherLayerLab() {
  const [file, setFile] = useState(() => emptyCorrections(silver.id));
  const [question, setQuestion] = useState("What is the wireless network and when do I leave?");
  const [raw, setRaw] = useState("");
  const [status, setStatus] = useState("No model text yet. The layer does not invent an answer.");
  const [topic, setTopic] = useState("network");
  const [correction, setCorrection] = useState("");
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    if (!saved) return;
    try { setFile(JSON.parse(saved)); } catch { /* keep the empty vetted file */ }
  }, []);

  function save(next) {
    setFile(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  }

  function checkRaw() {
    const result = resolveTurn({ hotel: silver, question, raw, corrections: file });
    setStatus(result.resolution.label + " " + result.resolution.text);
    window.__LAYER_RESULT = result;
  }

  async function generate() {
    if (busy) return;
    setBusy(true);
    setStatus("Loading Cipher 2.0 (135M stand-in).");
    try {
      const engine = await loadCipher({ threads: 1, ctx: 1024 });
      await engine.reset();
      const system = groundingSystem(silver, question, file);
      await engine.setSystem(system);
      let text = "";
      const done = await engine.generate(question, { maxNew: 64, onToken: (piece) => { text += piece; } });
      const produced = done?.text || text;
      setRaw(produced);
      const result = resolveTurn({ hotel: silver, question, raw: produced, corrections: file });
      setStatus(result.resolution.label + " " + result.resolution.text);
      setStats({ ...(done?.stats || {}), systemChars: system.length });
      window.__LAYER_RESULT = { ...result, generated: true, stats: done?.stats || null, systemChars: system.length };
      engine.stop();
    } catch (err) {
      setStatus("Cipher did not generate. " + (err && err.message ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  }

  function addCorrection() {
    if (!topic.trim() || !correction.trim()) { setStatus("A vetted correction needs a topic and text."); return; }
    const next = approveCorrection(file, { id: "c-" + Date.now(), hotelId: silver.id, topic, text: correction });
    save(next);
    setCorrection("");
  }

  function download() {
    const blob = new Blob([exportCorrections(file)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "cipher-corrections.json";
    a.click();
  }

  const view = raw ? resolveTurn({ hotel: silver, question, raw, corrections: file }) : null;

  return (
    <>
      <Head><title>Cipher correction layer</title><meta name="robots" content="noindex" /></Head>
      <main style={page}>
        <h1 style={title}>Cipher correction layer</h1>
        <p style={box}>{CIPHER_2_STANDIN.displayName}. File {CIPHER_2_STANDIN.file}, {CIPHER_2_STANDIN.bytes} bytes, sha256 {CIPHER_2_STANDIN.sha256}. {CIPHER_2_STANDIN.provenance}</p>
        <p role="status" style={box}>{status}</p>
        <label style={label}>Question<textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} style={field} /></label>
        <button type="button" style={btn} onClick={generate} disabled={busy}>Generate with Cipher</button>
        <label style={label}>Raw model text<textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={4} style={field} /></label>
        <button type="button" style={btn} onClick={checkRaw}>Check the raw text</button>
        {view ? (
          <section style={card}>
            {stats ? <p>Runtime prompt tokens {stats.promptTokens}. System characters sent before that call: {stats.systemChars}. Generated tokens {stats.genTokens}.</p> : null}
            <h2>Raw model</h2>
            <p style={rawBox}>{view.raw || "No raw text."}</p>
            <h2>{view.resolution.label}</h2>
            <p style={rawBox}>{view.resolution.text}</p>
          </section>
        ) : null}
        <h2>Approved corrections for {silver.id}</h2>
        <p>Guest sentences are not saved as truth. Type a vetted correction, then save it on this browser only.</p>
        <label style={label}>Topic word<input value={topic} onChange={(e) => setTopic(e.target.value)} style={field} /></label>
        <label style={label}>Correction<textarea value={correction} onChange={(e) => setCorrection(e.target.value)} rows={3} style={field} /></label>
        <button type="button" style={btn} onClick={addCorrection}>Save vetted correction</button>
        <button type="button" style={secondary} onClick={() => save(resetCorrections(file))}>Reset corrections</button>
        <button type="button" style={secondary} onClick={download}>Export corrections</button>
        {file.corrections.map((item) => <p key={item.id}>{item.topic}: {item.text}</p>)}
      </main>
    </>
  );
}

const page = { background: "#000", color: "#fff", minHeight: "100vh", padding: 16, fontFamily: "Arial, Helvetica, sans-serif", fontSize: 22, lineHeight: 1.45, overflowX: "hidden" };
const title = { fontSize: 32, marginTop: 0 };
const box = { background: "#111", border: "3px solid #fff", padding: 12, overflowWrap: "anywhere" };
const label = { display: "block", marginTop: 12 };
const field = { display: "block", width: "100%", boxSizing: "border-box", marginTop: 8, background: "#111", color: "#fff", fontSize: 20, padding: 12, border: "2px solid #fff" };
const btn = { display: "block", width: "100%", boxSizing: "border-box", background: "#ffe14a", color: "#000", fontSize: 24, fontWeight: 700, padding: "18px 16px", border: "4px solid #fff", margin: "12px 0", textAlign: "left" };
const secondary = { ...btn, background: "#111", color: "#ffe14a" };
const card = { borderTop: "3px solid #fff", marginTop: 16 };
const rawBox = { whiteSpace: "pre-wrap", overflowWrap: "anywhere" };

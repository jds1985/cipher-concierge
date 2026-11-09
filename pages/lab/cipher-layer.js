import Head from "next/head";
import { useEffect, useState } from "react";
import silver from "../../tests/fixtures/silver-quill-browser.json";
import heldout from "../../tests/fixtures/cipher-layer-heldout.json";
import {
  CIPHER_2_STANDIN, emptyCorrections, approveCorrection, resetCorrections, exportCorrections,
  groundingSystem, resolveTurn, contextReport, classifyTurn,
} from "../../lib/cipher-layer.js";

const KEY = "cipher-layer-corrections-v1";
const scopeHotel = heldout.scopeHotel;

function openEngine() {
  return new Promise((resolve, reject) => {
    const worker = new Worker("/lab/cipher-layer-worker.js");
    let seq = 0;
    const pending = new Map();
    worker.onerror = (event) => reject(new Error(event.message || "worker failed"));
    worker.onmessage = (event) => {
      const message = event.data;
      if (message.type === "token") return;
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      if (message.type === "error") waiter.reject(new Error(message.msg));
      else waiter.resolve(message);
    };
    const call = (message) => new Promise((resolveCall, rejectCall) => {
      const id = message.id || ++seq;
      pending.set(id, { resolve: resolveCall, reject: rejectCall });
      worker.postMessage({ ...message, id });
    });
    call({ type: "load", url: "/cipher/models/sft.ctern", size: CIPHER_2_STANDIN.bytes, ctx: 1024, temp: 0.3, topP: 0.9, rep: 1.15, seed: 1 })
      .then(() => resolve({
        worker,
        tokenize: (text) => call({ type: "tokenize", text }),
        reset: () => call({ type: "reset" }),
        reseed: () => call({ type: "reseed", seed: 1, temp: 0.3, topP: 0.9, rep: 1.15 }),
        system: (text) => call({ type: "system", text }),
        generate: (text) => call({ type: "generate", text, maxNew: 64 }),
        fetches: () => call({ type: "fetches" }),
        stop: () => worker.postMessage({ type: "stop" }),
      }))
      .catch(reject);
  });
}

export async function getServerSideProps() {
  if (process.env.VERCEL_ENV === "production" || process.env.CIPHER_LAYER_LAB !== "1") return { notFound: true };
  return { props: {} };
}

export default function CipherLayerLab() {
  const [hotel, setHotel] = useState(silver);
  const [file, setFile] = useState(() => emptyCorrections(silver.id));
  const [question, setQuestion] = useState(heldout.items[0].question);
  const [raw, setRaw] = useState("");
  const [status, setStatus] = useState("No model text yet.");
  const [topic, setTopic] = useState("network");
  const [correction, setCorrection] = useState("");
  const [busy, setBusy] = useState(false);
  const [context, setContext] = useState(null);
  const [rows, setRows] = useState([]);
  const [network, setNetwork] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    if (!saved) return;
    try { setFile(JSON.parse(saved)); } catch { /* keep the empty vetted file */ }
  }, []);

  function save(next) {
    setFile(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  }

  function chooseHotel(next) {
    setHotel(next);
    setFile((current) => {
      const updated = { ...current, hotelId: next.id };
      localStorage.setItem(KEY, JSON.stringify(updated));
      return updated;
    });
  }

  async function generate() {
    if (busy) return;
    setBusy(true);
    setStatus("Loading Cipher 2.0 (135M stand-in).");
    const pageFetches = [];
    const orig = window.fetch;
    window.fetch = async (...args) => {
      const url = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";
      pageFetches.push(String(url));
      return orig(...args);
    };
    try {
      const engine = await openEngine();
      await engine.reset();
      const system = groundingSystem(hotel, question, file);
      const systemTokens = await engine.tokenize(system);
      const questionTokens = await engine.tokenize(question);
      const systemCall = await engine.system(system);
      const done = await engine.generate(question);
      const produced = done.text || "";
      const report = contextReport({
        systemTokens: systemTokens.n,
        systemBegin: systemCall.nBegin,
        systemPast: systemCall.nPast,
        userBegin: done.stats.promptTokens,
        userPast: done.stats.nPastAfter,
      });
      const workerFetches = await engine.fetches();
      const result = resolveTurn({ hotel, question, raw: produced, corrections: file });
      setRaw(produced);
      setContext({ ...report, systemChars: system.length, questionTokens: questionTokens.n, stats: done.stats });
      setNetwork({ pageFetches, workerFetches: workerFetches.fetches, question });
      setStatus(result.resolution.label + " " + result.resolution.text);
      const questionSeen = [...pageFetches, ...workerFetches.fetches.map((row) => row.url)].some((line) => String(line).includes(question));
      window.__LAYER_RESULT = { ...result, generated: true, context: report, stats: done.stats, network: { pageFetches, workerFetches: workerFetches.fetches, questionSeen } };
      engine.stop();
      engine.worker.terminate();
    } catch (err) {
      setStatus("Cipher did not generate. " + (err && err.message ? err.message : String(err)));
    } finally {
      window.fetch = orig;
      setBusy(false);
    }
  }

  async function runFrozen() {
    if (busy) return;
    setBusy(true);
    setStatus("Running the frozen questions on the 135M stand-in.");
    try {
      const engine = await openEngine();
      const out = [];
      for (const item of heldout.items) {
        await engine.reset();
        await engine.reseed();
        const bare = item.id === "wifi-paraphrase" ? await engine.generate(item.question) : null;
        await engine.reset();
        await engine.reseed();
        const system = groundingSystem(silver, item.question, emptyCorrections(silver.id));
        const systemTokens = await engine.tokenize(system);
        const systemCall = await engine.system(system);
        const done = await engine.generate(item.question);
        const graded = classifyTurn({ hotel: silver, question: item.question, raw: done.text || "", corrections: emptyCorrections(silver.id), kind: item.kind });
        out.push({
          id: item.id, kind: item.kind, question: item.question,
          raw: done.text || "",
          bareRaw: bare ? bare.text || "" : null,
          source: graded.source, label: graded.label, resolutionText: graded.resolutionText,
          rawComplete: graded.rawComplete, countedAsFactualSuccess: graded.countedAsFactualSuccess,
          context: contextReport({
            systemTokens: systemTokens.n, systemBegin: systemCall.nBegin, systemPast: systemCall.nPast,
            userBegin: done.stats.promptTokens, userPast: done.stats.nPastAfter,
          }),
          stats: done.stats,
          bareStats: bare ? bare.stats : null,
        });
        setRows(out.slice());
      }
      window.__LAYER_ROWS = out;
      setStatus("Frozen run finished. A withheld row is not a correct answer.");
      engine.worker.terminate();
    } catch (err) {
      setStatus("The frozen run stopped. " + (err && err.message ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  }

  function addCorrection() {
    if (!topic.trim() || !correction.trim()) { setStatus("A vetted correction needs a topic and text."); return; }
    save(approveCorrection(file, { id: "c-" + Date.now(), hotelId: hotel.id, topic, text: correction }));
    setCorrection("");
  }

  function download() {
    const blob = new Blob([exportCorrections(file)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "cipher-corrections.json";
    a.click();
  }

  const view = raw ? resolveTurn({ hotel, question, raw, corrections: file }) : null;
  const visibleCorrections = file.corrections.filter((item) => item.hotelId === hotel.id);
  const questionInRequests = network ? [...network.pageFetches, ...network.workerFetches.map((row) => row.url + " " + (row.bodyChars || ""))].some((line) => line.includes(network.question)) : null;

  return (
    <>
      <Head><title>Cipher correction layer</title><meta name="robots" content="noindex" /></Head>
      <main style={page}>
        <h1 style={title}>Cipher correction layer</h1>
        <p style={box}>{CIPHER_2_STANDIN.displayName}. File {CIPHER_2_STANDIN.file}, {CIPHER_2_STANDIN.bytes} bytes, sha256 {CIPHER_2_STANDIN.sha256}. {CIPHER_2_STANDIN.provenance}</p>
        <p role="status" style={box}>{status}</p>
        <button type="button" style={hotel.id === silver.id ? btn : secondary} onClick={() => chooseHotel(silver)}>Hotel {silver.name}</button>
        <button type="button" style={hotel.id === scopeHotel.id ? btn : secondary} onClick={() => chooseHotel(scopeHotel)}>Hotel {scopeHotel.name}</button>
        <label style={label}>Question<textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} style={field} /></label>
        <button type="button" style={btn} onClick={generate} disabled={busy}>Generate with Cipher</button>
        <button type="button" style={btn} onClick={runFrozen} disabled={busy}>Run the frozen questions</button>
        {context ? (
          <section style={card}>
            <h2>Context the runtime reported</h2>
            <p style={rawBox}>System tokenize {context.systemTokens}. System begin added {context.systemBegin} and left nPast at {context.systemPast}. Question tokenize {context.questionTokens}. Question begin added {context.userBegin} and left nPast at {context.userPast}. System tokens still in context: {context.systemRemains ? "yes" : "no"}.</p>
            <p>{context.note}</p>
          </section>
        ) : null}
        {network ? <p style={box}>Question text inside a logged page or worker request: {questionInRequests ? "yes" : "no"}. Worker requests logged: {network.workerFetches.length}. This is the worker fetch list and the page fetch list, not a packet capture.</p> : null}
        <label style={label}>Raw model text<textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={4} style={field} /></label>
        {view ? (
          <section style={card}>
            <h2>Raw model</h2>
            <p style={rawBox}>{view.raw || "No raw text."}</p>
            <h2>{view.resolution.label}</h2>
            <p style={rawBox}>{view.resolution.text}</p>
          </section>
        ) : null}
        {rows.map((row) => (
          <section key={row.id} style={card}>
            <h2>{row.id}</h2>
            <p>{row.question}</p>
            <p>Layer source: {row.source}. Raw text contains the required fact: {row.rawComplete === null ? "not a fact score" : row.rawComplete ? "yes" : "no"}. Counted as a factual success: {row.countedAsFactualSuccess ? "yes" : "no"}.</p>
            <p style={rawBox}>With the hotel context: {row.raw}</p>
            {row.bareRaw != null ? <p style={rawBox}>Question only, no hotel context: {row.bareRaw}</p> : null}
            <p style={rawBox}>{row.label} {row.resolutionText}</p>
            <p>nPast before the question {row.stats.nPastBefore}, after {row.stats.nPastAfter}. Question tokens added {row.stats.promptTokens}. Generate {Math.round(row.stats.totalMs)} ms.</p>
          </section>
        ))}
        <h2>Approved corrections for {hotel.id}</h2>
        <p>Guest sentences are not saved as truth. A correction stays on the hotel it was saved for.</p>
        <label style={label}>Topic word<input value={topic} onChange={(e) => setTopic(e.target.value)} style={field} /></label>
        <label style={label}>Correction<textarea value={correction} onChange={(e) => setCorrection(e.target.value)} rows={3} style={field} /></label>
        <button type="button" style={btn} onClick={addCorrection}>Save vetted correction</button>
        <button type="button" style={secondary} onClick={() => save(resetCorrections(file))}>Reset corrections</button>
        <button type="button" style={secondary} onClick={download}>Export corrections</button>
        {visibleCorrections.map((item) => <p key={item.id}>{item.topic}: {item.text}</p>)}
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

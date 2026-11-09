import Head from "next/head";
import { useEffect, useRef, useState } from "react";
import silver from "../../tests/fixtures/silver-quill-browser.json";
import harbor from "../../tests/fixtures/harbor-lantern.json";
import heldout from "../../tests/fixtures/cipher-layer-heldout.json";
import cedar from "../../tests/fixtures/cedar-blank.json";
import factsHeldout from "../../tests/fixtures/cipher-facts-heldout-e.json";
import {
  CIPHER_2_STANDIN, emptyCorrections, approveCorrection, resetCorrections, exportCorrections,
  groundingSystem, resolveTurn, contextReport, gradeFactAnswer,
} from "../../lib/cipher-layer.js";

const KEY = "cipher-layer-corrections-v1";
const FOUR = factsHeldout.realGenerationIds.map((id) => factsHeldout.items.find((item) => item.id === id)).filter(Boolean);
const HOTELS = { [silver.id]: silver, [harbor.id]: harbor, [cedar.id]: cedar, [heldout.scopeHotel.id]: heldout.scopeHotel };
const LOAD_LIMIT_MS = 120000;
const STALL_MS = 45000;
const QUESTION_LIMIT_MS = 60000;

function plainResult(source) {
  if (source === "approved-facts") return "Complete answer.";
  if (source === "partial") return "Partial answer. Part of this question is not in the hotel file.";
  if (source === "withheld") return "Not answered from the hotel file.";
  if (source === "safety") return "Safety message. Not the model.";
  return "The model ran. This is not an approved hotel fact.";
}

function openEngine(onProgress) {
  const worker = new Worker("/lab/cipher-layer-worker.js");
  const promise = new Promise((resolve, reject) => {
    let seq = 0;
    const pending = new Map();
    let failed = false;
    const fail = (error) => {
      if (failed) return;
      failed = true;
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    worker.onerror = (event) => fail(new Error(event.message || "The model program failed."));
    worker.onmessage = (event) => {
      const message = event.data;
      if (message.type === "progress" || message.type === "token") {
        if (onProgress) onProgress(message);
        return;
      }
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      if (message.type === "error") waiter.reject(new Error(message.msg));
      else waiter.resolve(message);
    };
    const call = (message, ms, label) => new Promise((resolveCall, rejectCall) => {
      const id = ++seq;
      const timer = setTimeout(() => {
        pending.delete(id);
        rejectCall(new Error(label + " took longer than " + Math.round(ms / 1000) + " seconds."));
      }, ms);
      pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolveCall(value); },
        reject: (error) => { clearTimeout(timer); rejectCall(error); },
      });
      worker.postMessage({ ...message, id });
    });
    call({ type: "load", url: "/cipher/models/sft.ctern", size: CIPHER_2_STANDIN.bytes, ctx: 1024, temp: 0.3, topP: 0.9, rep: 1.15, seed: 1 }, LOAD_LIMIT_MS, "Loading the model").then(() => resolve({
        worker,
        reset: () => call({ type: "reset" }, 15000, "Reset"),
        reseed: () => call({ type: "reseed", seed: 1, temp: 0.3, topP: 0.9, rep: 1.15 }, 15000, "Reset"),
        tokenize: (text) => call({ type: "tokenize", text }, 15000, "Reading the prompt"),
        system: (text) => call({ type: "system", text }, 20000, "Sending the hotel facts"),
        generate: (text) => call({ type: "generate", text, maxNew: 64 }, QUESTION_LIMIT_MS, "The model answer"),
        fetches: () => call({ type: "fetches" }, 10000, "Reading the request list"),
        stop: () => worker.postMessage({ type: "stop" }),
      }), fail);
  });
  promise.worker = worker;
  return promise;
}

export async function getServerSideProps() {
  if (process.env.VERCEL_ENV === "production" || process.env.CIPHER_LAYER_LAB !== "1") return { notFound: true };
  return { props: {} };
}

export default function CipherLayerLab() {
  const [hotel, setHotel] = useState(silver);
  const [file, setFile] = useState(() => emptyCorrections(silver.id));
  const [status, setStatus] = useState("Not started.");
  const [phase, setPhase] = useState("not-started");
  const [rows, setRows] = useState([]);
  const [extraQuestion, setExtraQuestion] = useState("");
  const [extra, setExtra] = useState(null);
  const [topic, setTopic] = useState("network");
  const [correction, setCorrection] = useState("");
  const [diagnostics, setDiagnostics] = useState(null);
  const busyRef = useRef(false);
  const statusLog = useRef(["Not started."]);

  useEffect(() => {
    document.documentElement.style.background = "#000";
    document.body.style.background = "#000";
    document.body.style.color = "#fff";
    document.body.style.margin = "0";
    document.body.style.overflowX = "hidden";
    const saved = localStorage.getItem(KEY);
    if (!saved) return;
    try { setFile(JSON.parse(saved)); } catch { /* keep the empty vetted file */ }
  }, []);

  function say(text, nextPhase) {
    if (statusLog.current[statusLog.current.length - 1] !== text) {
      statusLog.current = statusLog.current.concat(text);
      window.__STATUS_LOG = statusLog.current;
      setStatus(text);
    }
    if (nextPhase) setPhase(nextPhase);
  }

  function save(next) {
    setFile(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  }

  async function loadEngine() {
    if (window.__CIPHER_FORCE_ERROR) throw new Error("The test was stopped on purpose.");
    let lastBeat = Date.now();
    let rejectStall = () => {};
    const stallPromise = new Promise((_, reject) => { rejectStall = reject; });
    const stallTimer = setInterval(() => {
      if (Date.now() - lastBeat > STALL_MS) rejectStall(new Error("Loading stalled. No new progress for 45 seconds."));
    }, 1000);
    const pending = openEngine((message) => {
      lastBeat = Date.now();
      if (message.type === "progress" && message.phase === "program") say("Loading the program that runs the model.", "loading");
      if (message.type === "progress" && message.phase === "model") {
        const got = Math.round((message.got || 0) / 1048576);
        const total = Math.round((message.size || 0) / 1048576);
        say("Loading the model. " + got + " of " + total + " megabytes.", "loading");
      }
    });
    try {
      return await Promise.race([pending, stallPromise]);
    } catch (err) {
      if (pending.worker) pending.worker.terminate();
      throw err;
    } finally {
      rejectStall = () => {};
      clearInterval(stallTimer);
    }
  }

  async function askModel(engine, itemHotel, question, corrections) {
    await engine.reset();
    await engine.reseed();
    const system = groundingSystem(itemHotel, question, corrections);
    const systemTokens = await engine.tokenize(system);
    const systemCall = await engine.system(system);
    const done = await engine.generate(question);
    const raw = done.text || "";
    const resolution = resolveTurn({ hotel: itemHotel, question, raw, corrections });
    return {
      question,
      raw,
      answer: resolution.resolution.text,
      source: resolution.resolution.source,
      label: plainResult(resolution.resolution.source),
      context: contextReport({
        systemTokens: systemTokens.n,
        systemBegin: systemCall.nBegin,
        systemPast: systemCall.nPast,
        userBegin: done.stats.promptTokens,
        userPast: done.stats.nPastAfter,
      }),
      stats: done.stats,
      ran: true,
    };
  }

  async function start() {
    if (busyRef.current) return;
    busyRef.current = true;
    setRows([]);
    setExtra(null);
    say("Loading the model. Waiting for the first bytes.", "loading");
    let engine = null;
    const finished = [];
    try {
      engine = await loadEngine();
      for (let i = 0; i < FOUR.length; i += 1) {
        const item = FOUR[i];
        say("Running question " + (i + 1) + " of " + FOUR.length + ". " + item.question, "running");
        if (window.__CIPHER_FAIL_ON === i + 1) throw new Error("Stopped on purpose during question " + (i + 1) + ".");
        const itemHotel = HOTELS[item.hotel];
        const row = await askModel(engine, itemHotel, item.question, emptyCorrections(itemHotel.id));
        const graded = gradeFactAnswer({ hotel: itemHotel, question: item.question, raw: row.raw, corrections: emptyCorrections(itemHotel.id), expect: item });
        finished.push({ ...row, grade: graded.bucket, number: i + 1 });
        setRows(finished.slice());
      }
      const fetches = await engine.fetches();
      setDiagnostics({ fetches: fetches.fetches, rows: finished });
      window.__FACT_ROWS = finished;
      say("Completed. All " + FOUR.length + " questions finished.", "completed");
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      say("Failed. " + message + " Finished questions are still listed below.", "failed");
      window.__FACT_ERROR = message;
      window.__FACT_ROWS = finished.slice();
    } finally {
      if (engine) {
        try { engine.stop(); engine.worker.terminate(); } catch { /* the worker is already gone */ }
      }
      busyRef.current = false;
    }
  }

  async function askOne() {
    if (busyRef.current) return;
    const question = extraQuestion.trim();
    if (!question) { say("Type a question first.", phase); return; }
    busyRef.current = true;
    setExtra(null);
    say("Loading the model for your question.", "loading");
    let engine = null;
    try {
      engine = await loadEngine();
      say("Running your question.", "running");
      const row = await askModel(engine, hotel, question, file);
      setExtra(row);
      window.__ONE_RESULT = row;
      say("Completed. Your question finished.", "completed");
    } catch (err) {
      say("Failed. " + (err && err.message ? err.message : String(err)), "failed");
    } finally {
      if (engine) {
        try { engine.stop(); engine.worker.terminate(); } catch { /* already stopped */ }
      }
      busyRef.current = false;
    }
  }

  const buttonLabel = phase === "failed" ? "Try again" : phase === "loading" || phase === "running" ? "Test is running" : phase === "completed" ? "Run the test again" : "Start the " + FOUR.length + "-question test";

  return (
    <>
      <Head><title>Hotel answer test</title><meta name="robots" content="noindex" /></Head>
      <style>{`
        html, body { background: #000; color: #fff; overflow-x: hidden; margin: 0; }
        .wisps { display: none; }
        button:focus, summary:focus, textarea:focus, input:focus, a:focus { outline: 4px solid #fff; outline-offset: 3px; }
        summary { font-size: 24px; font-weight: 700; padding: 16px 0; }
      `}</style>
      <main style={page}>
        <h1 style={title}>Hotel answer test</h1>
        <p id="purpose" style={purpose}>Press Start. Cipher answers {FOUR.length} hotel questions. Each result shows the approved answer, and Cipher&apos;s own words stay available underneath.</p>
        <p id="status" role="status" aria-live="assertive" aria-atomic="true" style={statusBox}>{status}</p>
        <button type="button" style={startBtn} aria-disabled={phase === "loading" || phase === "running"} onClick={start}>{buttonLabel}</button>
        <p style={note}>This test uses Silver Quill Inn and Harbor Lantern.</p>
        {rows.map((row) => (
          <section key={row.number} style={card}>
            <h2 style={questionTitle}>Question {row.number} of {FOUR.length}. Cipher finished this question.</h2>
            <p>{row.question}</p>
            <p style={grade}>{row.label}</p>
            <h3 style={answerHead}>{row.source === "withheld" || row.source === "safety" ? "What you should use" : "Approved answer"}</h3>
            <p style={answer}>{row.answer}</p>
            <details>
              <summary>Cipher&apos;s own words</summary>
              <p style={rawBox}>{row.raw || "Cipher returned no words."}</p>
            </details>
          </section>
        ))}
        <h2 style={questionTitle}>Ask one more question</h2>
        <label style={label}>Your question
          <textarea value={extraQuestion} onChange={(event) => setExtraQuestion(event.target.value)} rows={3} style={field} />
        </label>
        <button type="button" style={secondBtn} onClick={askOne}>Ask this question</button>
        {extra ? (
          <section style={card}>
            <p style={grade}>{extra.label} Cipher finished this question.</p>
            <h3 style={answerHead}>{extra.source === "withheld" || extra.source === "safety" ? "What you should use" : "Approved answer"}</h3>
            <p style={answer}>{extra.answer}</p>
            <details>
              <summary>Cipher&apos;s own words</summary>
              <p style={rawBox}>{extra.raw || "Cipher returned no words."}</p>
            </details>
          </section>
        ) : null}
        <details>
          <summary>More controls</summary>
          <p>Hotel for the extra question: {hotel.name}.</p>
          <button type="button" style={secondBtn} onClick={() => setHotel(silver)}>Use Silver Quill Inn</button>
          <button type="button" style={secondBtn} onClick={() => setHotel(harbor)}>Use Harbor Lantern</button>
          <button type="button" style={secondBtn} onClick={() => setHotel(heldout.scopeHotel)}>Use Scope Other Inn</button>
          <h2 style={questionTitle}>Saved corrections for {hotel.name}</h2>
          <p>A correction is typed here. A guest sentence is not saved as a fact.</p>
          <label style={label}>Topic word<input value={topic} onChange={(event) => setTopic(event.target.value)} style={field} /></label>
          <label style={label}>Correction<textarea value={correction} onChange={(event) => setCorrection(event.target.value)} rows={3} style={field} /></label>
          <button type="button" style={secondBtn} onClick={() => {
            if (!topic.trim() || !correction.trim()) { say("A correction needs a topic and text.", phase); return; }
            save(approveCorrection(file, { id: "c-" + Date.now(), hotelId: hotel.id, topic, text: correction }));
            setCorrection("");
            say("Saved the correction on this browser.", phase);
          }}>Save correction</button>
          <button type="button" style={secondBtn} onClick={() => { save(resetCorrections({ ...file, hotelId: hotel.id })); say("Corrections reset.", phase); }}>Reset corrections</button>
          <button type="button" style={secondBtn} onClick={() => {
            const blob = new Blob([exportCorrections(file)], { type: "application/json" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = "cipher-corrections.json";
            link.click();
          }}>Export corrections</button>
          {file.corrections.filter((item) => item.hotelId === hotel.id).map((item) => <p key={item.id}>{item.topic}: {item.text}</p>)}
          <h2 style={questionTitle}>Model file</h2>
          <p style={rawBox}>{CIPHER_2_STANDIN.displayName}. {CIPHER_2_STANDIN.file}. {CIPHER_2_STANDIN.bytes} bytes. sha256 {CIPHER_2_STANDIN.sha256}. {CIPHER_2_STANDIN.provenance}</p>
          {diagnostics ? <p style={rawBox}>Requests during the last four-question test: {diagnostics.fetches.map((item) => item.url).join(", ") || "none"}.</p> : null}
          {rows[0] && rows[0].context ? <p style={rawBox}>Last context length after the hotel prompt: {rows[0].context.systemPast}. After the question: {rows[0].context.userPast}.</p> : null}
        </details>
      </main>
    </>
  );
}

const page = { background: "#000", color: "#fff", minHeight: "100vh", padding: 16, fontFamily: "Arial, Helvetica, sans-serif", fontSize: 22, lineHeight: 1.45, overflowX: "hidden", boxSizing: "border-box" };
const title = { fontSize: 36, lineHeight: 1.2, margin: "8px 0" };
const purpose = { fontSize: 22, margin: "8px 0 12px" };
const statusBox = { position: "sticky", top: 0, zIndex: 5, background: "#000", color: "#fff", border: "4px solid #ffe14a", fontSize: 28, fontWeight: 700, lineHeight: 1.3, padding: 16, margin: "12px 0" };
const startBtn = { display: "block", width: "100%", boxSizing: "border-box", background: "#ffe14a", color: "#000", fontSize: 28, fontWeight: 700, lineHeight: 1.25, padding: "22px 16px", border: "4px solid #fff", margin: "12px 0", textAlign: "left" };
const secondBtn = { display: "block", width: "100%", boxSizing: "border-box", background: "#000", color: "#ffe14a", fontSize: 22, fontWeight: 700, lineHeight: 1.3, padding: "18px 16px", border: "4px solid #fff", margin: "12px 0", textAlign: "left" };
const note = { fontSize: 20 };
const card = { borderTop: "4px solid #fff", marginTop: 20, paddingTop: 8 };
const questionTitle = { fontSize: 26, lineHeight: 1.3 };
const grade = { fontSize: 24, fontWeight: 700 };
const answerHead = { fontSize: 24, marginBottom: 4 };
const answer = { fontSize: 24, whiteSpace: "pre-wrap", overflowWrap: "anywhere" };
const label = { display: "block", marginTop: 12 };
const field = { display: "block", width: "100%", boxSizing: "border-box", marginTop: 8, background: "#111", color: "#fff", fontSize: 22, padding: 12, border: "2px solid #fff" };
const rawBox = { whiteSpace: "pre-wrap", overflowWrap: "anywhere" };

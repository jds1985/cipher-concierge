import Head from "next/head";
import { useEffect, useRef, useState } from "react";
import silver from "../../tests/fixtures/silver-quill-browser.json";
import {
  SMOL_RUNTIME, planSmolSet, bareReadyPlan, hotelReadyPlan, freshCompoundPlan, paraphrasePlans,
  runSmolOnEngine, safetyPanel, privacyClaim, smolLabEnabled, createEngineSlot, pinnedModelRecord,
} from "../../lib/smol-lab.js";

export async function getServerSideProps() {
  if (!smolLabEnabled()) return { notFound: true };
  return {
    props: {
      six: planSmolSet(silver),
      readyBare: bareReadyPlan(),
      readyHotel: hotelReadyPlan(silver),
      compoundFresh: freshCompoundPlan(silver),
      paraphrases: paraphrasePlans(silver),
      runtime: SMOL_RUNTIME,
    },
  };
}

const ACTIONS = [
  { id: "ready-bare", label: "Ready, no hotel instructions" },
  { id: "ready-hotel", label: "Ready, with the hotel instructions" },
  { id: "compound-fresh", label: "Compound question only, after a waited reset" },
  { id: "six", label: "Six hotel questions" },
];

function bytesToB64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const strip = (value) => String(value || "").replaceAll("**", "");

export default function SmolLab({ six, readyBare, readyHotel, compoundFresh, paraphrases, runtime }) {
  const plans = { "ready-bare": [readyBare], "ready-hotel": [readyHotel], "compound-fresh": [compoundFresh], six };
  const [compat, setCompat] = useState(null);
  const [status, setStatus] = useState("Checking this browser.");
  const [progress, setProgress] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [runningId, setRunningId] = useState("");
  const [byId, setById] = useState({});
  const [entries, setEntries] = useState([]);
  const slotRef = useRef(null);
  if (!slotRef.current) slotRef.current = createEngineSlot();
  const stopRef = useRef(false);
  const busyRef = useRef(false);
  const questionsRef = useRef([readyBare, readyHotel, compoundFresh, ...six, ...paraphrases].map((plan) => plan.q));
  const entriesRef = useRef([]);

  useEffect(() => {
    const note = (url, channel) => {
      const text = String(url || "");
      const leaked = questionsRef.current.some((q) => q.length > 12 && text.includes(q));
      entriesRef.current.push({ url: text.slice(0, 180), channel, leaked, at: Date.now() });
      setEntries(entriesRef.current.slice());
    };
    const origFetch = window.fetch;
    window.fetch = (input, init) => {
      note(typeof input === "string" ? input : input?.url, "fetch");
      return origFetch(input, init);
    };
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) { this.__smolUrl = url; return origOpen.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function (body) { note(this.__smolUrl, "xhr"); return origSend.apply(this, arguments); };
    const origAdd = Cache.prototype.add;
    Cache.prototype.add = function (request) {
      note(typeof request === "string" ? request : request?.url, "cache.add");
      return origAdd.apply(this, arguments);
    };
    (async () => {
      if (!navigator.gpu) {
        setCompat({ ok: false, reason: "This browser has no WebGPU. That limit is about this browser, not about Android phones." });
        setStatus("No WebGPU in this browser. Load will not download the model.");
        return;
      }
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        setCompat({ ok: false, reason: "This browser returned no WebGPU adapter. That limit is about this browser, not about Android phones." });
        setStatus("No WebGPU adapter. Load will not download the model.");
        return;
      }
      const f16 = adapter.features.has("shader-f16");
      setCompat({ ok: f16, f16, fallback: !!adapter.isFallbackAdapter });
      setStatus(f16 ? "This browser can load the model. Nothing has been downloaded." : "shader-f16 is missing. Load will not download the model. That does not mean Android lacks WebGPU.");
    })();
    return () => {
      window.fetch = origFetch;
      XMLHttpRequest.prototype.open = origOpen;
      XMLHttpRequest.prototype.send = origSend;
      Cache.prototype.add = origAdd;
    };
  }, []);

  async function retire(engine) {
    slotRef.current.invalidate();
    setLoaded(false);
    try { engine?.interruptGenerate?.(); await engine?.unload?.(); } catch { /* the object may already be disposed */ }
  }

  async function loadModel() {
    if (busyRef.current) return;
    stopRef.current = false;
    const slot = slotRef.current;
    const previous = slot.current();
    const token = slot.begin();
    if (previous) { try { await previous.unload?.(); } catch { /* replaced engine */ } }
    if (typeof window.__SMOL_CREATE_ENGINE === "function") {
      const engine = await window.__SMOL_CREATE_ENGINE();
      if (!slot.publish(token, engine)) { try { await engine?.unload?.(); } catch { /* stale load */ } return; }
      setCompat({ ok: true, f16: true, fallback: false });
      setLoaded(true);
      setStatus("Test engine loaded.");
      return;
    }
    if (!compat?.ok) {
      slot.invalidate();
      setStatus((compat?.reason || "This browser cannot run the model.") + " No download started.");
      return;
    }
    setLoading(true);
    setStatus("Downloading the runtime, then the weights. The request uses revision " + runtime.modelRevision + ", not the floating main branch.");
    const timer = setTimeout(() => { stopRef.current = true; retire(slot.current()); setStatus("Load timed out. The runtime was closed."); }, 180000);
    try {
      const res = await fetch(runtime.moduleUrl);
      if (!res.ok) throw new Error("runtime HTTP " + res.status);
      const buf = await res.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-384", buf);
      if (bytesToB64(digest) !== runtime.moduleSha384) throw new Error("runtime hash mismatch");
      const blob = new Blob([buf], { type: "text/javascript" });
      const url = URL.createObjectURL(blob);
      const webllm = await import(/* webpackIgnore: true */ url);
      URL.revokeObjectURL(url);
      if (stopRef.current || token !== slot.token()) return;
      const engine = await webllm.CreateMLCEngine(runtime.modelId, {
        initProgressCallback: (report) => setProgress(report.text || ""),
        appConfig: { model_list: [pinnedModelRecord(runtime)] },
      }, { context_window_size: runtime.contextWindow });
      if (!slot.publish(token, engine)) { try { await engine.unload?.(); } catch { /* a newer load won */ } return; }
      setLoaded(true);
      setStatus("Model loaded. The yellow button is the next test that has not run.");
    } catch (err) {
      if (slot.token() === token) slot.invalidate();
      setLoaded(false);
      setStatus("Load failed. " + (err && err.message ? err.message : String(err)));
    } finally {
      clearTimeout(timer);
      setLoading(false);
      setProgress("");
    }
  }

  async function cancelLoad() {
    stopRef.current = true;
    const engine = slotRef.current.current();
    await retire(engine);
    setLoading(false);
    setStatus("Stopped. The model is unloaded.");
  }

  function stopRun() {
    stopRef.current = true;
    try { slotRef.current.current()?.interruptGenerate?.(); } catch { /* the run still records what it has */ }
    setStatus("Stop requested. The model stays loaded.");
  }

  async function runId(id) {
    const list = plans[id] || paraphrases.filter((plan) => plan.id === id);
    if (!list.length) { setStatus("That button has no question."); return; }
    const slot = slotRef.current;
    const token = slot.token();
    if (!slot.isCurrent(token)) { setStatus("Load the model first. No request was sent."); return; }
    if (busyRef.current) return;
    busyRef.current = true;
    const label = ACTIONS.find((item) => item.id === id)?.label || list[0].q;
    setBusy(true);
    setRunningId(id);
    stopRef.current = false;
    setStatus("Running " + label + ". This button always sends that test.");
    try {
      const result = await runSmolOnEngine(slot.current(), list, runtime, {
        liveEngine: true,
        hotel: silver,
        shouldStop: () => stopRef.current,
        isCurrent: () => slot.isCurrent(token),
        onRuntimeFailure: () => { slot.invalidate(); setLoaded(false); },
      });
      setById((prev) => ({ ...prev, [id]: [...(prev[id] || []), ...result.rows.map((row) => ({ ...row, buttonId: id }))] }));
      const failed = result.rows.find((row) => row.runtimeFailed);
      setStatus(failed
        ? "Runtime failure. This is not a model answer. " + failed.error + " Load the model again before another question."
        : label + " finished. Its result is under that button. Generated text is not a correct-answer score.");
    } finally {
      busyRef.current = false;
      setBusy(false);
      setRunningId("");
    }
  }

  function savedRows() {
    const ids = [...ACTIONS.map((item) => item.id), ...paraphrases.map((plan) => plan.id)];
    return ids.flatMap((id) => byId[id] || []);
  }

  function exportLog() {
    const payload = {
      runtime,
      compat,
      privacyClaim: privacyClaim({ entries }),
      privacyNote: "Unverified unless a later capture covers every network path. cache.add and fetch are logged here. That is not a complete capture.",
      network: entries,
      results: savedRows().map((row) => ({ ...row, safety: safetyPanel(row) })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "smollm-retest.json";
    a.click();
  }

  const nextId = ACTIONS.find((item) => !(byId[item.id] || []).length)?.id || "";
  const claim = privacyClaim({ entries });

  return (
    <>
      <Head><title>SmolLM phone test</title><meta name="robots" content="noindex" /></Head>
      <main style={page}>
        <h1 style={title}>SmolLM phone test</h1>
        <p role="status" style={statusBox}>{status} {progress}</p>
        <p style={note}>Privacy: {claim}. Logged requests are not every network path. A missing question in this log is not proof the question stayed on the phone.</p>
        {!loaded && !loading ? <button type="button" style={btn} onClick={loadModel}>Load the model</button> : null}
        {loading ? <button type="button" style={btn} onClick={cancelLoad}>Cancel the load</button> : null}
        {busy ? <button type="button" style={stopBtn} onClick={stopRun}>Stop this run</button> : null}
        {loaded ? <p style={hint}>The yellow button is the next test that has not run. Its words do not change. A result stays under the button that created it. Load is about 220 MB. Context {runtime.contextWindow}. Temperature {runtime.temperature}. Repetition penalty is not sent.</p> : <p style={hint}>Load downloads about 220 MB only after you press the button, and only when shader-f16 is available.</p>}
        {ACTIONS.filter((item) => loaded || (byId[item.id] || []).length).map((item) => (
          <Action key={item.id} id={item.id} label={item.label} runs={byId[item.id] || []} yellow={loaded && item.id === nextId} busy={busy || !loaded} running={runningId === item.id} onRun={runId} />
        ))}
        {loaded ? paraphrases.map((plan) => (
          <Action key={plan.id} id={plan.id} label={plan.q} runs={byId[plan.id] || []} yellow={false} busy={busy} running={runningId === plan.id} onRun={runId} />
        )) : null}
        {loaded || Object.keys(byId).length ? <button type="button" style={secondary} onClick={exportLog}>Export the log</button> : null}
      </main>
    </>
  );
}

function Action({ id, label, runs, yellow, busy, running, onRun }) {
  return (
    <section data-test={id} style={slot}>
      <button type="button" data-run={id} style={yellow && !busy ? btn : secondary} onClick={() => onRun(id)}>{running ? "Running. " : ""}{label}</button>
      {runs.length ? runs.map((row, index) => <Result key={row.id + "-" + index} row={row} />) : <p data-empty={id}>Not run yet.</p>}
      {runs.length > 1 ? <p>{runs.length} runs kept for this button.</p> : null}
    </section>
  );
}

function Result({ row }) {
  const diagnosis = row.diagnosis || {};
  const safety = safetyPanel(row);
  return (
    <section style={card}>
      <h2 style={heading}>{row.buttonId || row.id}</h2>
      <p>Result id: {row.id}. Hotel system sent: {row.system ? "yes" : "no"}.</p>
      <p>Generated text: {diagnosis.generatedText ? "yes" : "no"}. Model invoked: {row.modelInvoked ? "yes" : "no"}. This is not a factual score.</p>
      {row.runtimeFailed ? <p>Runtime failure. This is not a model answer. {row.error}</p> : null}
      <p>Model text. The model did not call anyone or send a message.</p>
      <p style={raw}>{row.raw || "No text."}</p>
      <p>Stop reason: {row.finishReason || "not returned"}.</p>
      <p>Prompt tokens: {row.usage?.prompt_tokens ?? "not returned"}. New tokens: {row.usage?.completion_tokens ?? "not returned"}.</p>
      <p>Reset waited: {row.resetEvidence?.ok ? "yes" : "no"}. Reply took {row.clientMs} ms.</p>
      <p>Full-text guard: {diagnosis.fullGuard ? (diagnosis.fullGuard.ok ? "passed" : diagnosis.fullGuard.reason) : "not run"}.</p>
      <p>Two-sentence guard: {diagnosis.trimmedGuard ? (diagnosis.trimmedGuard.ok ? "passed" : diagnosis.trimmedGuard.reason) : "not run"}.</p>
      {diagnosis.trimChangedTheCheck ? <p>The two-sentence cut changed the guard result. The full model text is above.</p> : null}
      {diagnosis.numberBindings?.map((binding) => (
        <p key={binding.number}>Number {binding.number} appears in {binding.factLines.length ? binding.factLines.join(" ") : "no fact line"}. The guard allows a number that appears anywhere in the fact lines. It does not check which fact the number belongs to.</p>
      ))}
      {diagnosis.nineOneOneNote ? <p>{diagnosis.nineOneOneNote}</p> : null}
      {row.factsText ? <p>Router baseline: {strip(row.factsText)}</p> : null}
      {safety ? <p style={safetyBox}>{strip(safety.text)} This is the facts text. The model did not perform it.</p> : null}
      <details>
        <summary style={summary}>Messages sent</summary>
        <p style={raw}>{row.messages?.map((message) => message.role + "\n" + message.content).join("\n\n")}</p>
      </details>
    </section>
  );
}

const page = { background: "#000", color: "#fff", minHeight: "100vh", padding: 16, fontFamily: "Arial, Helvetica, sans-serif", fontSize: 22, lineHeight: 1.45, overflowX: "hidden", boxSizing: "border-box" };
const title = { fontSize: 32, lineHeight: 1.2, margin: "0 0 12px" };
const heading = { fontSize: 26, lineHeight: 1.25 };
const statusBox = { background: "#111", color: "#fff", border: "3px solid #fff", padding: 12 };
const note = { background: "#111", color: "#fff", border: "3px solid #9cf", padding: 12 };
const hint = { fontSize: 20 };
const btn = { display: "block", width: "100%", boxSizing: "border-box", background: "#ffe14a", color: "#000", fontSize: 26, fontWeight: 700, padding: "22px 16px", border: "4px solid #fff", margin: "16px 0", textAlign: "left" };
const secondary = { display: "block", width: "100%", boxSizing: "border-box", background: "#111", color: "#ffe14a", fontSize: 22, padding: "18px 16px", border: "3px solid #ffe14a", margin: "10px 0", textAlign: "left" };
const stopBtn = { display: "block", width: "100%", boxSizing: "border-box", background: "#fff", color: "#000", fontSize: 26, fontWeight: 700, padding: "22px 16px", border: "4px solid #f66", margin: "16px 0", textAlign: "left" };
const slot = { marginTop: 8 };
const card = { borderTop: "3px solid #fff", marginTop: 8, paddingTop: 8, overflowWrap: "anywhere" };
const raw = { whiteSpace: "pre-wrap", overflowWrap: "anywhere", background: "#111", padding: 12, border: "2px solid #fff" };
const safetyBox = { background: "#300", border: "3px solid #f66", padding: 12 };
const summary = { fontSize: 22, padding: "12px 0" };

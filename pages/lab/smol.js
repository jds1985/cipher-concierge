import Head from "next/head";
import { useEffect, useRef, useState } from "react";
import silver from "../../tests/fixtures/silver-quill-browser.json";
import { judgeGeneration } from "../../lib/factpack.js";
import {
  SMOL_RUNTIME, planSmol, planSmolSet, runSmolOnEngine, gradeSmolTrial, safetyPanel, privacyClaim, smolLabEnabled,
} from "../../lib/smol-lab.js";

export async function getServerSideProps() {
  if (!smolLabEnabled()) return { notFound: true };
  return { props: { plans: planSmolSet(silver), runtime: SMOL_RUNTIME } };
}

function bytesToB64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const blank = (plan) => ({ ...plan, modelCalled: false, modelInvoked: false, raw: null, guard: null, realGeneration: false, experimental: true });

export default function SmolLab({ plans, runtime }) {
  const [compat, setCompat] = useState(null);
  const [status, setStatus] = useState("Checking this browser.");
  const [progress, setProgress] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [claim, setClaim] = useState(privacyClaim({ realGeneration: false }));
  const [rows, setRows] = useState(() => plans.map(blank));
  const [net, setNet] = useState([]);
  const engineRef = useRef(null);
  const stopRef = useRef(false);
  const questionsRef = useRef(plans.map((p) => p.q));

  useEffect(() => {
    const hits = [];
    const note = (url, body) => {
      const text = typeof body === "string" ? body : "";
      const leaked = questionsRef.current.some((q) => q.length > 8 && (text.includes(q) || String(url).includes(q)));
      hits.push({ url: String(url).slice(0, 180), leaked, at: Date.now() });
      setNet(hits.slice());
      if (leaked) throw new Error("blocked prompt egress");
    };
    const origFetch = window.fetch;
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input?.url;
      note(url, init?.body);
      return origFetch(input, init);
    };
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) { this.__smolUrl = url; return origOpen.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function (body) { note(this.__smolUrl, body); return origSend.apply(this, arguments); };
    (async () => {
      if (!navigator.gpu) {
        setCompat({ ok: false, reason: "This browser has no WebGPU. That is a limit of this browser, not a statement about Android phones." });
        setStatus("WebGPU is missing here. Load will not download the model.");
        return;
      }
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        setCompat({ ok: false, reason: "WebGPU is present but this browser returned no adapter. That is a limit of this browser, not a statement about Android phones." });
        setStatus("No WebGPU adapter in this browser. Load will not download the model.");
        return;
      }
      const f16 = adapter.features.has("shader-f16");
      setCompat({
        ok: f16,
        f16,
        fallback: !!adapter.isFallbackAdapter,
        reason: f16
          ? "shader-f16 is available. Load downloads the model."
          : "shader-f16 is missing in this browser. This model needs it. Load will not download anything. This does not mean Android lacks WebGPU.",
      });
      setStatus(f16 ? "Ready to load. Nothing has been downloaded." : "shader-f16 is missing. Nothing has been downloaded.");
    })();
    return () => {
      window.fetch = origFetch;
      XMLHttpRequest.prototype.open = origOpen;
      XMLHttpRequest.prototype.send = origSend;
    };
  }, [plans]);

  async function loadModel() {
    stopRef.current = false;
    if (!compat?.ok) {
      setStatus((compat?.reason || "This browser cannot run the model.") + " No download started.");
      setClaim(privacyClaim({ realGeneration: false }));
      return;
    }
    setStatus("Downloading the runtime, then the weights. Guest text stays in this page.");
    const timer = setTimeout(() => { stopRef.current = true; setStatus("Load timed out. Unloading."); engineRef.current?.unload?.(); }, 180000);
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
      if (stopRef.current) return;
      const engine = await webllm.CreateMLCEngine(runtime.modelId, {
        initProgressCallback: (report) => setProgress(report.text || ""),
      }, { context_window_size: runtime.contextWindow });
      engineRef.current = engine;
      setLoaded(true);
      setStatus("Model loaded. Every question below can now ask the model. The router line stays a baseline.");
    } catch (err) {
      setLoaded(false);
      setStatus("Load failed: " + (err && err.message ? err.message : String(err)));
    } finally {
      clearTimeout(timer);
    }
  }

  async function cancelLoad() {
    stopRef.current = true;
    const engine = engineRef.current;
    engineRef.current = null;
    setLoaded(false);
    try { engine?.interruptGenerate?.(); await engine?.unload?.(); } catch { /* unload is best-effort */ }
    setStatus("Stopped. The model is unloaded.");
    setProgress("");
  }

  async function runPlans(list) {
    const engine = engineRef.current;
    if (!engine) {
      setStatus("Load the model before asking it anything. No model request was sent.");
      return;
    }
    for (const plan of list) if (plan.q && !questionsRef.current.includes(plan.q)) questionsRef.current.push(plan.q);
    setStatus("Asking the model. A facts sentence is not the model reply.");
    const result = await runSmolOnEngine(engine, list, runtime, {
      realGeneration: true,
      shouldStop: () => stopRef.current,
      judge: (raw, plan) => judgeGeneration(raw, plan.facts, plan.q, silver),
    });
    setClaim(result.privacyClaim);
    setRows((prev) => {
      const next = [...prev];
      for (const row of result.rows) {
        const at = next.findIndex((item) => item.id === row.id);
        if (at >= 0) next[at] = row;
        else next.push(row);
      }
      return next;
    });
    setStatus("Model pass finished. A row is complete only where the model returned text.");
  }

  function runDraft() {
    const q = draft.trim();
    if (!q) { setStatus("Type a question first."); return; }
    runPlans([planSmol(silver, q, { id: "custom-" + Date.now() })]);
  }

  function exportLog() {
    const payload = {
      runtime,
      compat,
      status,
      privacyClaim: claim,
      realGenerationPerformed: claim === "inference",
      network: net,
      rows: rows.map((row) => ({ ...row, grade: gradeSmolTrial(row), safety: safetyPanel(row) })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "smollm-phone-lab.json";
    a.click();
  }

  return (
    <>
      <Head><title>SmolLM phone lab</title><meta name="robots" content="noindex" /></Head>
      <main style={page}>
        <h1 style={{ fontSize: 28, marginBottom: 8 }}>SmolLM2 phone lab</h1>
        <p style={lead}>Isolated page. The guest stay page is unchanged. After Load, any question is sent to the model with the same Silver Quill fixture. The facts router is shown beside that raw reply and is not counted as the model.</p>
        <p style={warn}>Load downloads the WebGPU library from unpkg and about 220 MB of weights from Hugging Face plus a wasm library from GitHub. Upstream lists {runtime.upstreamVramMB} MB of VRAM. That figure is not total phone memory. Nothing downloads until you press Load, and nothing downloads when shader-f16 is missing.</p>
        <p style={note}>Privacy label: {claim}. A refused Load is a blocked-preload capture. It is not an inference privacy proof. The runtime license is Apache-2.0, not MIT.</p>
        <dl style={meta}>
          <dt>Runtime</dt><dd>{runtime.runtime} {runtime.runtimeVersion} ({runtime.runtimeLicense})</dd>
          <dt>Model</dt><dd>{runtime.modelId}</dd>
          <dt>Revision</dt><dd>{runtime.modelRevision}</dd>
          <dt>Base</dt><dd>{runtime.baseModel} {runtime.baseRevision} ({runtime.baseLicense})</dd>
          <dt>Context</dt><dd>{runtime.contextWindow} tokens, temperature {runtime.temperature}, top_p {runtime.topP}, max tokens {runtime.maxTokens}</dd>
        </dl>
        <p role="status" style={statusBox}>{status} {progress}</p>
        <div style={rowBtns}>
          <button type="button" style={btn} onClick={loadModel}>Load model</button>
          <button type="button" style={btn} onClick={cancelLoad}>Cancel and unload</button>
          <button type="button" style={btn} disabled={!loaded} onClick={() => runPlans(plans)}>Run all presets on the model</button>
          <button type="button" style={btn} onClick={exportLog}>Export log</button>
        </div>
        <label style={{ display: "block", marginTop: 16 }}>
          One question
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} style={field} />
        </label>
        <div style={rowBtns}>
          <button type="button" style={btn} disabled={!loaded} onClick={runDraft}>Run one question</button>
          {plans.map((plan) => (
            <button type="button" key={plan.id} style={chip} onClick={() => setDraft(plan.q)}>{plan.id}</button>
          ))}
        </div>
        {rows.map((row) => {
          const grade = gradeSmolTrial(row);
          const safety = safetyPanel(row);
          return (
            <section key={row.id} style={card}>
              <h2 style={{ fontSize: 20 }}>{row.id}</h2>
              <p><strong>Question.</strong> {row.q}</p>
              <p><strong>Router baseline ({row.factsIntent || row.factsPath}).</strong> {(row.factsText || "The router would call a model. This lab still asks SmolLM with the full fixture.").replaceAll("**", "")}</p>
              <p><strong>Experimental raw model.</strong> {row.modelCalled ? row.raw : "Not run."}</p>
              <p><strong>Guard on the raw text.</strong> {row.guard ? (row.guard.ok ? "accepted" : row.guard.reason) : "Not run."}</p>
              {safety ? <p style={safetyBox}><strong>{safety.label}.</strong> {(safety.text || "").replaceAll("**", "")} This panel does not change when the model replies.</p> : null}
              <p><strong>Grade.</strong> model completion {String(grade.modelCompletion)}. Real generation {String(row.realGeneration === true)}. Invented noon {String(grade.inventedNoon)}. Emergency omission {String(grade.emergencyOmission)}. Invented price {String(grade.inventedPrice)}.</p>
              <button type="button" style={btn} disabled={!loaded} onClick={() => runPlans([row])}>Run this question on the model</button>
            </section>
          );
        })}
      </main>
    </>
  );
}

const page = { background: "#0b0b0b", color: "#f5f5f5", minHeight: "100vh", padding: 24, fontFamily: "Georgia, serif", fontSize: 18, lineHeight: 1.45 };
const lead = { maxWidth: 760 };
const warn = { background: "#1a1400", color: "#ffe08a", padding: 12, border: "2px solid #ffe08a" };
const note = { background: "#111", padding: 12, border: "2px solid #9ad" };
const meta = { display: "grid", gridTemplateColumns: "8rem 1fr", gap: 6 };
const statusBox = { background: "#111", border: "2px solid #f5f5f5", padding: 12 };
const rowBtns = { display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 };
const btn = { background: "#ffe08a", color: "#111", fontSize: 18, padding: "12px 16px", border: "3px solid #fff" };
const chip = { background: "#222", color: "#ffe08a", fontSize: 16, padding: "10px 12px", border: "2px solid #ffe08a" };
const field = { display: "block", width: "100%", marginTop: 8, background: "#111", color: "#f5f5f5", fontSize: 18, padding: 12, border: "2px solid #f5f5f5" };
const card = { borderTop: "2px solid #f5f5f5", marginTop: 18, paddingTop: 8 };
const safetyBox = { background: "#1a0000", border: "2px solid #f66", padding: 12 };

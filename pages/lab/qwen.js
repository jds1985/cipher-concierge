import Head from "next/head";
import { useEffect, useRef, useState } from "react";
import silver from "../../tests/fixtures/silver-quill-browser.json";
import { QWEN, pinnedGgufUrl, qwenLabEnabled, qwenTrials, gradeQwen } from "../../lib/qwen-lab.js";

export async function getServerSideProps() {
  if (!qwenLabEnabled()) return { notFound: true };
  return { props: { trials: qwenTrials(silver), pinnedUrl: pinnedGgufUrl() } };
}

const GROUPS = [
  { id: "ready-bare", label: "Ready, no hotel instructions" },
  { id: "ready-hotel", label: "Ready, with the hotel instructions" },
  { id: "six", label: "Six original hotel questions" },
  { id: "paraphrase", label: "Unseen paraphrases" },
];

export default function QwenLab({ trials, pinnedUrl }) {
  const [status, setStatus] = useState("Nothing has been downloaded.");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState("");
  const [runs, setRuns] = useState([]);
  const [template, setTemplate] = useState("");
  const blobRef = useRef(null);
  const engineRef = useRef(null);
  const busyRef = useRef(false);

  useEffect(() => {
    window.__QWEN_LOG = { runtime: QWEN, pinnedUrl, runs: [] };
  }, [pinnedUrl]);

  async function loadRuntime() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const local = await fetch(QWEN.localUrl, { method: "HEAD" });
      const localOk = local.ok && Number(local.headers.get("content-length")) === QWEN.modelBytes;
      const url = localOk ? QWEN.localUrl : pinnedUrl;
      setSource(url);
      setStatus("Downloading " + QWEN.modelBytes + " bytes from " + url + ".");
      console.log("qwen fetch", url);
      const res = await fetch(url);
      if (!res.ok) throw new Error("model HTTP " + res.status);
      const blob = await res.blob();
      console.log("qwen bytes", blob.size);
      if (blob.size !== QWEN.modelBytes) throw new Error("model bytes " + blob.size + ", expected " + QWEN.modelBytes);
      blobRef.current = blob;
      const mod = await import(/* webpackIgnore: true */ "/lab/wllama/index.js");
      const engine = new mod.Wllama({ default: QWEN.wasmUrl });
      engine.setCompat({ wasm: QWEN.compatWasmUrl, worker: QWEN.compatWorkerUrl });
      engineRef.current = engine;
      setLoaded(true);
      setStatus("Weights are in this page. No question has been sent. Each test loads a fresh context.");
    } catch (err) {
      setLoaded(false);
      setStatus("Load failed. " + (err && err.message ? err.message : String(err)));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function runGroup(group) {
    const engine = engineRef.current;
    const blob = blobRef.current;
    if (!engine || !blob) { setStatus("Load the weights first. No question was sent."); return; }
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const selected = trials.filter((trial) => trial.group === group);
    const done = [];
    try {
      for (const trial of selected) {
        setStatus("Loading a fresh context for " + trial.id + ".");
        const loadStarted = performance.now();
        if (engine.isModelLoaded()) await engine.exit();
        await engine.loadModel([blob], { n_gpu_layers: QWEN.nGpuLayers, n_ctx: QWEN.nCtx, n_threads: QWEN.nThreads });
        const loadMs = Math.round(performance.now() - loadStarted);
        const chatTemplate = typeof engine.chatTemplate === "string" ? engine.chatTemplate : "";
        setTemplate(chatTemplate);
        const messages = trial.system
          ? [{ role: "system", content: trial.system }, { role: "user", content: trial.q }]
          : [{ role: "user", content: trial.q }];
        setStatus("Generating " + trial.id + ".");
        const genStarted = performance.now();
        let response = null;
        let error = null;
        let raw = "";
        try {
          response = await engine.createChatCompletion({
            messages,
            temperature: QWEN.temperature,
            top_p: QWEN.topP,
            max_tokens: QWEN.maxTokens,
            seed: QWEN.seed,
          });
          raw = typeof response === "string" ? response : response?.choices?.[0]?.message?.content || "";
        } catch (err) {
          error = err && err.message ? err.message : String(err);
        }
        const row = {
          id: trial.id,
          group,
          kind: trial.kind,
          q: trial.q,
          hotelSystem: !!trial.system,
          system: trial.system || null,
          factsText: trial.factsText || null,
          messages,
          raw,
          modelInvoked: error == null,
          runtimeFailed: error != null,
          error,
          loadMs,
          genMs: Math.round(performance.now() - genStarted),
          finishReason: response?.choices?.[0]?.finish_reason || null,
          usage: response?.usage || null,
          chatTemplate,
          config: {
            n_gpu_layers: QWEN.nGpuLayers,
            n_ctx: QWEN.nCtx,
            n_threads: QWEN.nThreads,
            temperature: QWEN.temperature,
            top_p: QWEN.topP,
            max_tokens: QWEN.maxTokens,
            seed: QWEN.seed,
            freshContext: "exit-and-loadModel",
          },
        };
        row.grade = gradeQwen(row);
        done.push(row);
        setRuns((prev) => {
          const next = [...prev.filter((item) => item.id !== row.id), row];
          window.__QWEN_LOG = { runtime: QWEN, pinnedUrl, source, chatTemplate, runs: next };
          return next;
        });
      }
      setStatus("Finished " + group + ". Generated text is not a factual score.");
    } catch (err) {
      setStatus("Run failed. " + (err && err.message ? err.message : String(err)));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <Head><title>Qwen CPU lab</title><meta name="robots" content="noindex" /></Head>
      <main style={page}>
        <h1 style={title}>Qwen CPU lab</h1>
        <p role="status" style={box}>{status}</p>
        <p style={warn}>Load downloads {QWEN.modelBytes} bytes of Qwen2.5-0.5B-Instruct Q4_K_M. That is about 491 MB, larger than the earlier 204 MB SmolLM weights. Nothing downloads until you press Load. Runtime {QWEN.runtime} {QWEN.runtimeVersion} is MIT. The model license is Apache-2.0. GPU layers are 0. This is a different family, not a quality proof.</p>
        {!loaded ? <button type="button" style={btn} onClick={loadRuntime}>Load the weights</button> : null}
        {loaded && !busy ? GROUPS.map((group) => (
          <button type="button" key={group.id} data-run={group.id} style={btn} onClick={() => runGroup(group.id)}>{group.label}</button>
        )) : null}
        {source ? <p>Weight URL: {source}</p> : null}
        {template ? <p style={raw}>Chat template from the GGUF: {template.slice(0, 500)}</p> : null}
        {runs.map((row) => (
          <section key={row.id} data-result={row.id} style={card}>
            <h2 style={heading}>{row.id}</h2>
            <p>Generated text: {row.grade.generatedText ? "yes" : "no"}. Factual pass: {row.grade.factualPass == null ? "not scored" : String(row.grade.factualPass)}. These are separate.</p>
            <p>Model text. The model did not call anyone or perform an action.</p>
            <p style={raw}>{row.raw || row.error || "No text."}</p>
            <p>Load {row.loadMs} ms. Generate {row.genMs} ms. Stop: {row.finishReason || "not returned"}.</p>
            <p>Hotel system sent: {row.hotelSystem ? "yes" : "no"}.</p>
            {row.factsText ? <p>Router baseline: {String(row.factsText).replaceAll("**", "")}</p> : null}
            {row.grade.checks.filter((check) => check.id !== "generated-text").map((check) => (
              <p key={check.id}>{check.id}: {String(check.ok)}. {check.detail}</p>
            ))}
          </section>
        ))}
      </main>
    </>
  );
}

const page = { background: "#000", color: "#fff", minHeight: "100vh", padding: 16, fontFamily: "Arial, Helvetica, sans-serif", fontSize: 22, lineHeight: 1.45, overflowX: "hidden" };
const title = { fontSize: 32, margin: "0 0 12px" };
const heading = { fontSize: 26 };
const box = { background: "#111", border: "3px solid #fff", padding: 12 };
const warn = { background: "#1a1400", color: "#ffe08a", border: "3px solid #ffe08a", padding: 12 };
const btn = { display: "block", width: "100%", boxSizing: "border-box", background: "#ffe14a", color: "#000", fontSize: 24, fontWeight: 700, padding: "20px 16px", border: "4px solid #fff", margin: "12px 0", textAlign: "left" };
const card = { borderTop: "3px solid #fff", marginTop: 16, overflowWrap: "anywhere" };
const raw = { whiteSpace: "pre-wrap", overflowWrap: "anywhere", background: "#111", padding: 12 };

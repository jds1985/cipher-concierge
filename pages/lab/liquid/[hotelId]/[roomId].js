import Head from "next/head";
import crypto from "crypto";
import { useEffect, useRef, useState } from "react";
import { resolveHotel, publicHotel, validRoom, isFileHotel } from "../../../../lib/hotels";
import { verifyRoom } from "../../../../lib/token";
import { guestAccess } from "../../../../lib/billing";
import { PAUSED_MESSAGE } from "../../../../lib/pricing";
import { loadFactPack } from "../../../../lib/onphone";
import { labPlan, liquidPrompt, reviewLiquid, withholdText, mentionsDesk, liquidExperimentEnabled } from "../../../../lib/liquid-lab";
import RichText from "../../../../components/RichText";
import CallButton from "../../../../components/CallButton";

export async function getServerSideProps({ params, query, res }) {
  if (!liquidExperimentEnabled()) return { notFound: true };
  const hotel = await resolveHotel(params.hotelId);
  if (!hotel || !validRoom(params.roomId)) return { notFound: true };
  const ok = verifyRoom(hotel.id, params.roomId, query.t);
  if (!ok) res.statusCode = 403;
  const access = await guestAccess(hotel.id, { isFile: isFileHotel(hotel.id) });
  if (ok && !access.ok) {
    return { props: { hotel: publicHotel(hotel), roomId: params.roomId, t: null, paused: true, factVersion: "" } };
  }
  const factVersion = crypto.createHash("sha256").update(JSON.stringify(hotel)).digest("hex").slice(0, 12);
  return { props: { hotel: publicHotel(hotel), roomId: params.roomId, t: ok ? String(query.t) : null, paused: false, factVersion } };
}

const CHIPS = [
  "What's the wifi password?",
  "What time is checkout and what's the wifi?",
  "What are the quiet hours?",
  "Do you have a spa?",
  "I think I'm having a heart attack",
  "It's raining. What can we do inside this afternoon?",
  "What should I pack for a hike in the Smokies?",
  "Tell me a short clean joke.",
];

export default function LiquidLab({ hotel, roomId, t, paused, factVersion }) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [load, setLoad] = useState({ phase: "booting", text: "Starting the on-phone lab…", device: null, dtype: null });
  const [staffOn, setStaffOn] = useState(false);
  const [staffNote, setStaffNote] = useState("");
  const [staffType, setStaffType] = useState("towels");
  const [staffState, setStaffState] = useState({ msg: "", err: false });
  const [netSince, setNetSince] = useState(0);
  const pack = useRef(null);
  const log = useRef([]);
  const askedAt = useRef(0);

  function remember(entry) {
    log.current = [...log.current, entry];
    window.__liquidLab = {
      ...(window.__liquidLab || {}),
      transcript: log.current,
      busy,
      status: load,
      hotelId: hotel.id,
      roomId,
    };
  }

  useEffect(() => {
    window.__liquidLab = { transcript: [], busy: false, status: load, hotelId: hotel.id, roomId };
    if (!t) return undefined;
    pack.current = loadFactPack({ hotelId: hotel.id, roomId, t, version: factVersion }).then((r) => r.hotel);
    const onStatus = (ev) => setLoad(ev.detail);
    window.addEventListener("cipher-liquid-status", onStatus);
    const start = () => { if (window.cipherLiquid) window.cipherLiquid.boot(); };
    window.addEventListener("cipher-liquid-ready", start);
    const script = document.createElement("script");
    script.type = "module";
    script.src = "/lab/liquid-engine.mjs";
    script.dataset.testid = "liquid-engine";
    document.body.appendChild(script);
    if (window.cipherLiquid) start();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/lab/sw.js", { scope: "/lab/" }).then((reg) => {
        const warm = () => {
          const assets = performance.getEntriesByType("resource").map((r) => r.name).filter((n) => n.startsWith(location.origin + "/lab/") && !n.includes("/lab/models/"));
          reg.active?.postMessage({ type: "cache-lab", page: location.href, assets });
        };
        navigator.serviceWorker.ready.then(() => { if (reg.active) warm(); else navigator.serviceWorker.addEventListener("controllerchange", warm, { once: true }); }).catch(() => {});
      }).catch(() => {});
    }
    return () => window.removeEventListener("cipher-liquid-status", onStatus);
  }, [t, hotel.id, roomId, factVersion]);

  useEffect(() => {
    window.__liquidLab = { ...(window.__liquidLab || {}), transcript: log.current, busy, status: load, hotelId: hotel.id, roomId };
  }, [busy, load, hotel.id, roomId]);

  async function ask(text) {
    const q = text.trim();
    if (!q || busy) return;
    const before = performance.getEntriesByType("resource").length;
    askedAt.current = performance.now();
    setMsgs((m) => [...m, { role: "user", content: q }]);
    setInput("");
    setBusy(true);
    let H;
    try { H = await pack.current; }
    catch (e) {
      const entry = { q, source: "error", modelCalled: false, text: "The hotel file is not on this phone yet, so I did not send the question anywhere.", error: String(e) };
      remember(entry);
      setMsgs((m) => [...m, { role: "assistant", ...entry }]);
      setBusy(false);
      return;
    }
    const plan = labPlan(H, q, new Date());
    if (!plan.needsModel) {
      const entry = { q, source: plan.source, intent: plan.intent, kind: plan.kind, call: plan.call, modelCalled: false, text: plan.text, raw: null, ms: 0 };
      remember(entry);
      setMsgs((m) => [...m, { role: "assistant", ...entry }]);
      setNetSince(performance.getEntriesByType("resource").length - before);
      setBusy(false);
      return;
    }
    const engine = window.cipherLiquid;
    const ready = engine && engine.getState().phase === "ready";
    if (!ready) {
      const entry = { q, source: "waiting", modelCalled: false, kind: "fallback", call: false, text: "The on-phone model is not ready. This question stayed in this browser and was not sent to the hotel computer.", raw: null };
      remember(entry);
      setMsgs((m) => [...m, { role: "assistant", ...entry }]);
      setNetSince(performance.getEntriesByType("resource").length - before);
      setBusy(false);
      return;
    }
    try {
      const gen = await engine.generate({ system: liquidPrompt(H, plan.facts), user: plan.modelQuestion });
      const review = reviewLiquid(gen.raw, plan.facts, plan.modelQuestion, H.name);
      const body = review.ok ? review.text : withholdText();
      const text = [plan.preamble, body].filter(Boolean).join("\n\n");
      const entry = {
        q, source: review.ok ? "liquid" : "liquid-withheld", intent: plan.intent, kind: review.ok ? "liquid" : "fallback",
        call: false, modelCalled: true, text, raw: gen.raw, reviewReason: review.reason, ms: gen.ms,
        device: gen.device, dtype: gen.dtype, heap: gen.heap, deskReferral: mentionsDesk(text), modelQuestion: plan.modelQuestion,
      };
      remember(entry);
      setMsgs((m) => [...m, { role: "assistant", ...entry }]);
    } catch (e) {
      const message = String(e && e.message || e);
      const entry = { q, source: "error", modelCalled: false, kind: "fallback", call: false, text: "Generation failed on this device. The question was not sent anywhere. " + message.slice(0, 240), error: message, raw: null };
      remember(entry);
      setMsgs((m) => [...m, { role: "assistant", ...entry }]);
    }
    setNetSince(performance.getEntriesByType("resource").length - before);
    setBusy(false);
  }

  async function sendStaff(e) {
    e.preventDefault();
    if (!staffOn || !staffNote.trim()) return;
    setStaffState({ msg: "Sending the note you opted in…", err: false });
    try {
      const r = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId: hotel.id, roomId, t, type: staffType, note: staffNote.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setStaffState({ msg: j.error || "Could not send.", err: true }); return; }
      setStaffState({ msg: "Sent to hotel staff. The chat itself was not included.", err: false });
      setStaffNote("");
      setStaffOn(false);
    } catch {
      setStaffState({ msg: "Could not send.", err: true });
    }
  }

  if (paused) return (
    <main className="liquid-lab">
      <Head><title>Liquid lab paused</title></Head>
      <LabStyle />
      <h1>Welcome to {hotel.name}</h1>
      <p>{PAUSED_MESSAGE}</p>
    </main>
  );
  if (!t) return (
    <main className="liquid-lab">
      <Head><title>Scan your room QR code</title></Head>
      <LabStyle />
      <p className="banner">Isolated lab. The live stay page is unchanged.</p>
      <h1>Please scan the QR code in your room</h1>
      <p>This link is not valid for Room {roomId}. The model does not load until the room card checks out.</p>
    </main>
  );

  const phase = load.phase || "booting";
  return (
    <div className="liquid-lab">
      <Head><title>{`${hotel.name} · Room ${roomId} · Liquid lab`}</title></Head>
      <LabStyle />
      <p className="banner">Isolated lab. Disabled unless LIQUID_BROWSER_EXPERIMENT=1. The live guest page is not this screen.</p>
      <header>
        <div>
          <h1>{hotel.name}</h1>
          <p className="room">Room {roomId}</p>
        </div>
        <CallButton frontDesk={hotel.frontDesk} />
      </header>
      <section className="status" role="status" aria-live="polite" data-testid="liquid-status" data-phase={phase}>
        <p className="kicker" data-testid="runtime">{phase === "ready" ? (load.device === "webgpu" ? "WebGPU" : "WASM CPU") : phase}</p>
        <p className="status-text">{load.text}</p>
        <p>Guest questions stay in this browser. They are not sent to a hotel computer or a cloud model.</p>
        {load.device && <p>Runtime {load.device} · weights {load.dtype}{load.loadMs ? ` · load ${Math.round(load.loadMs / 1000)}s` : ""}</p>}
        <p data-testid="net-quiet">Resource entries since the last question: {netSince}</p>
      </section>
      <main className="msgs" aria-live="polite" aria-label="Conversation">
        {msgs.map((m, i) => (
          <article key={i} className={m.role === "user" ? "msg user" : `msg bot ${m.kind || ""}`} data-testid={m.role === "assistant" ? "answer" : "question"}>
            <span className="sr-only">{m.role === "user" ? "You said" : "Concierge"}</span>
            <RichText text={m.content || m.text} />
            {m.role === "assistant" && (
              <p className="badge">
                {m.modelCalled ? "Generated in this browser" : "Hotel file on this phone. The language model was not called."}
                {m.reviewReason ? ` · ${m.reviewReason}` : ""}
                {m.ms ? ` · ${m.ms} ms` : ""}
              </p>
            )}
            {m.call && <CallButton frontDesk={hotel.frontDesk} />}
          </article>
        ))}
        {busy && <p className="msg bot" role="status">Working on this phone…</p>}
      </main>
      <div className="chips" aria-label="Sample questions">
        {CHIPS.map((c) => <button key={c} type="button" onClick={() => ask(c)} disabled={busy}>{c}</button>)}
      </div>
      <form className="composer" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
        <label htmlFor="q">Your question</label>
        <input id="q" data-testid="composer" value={input} onChange={(e) => setInput(e.target.value)} maxLength={500} autoComplete="off" />
        <button type="submit" data-testid="send" disabled={busy || !input.trim()}>Send</button>
      </form>
      <form className="staff" onSubmit={sendStaff}>
        <h2>Ask staff</h2>
        <p>This is the only note that can leave the phone, and only after you opt in. Chat questions are not attached.</p>
        <label className="check"><input data-testid="staff-opt-in" type="checkbox" checked={staffOn} onChange={(e) => setStaffOn(e.target.checked)} /> I want to send this note to hotel staff</label>
        <label htmlFor="staff-type">What</label>
        <select id="staff-type" value={staffType} onChange={(e) => setStaffType(e.target.value)}>
          <option value="towels">Towels</option>
          <option value="housekeeping">Housekeeping</option>
          <option value="maintenance">Something broken</option>
        </select>
        <label htmlFor="staff-note">Note</label>
        <input id="staff-note" data-testid="staff-note" value={staffNote} onChange={(e) => setStaffNote(e.target.value)} maxLength={200} autoComplete="off" />
        <button type="submit" data-testid="staff-send" disabled={!staffOn || !staffNote.trim()}>Send note to staff</button>
        {staffState.msg && <p role="status" className={staffState.err ? "bad" : "ok"}>{staffState.msg}</p>}
      </form>
    </div>
  );
}

function LabStyle() {
  return (
    <style>{`
      .liquid-lab{min-height:100vh;background:#000;color:#fff;font:22px/1.45 Inter,system-ui,sans-serif;padding:20px 16px 40px;max-width:880px;margin:0 auto}
      .liquid-lab *{box-sizing:border-box}
      .liquid-lab h1{font:800 34px/1.15 "Plus Jakarta Sans",Inter,sans-serif;margin:0}
      .liquid-lab h2{font:800 28px/1.2 "Plus Jakarta Sans",Inter,sans-serif;margin:0 0 8px}
      .banner{background:#ffd000;color:#000;font-weight:800;padding:12px 14px;border-radius:12px}
      .liquid-lab header{display:flex;justify-content:space-between;gap:16px;align-items:center;margin:16px 0}
      .room{margin:4px 0 0;font-size:22px}
      .status{border:4px solid #ffd000;background:#000;padding:16px;border-radius:16px;margin-bottom:16px}
      .status[data-phase="ready"]{border-color:#b6ff4a}
      .status[data-phase="error"]{border-color:#ff5a5a}
      .kicker{font:800 40px/1 "Plus Jakarta Sans",Inter,sans-serif;margin:0 0 8px;color:#ffd000}
      .status[data-phase="ready"] .kicker{color:#b6ff4a}
      .status-text{font-size:26px;font-weight:700;margin:0 0 8px}
      .msgs{display:flex;flex-direction:column;gap:12px}
      .msg{border-radius:16px;padding:14px 16px;border:3px solid #fff;white-space:pre-wrap}
      .msg.user{background:#1a3a6b;margin-left:12%}
      .msg.bot{background:#111}
      .msg.emergency{background:#2a0000;border-color:#ff5a5a}
      .msg.liquid{border-color:#7ecbff}
      .badge{font-size:18px;color:#ffd000;margin:10px 0 0}
      .chips{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}
      .chips button,.composer button,.staff button,.liquid-lab .call-btn{min-height:64px;border-radius:14px;border:3px solid #fff;background:#fff;color:#000;font:800 18px/1.2 "Plus Jakarta Sans",Inter,sans-serif;padding:10px 14px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}
      .chips button:disabled,.composer button:disabled,.staff button:disabled{opacity:.45;cursor:not-allowed}
      .composer,.staff{display:flex;flex-direction:column;gap:8px;margin-top:12px}
      .staff{border:4px solid #fff;padding:14px;border-radius:16px}
      .liquid-lab label{font-weight:800}
      .liquid-lab input,.liquid-lab select{min-height:64px;border-radius:12px;border:3px solid #fff;background:#000;color:#fff;font:22px/1.3 Inter,sans-serif;padding:8px 12px;width:100%}
      .check{display:flex;gap:12px;align-items:center}
      .check input{width:32px;height:32px;min-height:32px}
      .ok{color:#b6ff4a;font-weight:800}
      .bad{color:#ff8d8d;font-weight:800}
      .liquid-lab :focus{outline:4px solid #ffd000;outline-offset:2px}
      .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0}
      @media (max-width:640px){.liquid-lab{padding:12px}.liquid-lab h1{font-size:30px}.kicker{font-size:34px}.msg.user{margin-left:0}}
    `}</style>
  );
}

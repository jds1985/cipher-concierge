import Head from "next/head";
import { useEffect, useRef, useState } from "react";
import { resolveHotel, publicHotel, validRoom } from "../../../lib/hotels";
import { verifyRoom } from "../../../lib/token";
import Mark from "../../../components/Mark";
import RichText from "../../../components/RichText";
import CallButton from "../../../components/CallButton";
import { Send, Lock } from "../../../components/Icons";
import { decideTurn, judgeGeneration, GEN } from "../../../lib/factpack";
import { unsupportedReason, loadCipher, loadFactPack } from "../../../lib/onphone";
import crypto from "crypto";
import { guestAccess } from "../../../lib/billing";
import { PAUSED_MESSAGE } from "../../../lib/pricing";
import { isFileHotel } from "../../../lib/hotels";
import { cipherLayerGuestEnabled, guestLayerTurn, guestLayerApplies, guestLayerReply } from "../../../lib/guest-facts";

export async function getServerSideProps({ params, query, res }) {
  const hotel = await resolveHotel(params.hotelId);
  if (!hotel || !validRoom(params.roomId)) return { notFound: true };
  const ok = verifyRoom(hotel.id, params.roomId, query.t);
  if (!ok) res.statusCode = 403;
  const layerGuest = cipherLayerGuestEnabled();
  const access = await guestAccess(hotel.id, { isFile: isFileHotel(hotel.id) });
  if (ok && !access.ok) return { props: { hotel: publicHotel(hotel), roomId: params.roomId, t: null, paused: true, factVersion: "", openQuestions: false, force: null, debug: false, layerGuest } };
  const factVersion = crypto.createHash("sha256").update(JSON.stringify(hotel)).digest("hex").slice(0, 12);
  return { props: { hotel: publicHotel(hotel), roomId: params.roomId, t: ok ? query.t : null, factVersion,
    openQuestions: process.env.CIPHER_OPEN_QUESTIONS !== "off", force: ["phone", "server"].includes(query.mode) ? query.mode : null,
    debug: query.debug === "1" && process.env.NODE_ENV !== "production", layerGuest } };
}

const GUEST_LAYOUT_CSS = `
html, body { background:#000; color:#fff; overflow-x:hidden; }
.wisps { display:none; }
.chat.layer-guest {
  display:block; height:auto; min-height:100dvh; max-width:100%; margin:0;
  padding:16px 16px 32px; background:#000; color:#fff; overflow-x:hidden;
  font-family:Arial, Helvetica, sans-serif; font-size:22px; line-height:1.45;
}
.chat.layer-guest .chat-head {
  display:block; margin:0 0 24px; padding:0; border:0; border-radius:0;
  background:#000; box-shadow:none;
}
.chat.layer-guest .chat-head .who { display:block; min-width:0; }
.chat.layer-guest .chat-head .hotel {
  display:block; margin:0 0 8px; font-size:32px; font-weight:700; line-height:1.2;
  letter-spacing:0; white-space:normal; overflow:visible; text-overflow:clip; color:#fff;
}
.chat.layer-guest .chat-head .room { display:block; margin:0 0 16px; font-size:22px; line-height:1.35; color:#fff; }
.chat.layer-guest .chat-head .room b { color:#fff; font-weight:700; }
.chat.layer-guest .call-btn, .chat.layer-guest .inline-call {
  display:flex; width:100%; height:auto; min-height:72px; margin:0 0 16px; padding:16px;
  box-sizing:border-box; border-radius:0; border:4px solid #fff; background:#000; color:#ffe14a;
  font-size:22px; font-weight:700; line-height:1.3; white-space:normal; justify-content:flex-start; gap:12px;
}
.chat.layer-guest .call-btn svg { width:28px; height:28px; flex:none; }
.chat.layer-guest #guest-status { margin:0 0 28px; }
.chat.layer-guest .msgs {
  display:flex; flex-direction:column; gap:28px; overflow:visible; flex:none;
  height:auto; padding:0; margin:0 0 32px;
}
.chat.layer-guest .row { display:block; margin:0; }
.chat.layer-guest .avatar { display:none; }
.chat.layer-guest .bubble, .chat.layer-guest .bubble.user, .chat.layer-guest .bubble.emergency {
  display:block; width:100%; max-width:100%; box-sizing:border-box; margin:0;
  padding:16px; background:#000; color:#fff; border:4px solid #fff; border-radius:0;
  box-shadow:none; font-size:24px; line-height:1.45; white-space:pre-wrap; overflow-wrap:anywhere;
}
.chat.layer-guest .bubble.user { background:#ffe14a; color:#000; }
.chat.layer-guest .meta, .chat.layer-guest .src {
  display:block; width:100%; box-sizing:border-box; margin:12px 0 0; padding:0;
  background:transparent; border:0; border-radius:0; letter-spacing:0;
  font-size:20px; line-height:1.4; color:#ffe14a;
}
.chat.layer-guest details { display:block; margin-top:16px; }
.chat.layer-guest summary { display:block; font-size:22px; font-weight:700; line-height:1.3; padding:12px 0; color:#fff; }
.chat.layer-guest .chips {
  display:flex; flex-direction:column; gap:16px; overflow:visible; height:auto;
  padding:0; margin:0 0 32px; mask-image:none; -webkit-mask-image:none;
}
.chat.layer-guest .chip {
  display:block; width:100%; flex:none; box-sizing:border-box; min-height:72px;
  margin:0; padding:18px 16px; border-radius:0; border:4px solid #fff;
  background:#ffe14a; color:#000; font-size:22px; font-weight:700; line-height:1.3;
  text-align:left; white-space:normal;
}
.chat.layer-guest .dock { display:block; padding:0; margin:0; }
.chat.layer-guest .req-btn {
  display:block; width:100%; box-sizing:border-box; min-height:72px; margin:0 0 20px;
  padding:18px 16px; border-radius:0; border:4px solid #fff; background:#000; color:#ffe14a;
  font-size:22px; font-weight:700; line-height:1.3; text-align:left;
}
.chat.layer-guest .composer {
  display:block; width:100%; box-sizing:border-box; margin:0 0 20px; padding:0;
  border:0; border-radius:0; background:transparent; box-shadow:none;
}
.chat.layer-guest .composer input {
  display:block; width:100%; box-sizing:border-box; min-height:72px; margin:0 0 16px;
  padding:16px; border:4px solid #fff; border-radius:0; background:#000; color:#fff;
  font-size:22px; line-height:1.3;
}
.chat.layer-guest .composer input::placeholder { color:#fff; }
.chat.layer-guest .send, .chat.layer-guest .send:disabled {
  display:block; width:100%; height:auto; min-height:72px; margin:0; padding:18px 16px;
  border:4px solid #fff; border-radius:0; background:#ffe14a; color:#000; opacity:1;
  box-shadow:none; font-size:22px; font-weight:700; line-height:1.3; text-align:left;
}
.chat.layer-guest .send:disabled { background:#000; color:#ffe14a; }
.chat.layer-guest .send svg { display:none; }
.chat.layer-guest .privacy {
  display:flex; flex-direction:column; align-items:stretch; gap:16px;
  margin:8px 0 0; text-align:left; font-size:20px; line-height:1.4; color:#fff;
}
.chat.layer-guest .privacy svg { width:24px; height:24px; }
.chat.layer-guest .privacy button {
  display:block; width:100%; box-sizing:border-box; min-height:64px; margin:0; padding:16px;
  border:4px solid #fff; background:#000; color:#ffe14a; font-size:22px; font-weight:700;
  line-height:1.3; text-align:left; text-decoration:none;
}
.chat.layer-guest button:focus, .chat.layer-guest a:focus, .chat.layer-guest summary:focus, .chat.layer-guest input:focus {
  outline:4px solid #fff; outline-offset:3px;
}
`;
const CHIPS = ["Checkout time", "Wi-Fi", "Breakfast", "Anything open now?", "Extra towels", "Parking", "Nearby food"];
const REQ_TYPES = [["towels", "Towels"], ["housekeeping", "Housekeeping"], ["maintenance", "Something broken"]];
const reqTypeFor = (m) => m.intent === "maintenance" ? "maintenance" : m.intent === "housekeeping" ? (/towel/i.test(m.q || "") ? "towels" : "housekeeping") : null;
const hhmm = () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export default function Stay({ hotel, roomId, t, paused = false, factVersion, openQuestions, force, debug, layerGuest = false }) {
  // Debug info only in dev with ?debug=1; never exposed on window otherwise.
  const dbg = useRef({ stats: [] }).current;
  const welcome = { role: "assistant", kind: "fact", content: `Welcome to ${hotel.name}. I'm Cipher, your private concierge for Room ${roomId}. Ask me anything about your stay, day or night.`, at: "" };
  const [msgs, setMsgs] = useState([welcome]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const end = useRef(null);
  const [reqOpen, setReqOpen] = useState(false);
  const [reqType, setReqType] = useState("towels");
  const [reqNote, setReqNote] = useState("");
  const [reqState, setReqState] = useState({ busy: false, msg: "", err: false });
  const [guestStatus, setGuestStatus] = useState("");
  async function sendRequest(type, note) {
    if (reqState.busy) return;
    setReqState({ busy: true, msg: "Sending…", err: false });
    try {
      const r = await fetch("/api/requests", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId: hotel.id, roomId, t, type, note: note || "" }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setReqState({ busy: false, msg: j.error || "Couldn't send. Please call the front desk.", err: true }); return false; }
      setReqState({ busy: false, msg: `Sent for room ${roomId}. Staff will take care of it.`, err: false });
      setReqOpen(false); setReqNote("");
      return true;
    } catch { setReqState({ busy: false, msg: "Couldn't send. Please call the front desk.", err: true }); return false; }
  }
  // On-phone mode (default): fact pack + Cipher WASM run locally. "server" only when the device can't.
  const [mode, setMode] = useState(null); // null (deciding) | "phone" | "server"
  const [load, setLoad] = useState({ pct: 0, text: "Preparing your private concierge…", ready: false });
  const pack = useRef(null), ai = useRef(null), aiReady = useRef(null);
  useEffect(() => {
    if (!t) return;
    const why = unsupportedReason(force);
    Object.assign(dbg, { mode: why ? "server" : "phone", why }); if (debug) window.__cipher = dbg;
    if (why) { setMode("server"); return; }
    setMode("phone");
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
      // Let the worker store this page + the chunks already loaded, so a reload works offline.
      navigator.serviceWorker.ready.then((reg) => reg.active && reg.active.postMessage({ type: "cache-page", page: location.href,
        assets: performance.getEntriesByType("resource").map((r) => r.name).filter((n) => n.startsWith(location.origin + "/_next/static/")) })).catch(() => {});
    }
    pack.current = loadFactPack({ hotelId: hotel.id, roomId, t, version: factVersion }).then((r) => { dbg.factPack = r.fromCache ? "cache" : "network"; return r.hotel; });
    aiReady.current = loadCipher({ onProgress: (p) => { const pct = Math.floor((100 * p.got) / p.size);
        setLoad({ pct, ready: false, text: p.fromCache ? `Loading Cipher from this phone… ${pct}%` : `Downloading Cipher once (${Math.round(p.size / 1e6)} MB)… ${pct}%` }); } })
      .then((m) => { ai.current = m; dbg.build = m.info.info.build; dbg.ready = true;
        setLoad({ pct: 100, ready: true, text: `Cipher is ready on this phone · ${m.info.info.build}` }); return m; })
      .catch((e) => { dbg.modelError = String(e); setLoad({ pct: 0, ready: false, failed: true, text: "Cipher couldn't load on this phone. Hotel facts still answer here." }); return null; });
  }, [t]); // eslint-disable-line react-hooks/exhaustive-deps

  async function askServer(next) {
    const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hotelId: hotel.id, roomId, t, messages: next.slice(1).map(({ role, content }) => ({ role, content })) }) });
    const j = await r.json();
    return r.ok ? { role: "assistant", content: j.text, kind: j.kind, call: j.call, source: j.source, intent: j.intent, where: "server" } : { role: "assistant", kind: "fallback", call: true, content: j.error || "Something went wrong.", where: "server" };
  }
  async function askWithGuestFacts(q) {
    let H;
    try { H = await pack.current; } catch { return null; }
    const pre = guestLayerTurn(H, q, "");
    if (!guestLayerApplies(pre)) return null;
    let raw = "";
    if (pre.resolution.source !== "safety") {
      setGuestStatus("Checking the hotel file.");
      const m = await aiReady.current;
      if (m) {
        setGuestStatus("Cipher is answering.");
        try {
          const turn = decideTurn(H, q, { now: new Date(), openQuestions });
          await m.reset();
          if (turn.system) await m.setSystem(turn.system);
          const g = await m.generate(q, { maxNew: 64 });
          raw = g.text || "";
        } catch {
          setGuestStatus("Cipher did not finish. The hotel file answer is still shown.");
        }
      } else {
        setGuestStatus("Cipher did not load. The hotel file answer is shown.");
      }
    }
    const reply = guestLayerReply(H, q, raw);
    return reply ? { ...reply, where: "phone" } : null;
  }
  async function askPhone(q, next) {
    if (layerGuest) {
      const layered = await askWithGuestFacts(q);
      if (layered) return layered;
    }
    let H;
    try { H = await pack.current; } catch { return askServer(next); }   // no fact pack (first visit offline): use the server
    const turn = decideTurn(H, q, { now: new Date(), openQuestions });
    if (turn.path === "facts") { if (debug) dbg.stats.push({ q, source: "facts" }); return { role: "assistant", content: turn.text, kind: turn.kind, call: turn.call, source: "facts", intent: turn.intent, where: "phone" }; }
    const m = await aiReady.current;
    if (!m) return { ...(await askServer(next)) };                       // model failed to load: the hotel's server answers
    await m.reset(); await m.setSystem(turn.system);
    let sofar = "";
    const g = await m.generate(q, { maxNew: turn.maxNew, onToken: (p) => { sofar += p; if (GEN.stops.some((s) => sofar.includes(s))) m.stop(); } });
    const judged = judgeGeneration(g.text, turn.facts, q, H);
    if (debug) dbg.stats.push({ q, source: judged.ok ? "cipher" : "cipher-fallback", raw: g.text.slice(0, 300), reason: judged.reason, ...g.stats });
    return judged.ok ? { role: "assistant", content: judged.finalText, kind: "cipher", source: "cipher", where: "phone" }
      : { role: "assistant", content: judged.finalText, kind: "fallback", call: true, source: "cipher-fallback", where: "phone" };
  }
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, busy]);

  if (paused) return (
    <main className="center-card glass">
      <Head><title>{hotel.name} · Cipher Concierge</title></Head>
      <Mark size={56} />
      <h1>Welcome to {hotel.name}</h1>
      <p>{PAUSED_MESSAGE}</p>
      <div style={{ marginTop: 18 }}><CallButton frontDesk={hotel.frontDesk} /></div>
    </main>
  );
  if (!t) return (
    <main className="center-card glass">
      <Head><title>Scan your room QR code · Cipher Concierge</title></Head>
      <Mark size={56} />
      <h1>Please scan the QR code in your room</h1>
      <p>This link isn't valid for Room {roomId}. Scan the card in your room to start a private chat with the {hotel.name} concierge.</p>
      <div style={{ marginTop: 18 }}><CallButton frontDesk={hotel.frontDesk} /></div>
    </main>
  );

  async function ask(text) {
    const q = text.trim();
    if (!q || busy) return;
    const next = [...msgs, { role: "user", content: q, at: hhmm() }];
    setMsgs(next); setInput(""); setBusy(true);
    if (layerGuest) setGuestStatus("Checking the hotel file.");
    let reply;
    try {
      reply = mode === "phone" ? await askPhone(q, next) : await askServer(next);
    } catch {
      reply = { role: "assistant", kind: "fallback", call: true, content: "I can't reach the concierge right now. The front desk can help." };
      if (layerGuest) setGuestStatus("Failed. The front desk can help.");
    }
    if (layerGuest && reply) {
      if (reply.source === "safety") setGuestStatus("Safety message. Not the model.");
      else if (reply.source === "withheld") setGuestStatus("Not in the hotel file. This is not a success.");
      else if (reply.source === "layer") setGuestStatus(reply.modelRan ? "Approved hotel facts. Not the model." : "Approved hotel facts. Cipher did not run on this answer.");
      else setGuestStatus("Cipher finished. This is not an approved hotel fact.");
    }
    setMsgs((m) => [...m, { ...reply, q, at: hhmm() }]); setBusy(false);
  }

  return (
    <div className={layerGuest ? "chat layer-guest" : "chat"}>
      <Head><title>{`${hotel.name} · Room ${roomId} · Concierge`}</title></Head>
      {layerGuest && <style dangerouslySetInnerHTML={{ __html: GUEST_LAYOUT_CSS }} />}
      <header className="chat-head glass">
        <Mark size={34} small />
        <div className="who">
          <div className="hotel">{hotel.name.toUpperCase()}</div>
          <div className="room">Room {roomId} · <b>Private</b></div>
          {!layerGuest && mode === "phone" && <div className="onphone" data-testid="onphone-badge"><i />Running on your phone · nothing is sent</div>}
          {!layerGuest && mode === "server" && <div className="onphone server" data-testid="server-badge"><i />Answered by the hotel's server</div>}
        </div>
        <CallButton frontDesk={hotel.frontDesk} compact={!layerGuest} />
      </header>

      {layerGuest ? (
        <p id="guest-status" role="status" aria-live="assertive" aria-atomic="true" data-testid="guest-status" style={{ position: "static", background: "#000", color: "#fff", border: "4px solid #ffe14a", fontSize: 28, fontWeight: 700, lineHeight: 1.3, padding: 16, margin: "0 0 28px" }}>{guestStatus || (mode === "phone" && !load.ready ? load.text : "Not started. Ask a question.")}</p>
      ) : null}
      {!layerGuest && mode === "phone" && !load.ready && (
        <div className="dl glass" role="status" data-testid="download"><div>{load.text}{!load.failed && " Hotel questions answer right away."}</div>{!load.failed && <div className="dl-bar"><b style={{ width: `${load.pct}%` }} /></div>}</div>
      )}
      <main className="msgs" aria-live="polite" aria-label="Conversation">
        {msgs.map((m, i) => m.role === "user" ? (
          <div key={i} className="row user"><div><div className="bubble user"><span className="sr-only">You said: </span>{m.content}</div><div className="meta" style={{ justifyContent: "flex-end" }}>{m.at}</div></div></div>
        ) : (
          <div key={i} className="row">
            <div className="avatar"><Mark size={18} small /></div>
            <div style={{ minWidth: 0 }}>
              <div className={`bubble bot glass ${m.kind === "emergency" ? "emergency" : ""}`}>
                <span className="sr-only">Concierge: </span><RichText text={m.content} />
                {layerGuest && m.raw ? <details><summary>Cipher&apos;s own words</summary><p>{m.raw}</p></details> : null}
                {reqTypeFor(m) && <div><button type="button" className="req-btn" disabled={reqState.busy}
                  onClick={() => sendRequest(reqTypeFor(m), "")}>Send to front desk</button></div>}
                {m.call && <div><CallButton frontDesk={hotel.frontDesk} className="inline-call" /></div>}
              </div>
              <div className="meta">
                {m.at}
                {layerGuest && m.source === "layer" && <span className="src facts">Approved hotel facts, not model-generated</span>}
                {layerGuest && m.source === "withheld" && <span className="src">Not in the hotel file. Not counted as a success.</span>}
                {layerGuest && m.source === "safety" && <span className="src">Safety message. Not the model.</span>}
                {m.source === "facts" && m.kind === "fact" && <span className="src facts">From {hotel.name}'s info{m.where === "phone" ? " · on this phone" : ""}</span>}
                {m.source === "cipher" && <span className="src cipher">Cipher{m.where === "phone" ? " on this phone" : ""} · general answer, confirm details with the front desk</span>}
                {m.where === "server" && <span className="src server">Answered by the hotel's server</span>}
              </div>
            </div>
          </div>
        ))}
        {busy && <div className="row"><div className="avatar"><Mark size={18} small /></div><div className="bubble bot glass typing" role="status" aria-label="Concierge is typing"><i /><i /><i /></div></div>}
        <div ref={end} />
      </main>

      <nav className="chips" aria-label="Suggested questions">
        {(layerGuest ? ["What is the Wi-Fi?", "What time is checkout?", "I can't breathe"] : CHIPS).map((c) => <button key={c} className="chip" onClick={() => ask(c)} disabled={busy}>{c}</button>)}
      </nav>
      <div className="dock">
        <style dangerouslySetInnerHTML={{ __html: ".req-btn{display:block;width:100%;min-height:56px;margin-top:10px;border:0;border-radius:16px;background:#fff;color:#0b1020;font:800 19px 'Plus Jakarta Sans',sans-serif;cursor:pointer}.req-btn:disabled{opacity:.6}.req-panel{margin-bottom:8px;padding:14px;border-radius:18px;background:#0b1020;border:2px solid #fff;color:#fff}.req-panel label{display:block;font-size:18px;font-weight:700;margin:8px 0 6px}.req-panel select,.req-panel input{width:100%;min-height:52px;font-size:19px;border-radius:12px;border:2px solid #fff;background:#000;color:#fff;padding:0 12px}.req-status{margin:0 0 8px;padding:12px 14px;border-radius:14px;font-size:19px;font-weight:700;background:#123d1f;color:#fff}.req-status.err{background:#5a1010}" }} />
        {reqState.msg && <p className={`req-status ${reqState.err ? "err" : ""}`} role="status" aria-live="polite">{reqState.msg}</p>}
        {reqOpen ? (
          <form className="req-panel" onSubmit={(e) => { e.preventDefault(); sendRequest(reqType, reqNote); }}>
            <label htmlFor="req-type">What do you need?</label>
            <select id="req-type" value={reqType} onChange={(e) => setReqType(e.target.value)}>
              {REQ_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <label htmlFor="req-note">Note (optional)</label>
            <input id="req-note" value={reqNote} onChange={(e) => setReqNote(e.target.value)} maxLength={200} placeholder="e.g. 2 bath towels" autoComplete="off" />
            <button type="submit" className="req-btn" disabled={reqState.busy}>Send to front desk</button>
            <button type="button" className="req-btn" style={{ background: "transparent", color: "#fff", border: "2px solid #fff" }} onClick={() => setReqOpen(false)}>Cancel</button>
          </form>
        ) : (
          <button type="button" className="req-btn" style={layerGuest ? undefined : { marginBottom: 8 }} onClick={() => { setReqOpen(true); setReqState({ busy: false, msg: "", err: false }); }}>Request help</button>
        )}
        <form className="composer glass" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
          <label htmlFor="q" className="sr-only">Ask the concierge</label>
          <input id="q" value={input} onChange={(e) => setInput(e.target.value)} placeholder={layerGuest ? "Ask a question" : "Ask about checkout, Wi-Fi, dining…"} maxLength={500} autoComplete="off" enterKeyHint="send" />
          <button className="send" type="submit" disabled={!input.trim() || busy} aria-label="Send">{layerGuest ? "Send" : null}<Send /></button>
        </form>
        <div className="privacy">
          <Lock /> {mode === "phone" ? "Answers are worked out on this phone · Nothing stored" : "Nothing stored · No third-party AI"}
          <button onClick={() => setShowPrivacy((s) => !s)} aria-expanded={showPrivacy}>Privacy</button>
          <button onClick={() => setMsgs([welcome])}>Clear chat</button>
        </div>
        {showPrivacy && (
          <div className="glass" style={{ marginTop: 8, padding: "12px 14px", borderRadius: 16, fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
            {mode === "phone" && <>On this phone, Cipher and {hotel.name}'s fact sheet are downloaded once and every answer is worked out on the device: your questions are not sent anywhere. </>}
            {mode === "server" && <>This device can't run Cipher locally, so your questions go to the hotel's own server. </>}
            Your questions are answered from {hotel.name}'s own information and by Cipher, Cipher CTS's own AI model. No outside AI service is used. Messages are held in memory only long enough to answer and are never saved or logged. Your chat history lives only in this browser tab and is gone when you close it or tap Clear. To limit abuse, we keep a short-lived, anonymous request counter for about a minute. No accounts, no tracking, no ads.
          </div>
        )}
      </div>
    </div>
  );
}

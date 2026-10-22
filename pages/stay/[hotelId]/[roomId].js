import Head from "next/head";
import { useEffect, useRef, useState } from "react";
import { getHotel, publicHotel, validRoom } from "../../../lib/hotels";
import { verifyRoom } from "../../../lib/token";
import Mark from "../../../components/Mark";
import RichText from "../../../components/RichText";
import CallButton from "../../../components/CallButton";
import { Send, Lock } from "../../../components/Icons";
import { route, guardAnswer, buildPrompt, connect } from "../../../lib/factpack";
import { unsupportedReason, loadCipher, loadFactPack } from "../../../lib/onphone";
import crypto from "crypto";

export async function getServerSideProps({ params, query, res }) {
  const hotel = getHotel(params.hotelId);
  if (!hotel || !validRoom(params.roomId)) return { notFound: true };
  const ok = verifyRoom(hotel.id, params.roomId, query.t);
  if (!ok) res.statusCode = 403;
  const factVersion = crypto.createHash("sha256").update(JSON.stringify(getHotel(hotel.id))).digest("hex").slice(0, 12);
  return { props: { hotel: publicHotel(hotel), roomId: params.roomId, t: ok ? query.t : null, factVersion,
    openQuestions: process.env.CIPHER_OPEN_QUESTIONS !== "off", force: ["phone", "server"].includes(query.mode) ? query.mode : null } };
}

const CHIPS = ["Checkout time", "Wi-Fi", "Breakfast", "Anything open now?", "Extra towels", "Parking", "Nearby food"];
const hhmm = () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export default function Stay({ hotel, roomId, t, factVersion, openQuestions, force }) {
  const welcome = { role: "assistant", kind: "fact", content: `Welcome to ${hotel.name}. I'm Cipher, your private concierge for Room ${roomId}. Ask me anything about your stay, day or night.`, at: "" };
  const [msgs, setMsgs] = useState([welcome]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const end = useRef(null);
  // On-phone mode (default): fact pack + Cipher WASM run locally. "server" only when the device can't.
  const [mode, setMode] = useState(null); // null (deciding) | "phone" | "server"
  const [load, setLoad] = useState({ pct: 0, text: "Preparing your private concierge…", ready: false });
  const pack = useRef(null), ai = useRef(null), aiReady = useRef(null);
  useEffect(() => {
    if (!t) return;
    const why = unsupportedReason(force);
    window.__cipher = { mode: why ? "server" : "phone", why, stats: [] };
    if (why) { setMode("server"); return; }
    setMode("phone");
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    pack.current = loadFactPack({ hotelId: hotel.id, roomId, t, version: factVersion }).then((r) => { window.__cipher.factPack = r.fromCache ? "cache" : "network"; return r.hotel; });
    aiReady.current = loadCipher({ onProgress: (p) => { const pct = Math.floor((100 * p.got) / p.size);
        setLoad({ pct, ready: false, text: p.fromCache ? `Loading Cipher from this phone… ${pct}%` : `Downloading Cipher once (${Math.round(p.size / 1e6)} MB)… ${pct}%` }); } })
      .then((m) => { ai.current = m; window.__cipher.build = m.info.info.build; window.__cipher.ready = true;
        setLoad({ pct: 100, ready: true, text: `Cipher is ready on this phone · ${m.info.info.build}` }); return m; })
      .catch((e) => { window.__cipher.modelError = String(e); setLoad({ pct: 0, ready: false, failed: true, text: "Cipher couldn't load on this phone. Hotel facts still answer here." }); return null; });
  }, [t]); // eslint-disable-line react-hooks/exhaustive-deps

  async function askServer(next) {
    const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hotelId: hotel.id, roomId, t, messages: next.slice(1).map(({ role, content }) => ({ role, content })) }) });
    const j = await r.json();
    return r.ok ? { role: "assistant", content: j.text, kind: j.kind, call: j.call, source: j.source, where: "server" } : { role: "assistant", kind: "fallback", call: true, content: j.error || "Something went wrong.", where: "server" };
  }
  async function askPhone(q, next) {
    let H;
    try { H = await pack.current; } catch { return askServer(next); }   // no fact pack (first visit offline): use the server
    const r = route(H, q, { now: new Date(), openQuestions });
    if (!r.needsModel) { window.__cipher.stats.push({ q, source: r.source }); return { role: "assistant", content: r.text, kind: r.kind, call: r.call, source: r.source, where: "phone" }; }
    const m = await aiReady.current;
    if (!m) return { ...(await askServer(next)) };                       // model failed to load: the hotel's server answers
    await m.reset(); await m.setSystem(buildPrompt(H, r.facts));
    const g = await m.generate(q, { maxNew: 120 });
    const ok = guardAnswer(g.text, r.facts, q, H.name).ok;
    window.__cipher.stats.push({ q, source: ok ? "cipher" : "cipher-fallback", raw: g.text.slice(0, 300), ...g.stats });
    return ok ? { role: "assistant", content: g.text.trim(), kind: "cipher", source: "cipher", where: "phone" }
      : { role: "assistant", ...connect(H, "I'm not certain about that. "), content: connect(H, "I'm not certain about that. ").text, source: "cipher-fallback", where: "phone" };
  }
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, busy]);

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
    let reply;
    try {
      reply = mode === "phone" ? await askPhone(q, next) : await askServer(next);
    } catch {
      reply = { role: "assistant", kind: "fallback", call: true, content: "I can't reach the concierge right now. The front desk can help." };
    }
    setMsgs((m) => [...m, { ...reply, at: hhmm() }]); setBusy(false);
  }

  return (
    <div className="chat">
      <Head><title>{`${hotel.name} · Room ${roomId} · Concierge`}</title></Head>
      <header className="chat-head glass">
        <Mark size={34} small />
        <div className="who">
          <div className="hotel">{hotel.name.toUpperCase()}</div>
          <div className="room">Room {roomId} · <b>Private</b></div>
          {mode === "phone" && <div className="onphone" data-testid="onphone-badge"><i />Running on your phone · nothing is sent</div>}
          {mode === "server" && <div className="onphone server" data-testid="server-badge"><i />Answered by the hotel's server</div>}
        </div>
        <CallButton frontDesk={hotel.frontDesk} compact />
      </header>

      {mode === "phone" && !load.ready && (
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
                {m.call && <div><CallButton frontDesk={hotel.frontDesk} className="inline-call" /></div>}
              </div>
              <div className="meta">
                {m.at}
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
        {CHIPS.map((c) => <button key={c} className="chip" onClick={() => ask(c)} disabled={busy}>{c}</button>)}
      </nav>
      <div className="dock">
        <form className="composer glass" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
          <label htmlFor="q" className="sr-only">Ask the concierge</label>
          <input id="q" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about checkout, Wi-Fi, dining…" maxLength={500} autoComplete="off" enterKeyHint="send" />
          <button className="send" type="submit" disabled={!input.trim() || busy} aria-label="Send"><Send /></button>
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

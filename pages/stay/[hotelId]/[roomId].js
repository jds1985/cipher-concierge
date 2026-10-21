import Head from "next/head";
import { useEffect, useRef, useState } from "react";
import { getHotel, publicHotel, validRoom } from "../../../lib/hotels";
import { verifyRoom } from "../../../lib/token";
import Mark from "../../../components/Mark";
import RichText from "../../../components/RichText";
import CallButton from "../../../components/CallButton";
import { Send, Lock } from "../../../components/Icons";

export async function getServerSideProps({ params, query, res }) {
  const hotel = getHotel(params.hotelId);
  if (!hotel || !validRoom(params.roomId)) return { notFound: true };
  const ok = verifyRoom(hotel.id, params.roomId, query.t);
  if (!ok) res.statusCode = 403;
  return { props: { hotel: publicHotel(hotel), roomId: params.roomId, t: ok ? query.t : null } };
}

const CHIPS = ["Checkout time", "Wi-Fi", "Breakfast", "Anything open now?", "Extra towels", "Parking", "Nearby food"];
const hhmm = () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export default function Stay({ hotel, roomId, t }) {
  const welcome = { role: "assistant", kind: "fact", content: `Welcome to ${hotel.name}. I'm Cipher, your private concierge for Room ${roomId}. Ask me anything about your stay, day or night.`, at: "" };
  const [msgs, setMsgs] = useState([welcome]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const end = useRef(null);
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
      const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId: hotel.id, roomId, t, messages: next.slice(1).map(({ role, content }) => ({ role, content })) }) });
      const j = await r.json();
      reply = r.ok ? { role: "assistant", content: j.text, kind: j.kind, call: j.call, source: j.source } : { role: "assistant", kind: "fallback", call: true, content: j.error || "Something went wrong." };
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
        </div>
        <CallButton frontDesk={hotel.frontDesk} compact />
      </header>

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
                {m.source === "facts" && m.kind === "fact" && <span className="src facts">From {hotel.name}'s info</span>}
                {m.source === "cipher" && <span className="src cipher">Cipher · general answer, confirm details with the front desk</span>}
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
          <Lock /> Nothing stored · No third-party AI
          <button onClick={() => setShowPrivacy((s) => !s)} aria-expanded={showPrivacy}>Privacy</button>
          <button onClick={() => setMsgs([welcome])}>Clear chat</button>
        </div>
        {showPrivacy && (
          <div className="glass" style={{ marginTop: 8, padding: "12px 14px", borderRadius: 16, fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
            Your questions are answered from {hotel.name}'s own information and by Cipher, Cipher CTS's own AI model. No outside AI service is used. Messages are held in memory only long enough to answer and are never saved or logged. Your chat history lives only in this browser tab and is gone when you close it or tap Clear. To limit abuse, we keep a short-lived, anonymous request counter for about a minute. No accounts, no tracking, no ads.
          </div>
        )}
      </div>
    </div>
  );
}

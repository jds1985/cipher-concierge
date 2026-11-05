import Head from "next/head";
import { useEffect, useState } from "react";
import Mark from "../components/Mark";
import { SETUP_CSS } from "../lib/setup-css";
import { sessionFromReq } from "../lib/auth";

// Staff screen: open guest requests for the signed-in manager's hotel (hotel comes from the session only).
export async function getServerSideProps({ req, res }) {
  res.setHeader("Cache-Control", "no-store");
  const s = await sessionFromReq(req);
  if (!s) return { redirect: { destination: "/login", permanent: false } };
  return { props: { email: s.email } };
}

const LABEL = { towels: "Towels", housekeeping: "Housekeeping", maintenance: "Something broken" };
const CSS = `.rq-list{list-style:none;padding:0;margin:0;display:grid;gap:14px}
.rq-item{display:flex;gap:16px;align-items:center;justify-content:space-between;padding:18px 20px;border-radius:18px;background:#0b1020;border:2px solid #fff;color:#fff}
.rq-room{font:800 30px "Plus Jakarta Sans";color:#fff}.rq-type{font-size:22px;font-weight:700}.rq-note{font-size:20px;margin-top:4px}.rq-time{font-size:18px;color:#cfd8ea;margin-top:4px}
.rq-done{min-height:64px;min-width:130px;font-size:22px}.rq-big{font-size:22px;line-height:1.5}.btn-xl{min-height:60px;font-size:20px;padding:0 28px}`;
const ago = (d) => { const m = Math.round((Date.now() - new Date(d)) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); };

export default function Requests({ email }) {
  const [list, setList] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  async function load() {
    try {
      const r = await fetch("/api/requests?status=open", { cache: "no-store" });
      if (r.status === 401) { window.location.href = "/login"; return; }
      const j = await r.json();
      if (!r.ok) { setErr(j.error || "Couldn't load."); return; }
      setErr(""); setList(j.requests || []);
    } catch { setErr("Network error. Retrying…"); }
  }
  useEffect(() => { load(); const id = setInterval(load, 20000); return () => clearInterval(id); }, []);
  async function done(id) {
    setBusy(id);
    try {
      const r = await fetch(`/api/requests/${encodeURIComponent(id)}/done`, { method: "POST" });
      if (r.status === 401) { window.location.href = "/login"; return; }
      if (!r.ok) setErr("Couldn't mark done. Try again.");
      await load();
    } finally { setBusy(""); }
  }
  return (
    <div className="page setup-page">
      <Head><title>Guest requests · Cipher Concierge</title><meta name="robots" content="noindex,nofollow" /></Head>
      <style>{SETUP_CSS + CSS}</style>
      <nav className="nav" aria-label="Requests">
        <Mark size={30} /><span className="brand">CIPHER</span><span className="spacer" />
        <a className="btn btn-ghost" href="/manage">Setup</a>
        <a className="btn btn-ghost" href="/billing" style={{ marginLeft: 12 }}>Billing</a>
        <form method="post" action="/api/auth/logout" style={{ marginLeft: 12 }}>
          <button className="btn btn-ghost" type="submit" title={`Signed in as ${email}`}>Sign out</button></form>
      </nav>
      <h1 className="setup-h1">Guest requests</h1>
      <button className="btn btn-primary btn-xl" onClick={load} style={{ marginBottom: 18 }}>Refresh</button>
      {err && <p className="form-err rq-big" role="alert">{err}</p>}
      <div aria-live="polite">
        {list === null ? <p className="rq-big">Loading…</p> : list.length === 0 ? <p className="rq-big">No open requests.</p> : (
          <ul className="rq-list">
            {list.map((r) => (
              <li key={r.id} className="rq-item">
                <div>
                  <div className="rq-room">Room {r.roomId}</div>
                  <div className="rq-type">{LABEL[r.type] || r.type}</div>
                  {r.note && <div className="rq-note">“{r.note}”</div>}
                  <div className="rq-time">{ago(r.createdAt)}</div>
                </div>
                <button className="btn btn-primary rq-done" disabled={busy === r.id} onClick={() => done(r.id)}
                  aria-label={`Mark room ${r.roomId} ${LABEL[r.type] || r.type} done`}>{busy === r.id ? "…" : "Done"}</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="hint rq-big">Updates every 20 seconds.</p>
    </div>
  );
}

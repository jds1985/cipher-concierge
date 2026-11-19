import Head from "next/head";
import { useCallback, useEffect, useState } from "react";
import Mark from "../components/Mark";
import { SETUP_CSS } from "../lib/setup-css";
import { sessionFromReq } from "../lib/auth";

// Manager Usage page: aggregate guest activity only (no chat content). Large type for accessibility.
export async function getServerSideProps({ req, res }) {
  res.setHeader("Cache-Control", "no-store");
  const s = await sessionFromReq(req);
  if (!s) return { redirect: { destination: "/login", permanent: false } };
  return { props: { email: s.email } };
}

const INTENT_LABEL = {
  wifi: "Wi-Fi",
  checkout: "Checkout",
  checkin: "Check-in",
  housekeeping: "Housekeeping",
  maintenance: "Maintenance",
  towels: "Towels",
  parking: "Parking",
  breakfast: "Breakfast",
  dining: "Dining",
  pool: "Pool",
  fitness: "Gym",
  cipher: "Open questions (Cipher)",
  cipher_hosted: "Open questions (desk)",
  fallback: "Front desk",
  emergency: "Emergency",
  unknown: "Other",
};

const CSS = `
.use-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr));gap:16px;margin:20px 0 28px;min-width:0}
.use-card{padding:22px 20px;border-radius:18px;background:#0b1020;border:2px solid #fff;color:#fff}
.use-num{font:800 48px/1.1 "Plus Jakarta Sans";color:#fff;margin:8px 0 0}
.use-label{font-size:22px;font-weight:700;color:#cfd8ea}
.use-ranges{display:flex;flex-wrap:wrap;gap:12px;margin:8px 0 8px}
.use-ranges .btn{min-height:56px;font-size:20px;padding:0 22px}
.use-ranges .on{background:#fff;color:#0b1020;border-color:#fff}
.use-list{list-style:none;padding:0;margin:0;display:grid;gap:12px}
.use-row{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:16px 18px;border-radius:16px;background:#0b1020;border:2px solid #fff;color:#fff;font-size:22px;font-weight:700}
.use-row strong{font-size:28px}
.use-big{font-size:22px;line-height:1.5}
.btn-xl{min-height:60px;font-size:20px;padding:0 28px}
`;

function labelIntent(id) {
  if (INTENT_LABEL[id]) return INTENT_LABEL[id];
  if (id.startsWith("cipher_")) return "Open questions";
  return id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function Usage({ email }) {
  const [range, setRange] = useState("7d");
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  const load = useCallback(async (r) => {
    try {
      const res = await fetch(`/api/stats?range=${encodeURIComponent(r)}`, { cache: "no-store" });
      if (res.status === 401) { window.location.href = "/login"; return; }
      const j = await res.json();
      if (!res.ok) { setErr(j.error || "Couldn't load."); return; }
      setErr("");
      setData(j);
    } catch {
      setErr("Network error. Try again.");
    }
  }, []);

  useEffect(() => { load(range); }, [range, load]);

  const empty = data && data.questions === 0 && data.requestsCreated === 0 && data.requestsDone === 0;

  return (
    <div className="page setup-page">
      <Head><title>Usage · Cipher Concierge</title><meta name="robots" content="noindex,nofollow" /></Head>
      <style>{SETUP_CSS + CSS}</style>
      <nav className="nav" aria-label="Usage">
        <Mark size={30} /><span className="brand">CIPHER</span><span className="spacer" />
        <a className="btn btn-ghost" href="/manage">Setup</a>
        <a className="btn btn-ghost" href="/requests" style={{ marginLeft: 12 }}>Requests</a>
        <a className="btn btn-ghost" href="/usage" style={{ marginLeft: 12 }}>Usage</a>
        <a className="btn btn-ghost" href="/billing" style={{ marginLeft: 12 }}>Billing</a>
        <form method="post" action="/api/auth/logout" style={{ marginLeft: 12 }}>
          <button className="btn btn-ghost" type="submit" title={`Signed in as ${email}`}>Sign out</button>
        </form>
      </nav>
      <h1 className="setup-h1">Usage</h1>
      <p className="setup-lede use-big">How much guests use Concierge. Counts only — chat text is never stored.</p>

      <div className="use-ranges" role="group" aria-label="Time range">
        {[
          ["today", "Today"],
          ["7d", "7 days"],
          ["30d", "30 days"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`btn btn-ghost${range === id ? " on" : ""}`}
            aria-pressed={range === id}
            onClick={() => setRange(id)}
          >{label}</button>
        ))}
        <button className="btn btn-primary btn-xl" type="button" onClick={() => load(range)}>Refresh</button>
      </div>

      {err && <p className="form-err use-big" role="alert">{err}</p>}

      {!data && !err && <p className="use-big">Loading…</p>}

      {data && empty && (
        <p className="use-big" role="status">No guest activity yet. Share a room QR to get started.</p>
      )}

      {data && !empty && (
        <>
          <div className="use-grid">
            <div className="use-card">
              <div className="use-label">Questions answered</div>
              <div className="use-num" aria-label={`${data.questions} questions`}>{data.questions}</div>
            </div>
            <div className="use-card">
              <div className="use-label">Staff requests sent</div>
              <div className="use-num" aria-label={`${data.requestsCreated} requests sent`}>{data.requestsCreated}</div>
            </div>
            <div className="use-card">
              <div className="use-label">Requests completed</div>
              <div className="use-num" aria-label={`${data.requestsDone} requests done`}>{data.requestsDone}</div>
            </div>
          </div>

          <h2 className="setup-h1" style={{ fontSize: 28, marginTop: 8 }}>Top topics</h2>
          {data.byIntent.length === 0 ? (
            <p className="use-big">No topics yet.</p>
          ) : (
            <ul className="use-list">
              {data.byIntent.map((row) => (
                <li key={row.intent} className="use-row">
                  <span>{labelIntent(row.intent)}</span>
                  <strong>{row.count}</strong>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <p className="hint use-big" style={{ marginTop: 28 }}>
        Server answers and staff requests only. Answers handled only on the guest phone are not counted yet.
      </p>
    </div>
  );
}

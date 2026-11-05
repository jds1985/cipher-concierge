import Head from "next/head";
import { useState } from "react";
import Mark from "../components/Mark";
import { SETUP_CSS } from "../lib/setup-css";
import { sessionFromReq } from "../lib/auth";
import { getBilling, billingConfigured } from "../lib/billing";
import { monthlyCents, dollars, TRIAL_DAYS } from "../lib/pricing";

export async function getServerSideProps({ req, res, query }) {
  res.setHeader("Cache-Control", "no-store");
  const s = await sessionFromReq(req);
  if (!s) return { redirect: { destination: "/login", permanent: false } };
  const b = (await getBilling(s.hotelId)) || {};
  return { props: { email: s.email, configured: billingConfigured(), done: query.done === "1", canceled: query.canceled === "1",
    billing: { status: b.status || null, rooms: b.rooms || b.plannedRooms || null, founding: !!b.founding, comp: !!b.comp,
      trialEnd: b.trialEnd || null, currentPeriodEnd: b.currentPeriodEnd || null, cancelAtPeriodEnd: !!b.cancelAtPeriodEnd, hasCustomer: !!b.customerId } } };
}

const LABEL = { trialing: "Free trial", active: "Active", past_due: "Payment overdue", unpaid: "Paused — unpaid", canceled: "Canceled",
  incomplete: "Waiting for payment", incomplete_expired: "Expired", paused: "Paused — add a card" };
const fmt = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) : "");
const BIG = `.bill-big{font-size:20px;line-height:1.5}.bill-status{font:800 30px "Plus Jakarta Sans";color:#fff}
.bill-price{font:800 40px "Plus Jakarta Sans";color:var(--lime)}.btn-xl{min-height:60px;font-size:20px;padding:0 28px}`;

export default function Billing({ email, configured, done, canceled, billing }) {
  const [rooms, setRooms] = useState(billing.rooms || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const n = Number(rooms);
  const valid = Number.isInteger(n) && n >= 1 && n <= 2000;
  const live = ["trialing", "active", "past_due", "unpaid", "incomplete", "paused"].includes(billing.status);

  async function go(path, body) {
    setBusy(true); setErr("");
    try {
      const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
      const j = await r.json();
      if (r.status === 401) { window.location.href = "/login"; return; }
      if (!r.ok || !j.url) { setErr(j.error || "Something went wrong."); return; }
      window.location.href = j.url;
    } catch { setErr("Network error. Try again."); } finally { setBusy(false); }
  }

  return (
    <div className="page setup-page">
      <Head><title>Billing · Cipher Concierge</title><meta name="robots" content="noindex,nofollow" /></Head>
      <style>{SETUP_CSS + BIG}</style>
      <nav className="nav" aria-label="Billing">
        <Mark size={30} /><span className="brand">CIPHER</span><span className="spacer" />
        <a className="btn btn-ghost" href="/manage">Hotel setup</a>
        <form method="post" action="/api/auth/logout" style={{ marginLeft: 12 }}>
          <button className="btn btn-ghost" type="submit" title={`Signed in as ${email}`}>Sign out</button></form>
      </nav>
      <h1 className="setup-h1">Billing</h1>
      {done && <p className="form-ok bill-big" role="status">Thanks! Your subscription is being set up — refresh in a few seconds to see it.</p>}
      {canceled && <p className="form-err bill-big" role="status">Checkout was canceled. Nothing was charged.</p>}
      {!configured && <p className="form-err bill-big">Billing isn't switched on yet. Your guests can keep using Cipher.</p>}

      {billing.comp ? (
        <section className="glass setup-form"><p className="bill-status">Complimentary</p><p className="bill-big">Cipher covers this hotel. No card needed.</p></section>
      ) : live ? (
        <section className="glass setup-form" aria-live="polite">
          <p className="bill-status">{LABEL[billing.status] || billing.status}</p>
          {billing.rooms && <p className="bill-big">{billing.rooms} rooms · <strong>{dollars(monthlyCents(billing.rooms, billing.founding))}/month</strong>{billing.founding ? " (founding price)" : ""}</p>}
          {billing.status === "trialing" && billing.trialEnd && <p className="bill-big">Free until <strong>{fmt(billing.trialEnd)}</strong>. Your card is charged after that.</p>}
          {billing.cancelAtPeriodEnd && billing.currentPeriodEnd && <p className="bill-big">Ends on {fmt(billing.currentPeriodEnd)}.</p>}
          {["past_due", "unpaid", "paused"].includes(billing.status) && <p className="form-err bill-big">Please update your card so guests keep their concierge.</p>}
          <button className="btn btn-primary btn-xl" disabled={busy} onClick={() => go("/api/billing/portal")}>{busy ? "Opening…" : "Manage billing (card, invoices, cancel)"}</button>
          <p className="hint">Need to change your room count? Email Cipher and we'll update it.</p>
        </section>
      ) : (
        <section className="glass setup-form">
          <p className="bill-big"><strong>$3 per room per month</strong>, $99 minimum. First {TRIAL_DAYS} days free. Cancel anytime.</p>
          {billing.founding && <p className="form-ok bill-big">Founding hotel: half off for 12 months ($1.50/room, $49.50 minimum).</p>}
          <label className="field"><span>How many guest rooms?</span>
            <input type="number" inputMode="numeric" min={1} max={2000} value={rooms} onChange={(e) => setRooms(e.target.value)} placeholder="40" /></label>
          {valid && <p className="bill-price" aria-live="polite">{dollars(monthlyCents(n, billing.founding))}/month</p>}
          {valid && <p className="hint">after your {TRIAL_DAYS}-day free trial</p>}
          <button className="btn btn-primary btn-xl" disabled={busy || !valid || !configured} onClick={() => go("/api/billing/checkout", { rooms: n })}>
            {busy ? "Opening checkout…" : `Start ${TRIAL_DAYS}-day free trial`}</button>
          {billing.hasCustomer && billing.status && <button className="btn btn-ghost" disabled={busy} onClick={() => go("/api/billing/portal")}>Past invoices</button>}
        </section>
      )}
      {err && <p className="form-err bill-big" role="alert">{err}</p>}
    </div>
  );
}

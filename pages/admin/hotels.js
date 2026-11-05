import Head from "next/head";
import { useState } from "react";
import Mark from "../../components/Mark";
import { SETUP_CSS } from "../../lib/setup-css";

// Owner-only: create a hotel + private edit link. ADMIN_KEY goes in the form / header, never the URL.
export default function AdminHotels() {
  const [adminKey, setAdminKey] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [created, setCreated] = useState(null);
  const [managerEmail, setManagerEmail] = useState("");
  const [managerPassword, setManagerPassword] = useState("");
  const [lHotelId, setLHotelId] = useState("");
  const [lEmail, setLEmail] = useState("");
  const [lPassword, setLPassword] = useState("");
  const [lBusy, setLBusy] = useState(false);
  const [lErr, setLErr] = useState("");
  const [lDone, setLDone] = useState(null);

  async function onSetLogin(e) {
    e.preventDefault();
    setLBusy(true); setLErr(""); setLDone(null);
    try {
      const r = await fetch("/api/admin/hotel-login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        body: JSON.stringify({ hotelId: lHotelId.trim(), email: lEmail, password: lPassword }),
      });
      const j = await r.json();
      if (!r.ok) { setLErr(j.error || "Could not set login"); return; }
      setLDone(j); setLPassword("");
    } catch {
      setLErr("Network error. Try again.");
    } finally {
      setLBusy(false);
    }
  }

  async function onCreate(e) {
    e.preventDefault();
    setBusy(true); setErr(""); setCreated(null);
    try {
      const r = await fetch("/api/admin/hotels", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        body: JSON.stringify({ name, managerEmail, managerPassword }),
      });
      const j = await r.json();
      if (!r.ok) { setErr(j.error || "Could not create hotel"); return; }
      setCreated(j);
      setName(""); setManagerPassword("");
    } catch {
      setErr("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page setup-page">
      <Head>
        <title>Create hotel · Cipher Concierge</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <style>{SETUP_CSS}</style>
      <nav className="nav" aria-label="Owner">
        <Mark size={30} /><span className="brand">CIPHER</span>
        <span className="spacer" />
        <span className="pill-label">Owner · create hotel</span>
      </nav>

      <h1 className="setup-h1">Create a hotel edit link</h1>
      <p className="setup-lede">
        Enter your owner key (not in the address bar). You get one private link for that hotel.
        Anyone with the link can fill in facts and print QR cards. Guests never see it.
      </p>

      <form className="setup-form glass" onSubmit={onCreate} autoComplete="off">
        <label className="field">
          <span>Owner key (ADMIN_KEY)</span>
          <input
            type="password"
            name="adminKey"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            required
            autoComplete="current-password"
            aria-required="true"
          />
        </label>
        <label className="field">
          <span>Hotel name</span>
          <input
            type="text"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. The River Inn"
            required
            maxLength={80}
            aria-required="true"
          />
        </label>
        <label className="field">
          <span>Hotel manager email (optional — creates their login)</span>
          <input type="email" name="managerEmail" value={managerEmail}
            onChange={(e) => setManagerEmail(e.target.value)} placeholder="gm@riverinn.com" maxLength={254} autoComplete="off" />
        </label>
        <label className="field">
          <span>Manager password (leave blank to generate one, min 10 characters)</span>
          <input type="text" name="managerPassword" value={managerPassword}
            onChange={(e) => setManagerPassword(e.target.value)} autoComplete="new-password" maxLength={128} />
        </label>
        {err && <p className="form-err" role="alert">{err}</p>}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create hotel + edit link"}
        </button>
      </form>

      {created && (
        <section className="glass created" aria-live="polite">
          <h2>Save this link now</h2>
          <p>It will not be shown again. Treat it like a password.</p>
          <p className="hotel-id">Hotel id: <code>{created.hotelId}</code></p>
          <label className="field">
            <span>Private edit link</span>
            <input type="text" readOnly value={created.editUrl} onFocus={(e) => e.target.select()} />
          </label>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => navigator.clipboard?.writeText(created.editUrl)}
          >
            Copy link
          </button>
          <a className="btn btn-primary" href={created.editUrl}>Open setup form →</a>
          {created.login && created.login.error && <p className="form-err" role="alert">{created.login.error}</p>}
          {created.login && !created.login.error && <LoginCard login={created.login} />}
        </section>
      )}

      <h2 className="setup-h1" style={{ fontSize: 28, marginTop: 40 }}>Set or reset a manager login</h2>
      <p className="setup-lede">For an existing hotel. Resetting signs the manager out everywhere. One email manages one hotel.</p>
      <form className="setup-form glass" onSubmit={onSetLogin} autoComplete="off">
        <label className="field"><span>Hotel id</span>
          <input type="text" name="hotelId" value={lHotelId} onChange={(e) => setLHotelId(e.target.value)} placeholder="the-river-inn" required /></label>
        <label className="field"><span>Manager email</span>
          <input type="email" name="email" value={lEmail} onChange={(e) => setLEmail(e.target.value)} required maxLength={254} /></label>
        <label className="field"><span>New password (blank = generate)</span>
          <input type="text" name="password" value={lPassword} onChange={(e) => setLPassword(e.target.value)} autoComplete="new-password" maxLength={128} /></label>
        {lErr && <p className="form-err" role="alert">{lErr}</p>}
        <button className="btn btn-primary" type="submit" disabled={lBusy}>{lBusy ? "Saving…" : "Set manager login"}</button>
      </form>
      {lDone && <section className="glass created" aria-live="polite"><LoginCard login={{ ...lDone, loginUrl: "/login" }} /></section>}
      <OwnerBilling adminKey={adminKey} />
    </div>
  );
}

function LoginCard({ login }) {
  const text = `Sign in: ${typeof window !== "undefined" ? window.location.origin : ""}/login\nEmail: ${login.email}\nPassword: ${login.password}`;
  return (
    <div>
      <h2>Manager login</h2>
      <p>Shown once. Send it to the manager privately (not in the same message as the edit link).</p>
      <label className="field"><span>Email</span><input type="text" readOnly value={login.email} /></label>
      <label className="field"><span>Password</span><input type="text" readOnly value={login.password} onFocus={(e) => e.target.select()} /></label>
      <button type="button" className="btn btn-ghost" onClick={() => navigator.clipboard?.writeText(text)}>Copy login details</button>
    </div>
  );
}

const money = (c) => (c == null ? "—" : `$${(c / 100).toFixed(2).replace(/\.00$/, "")}`);
const day = (d) => (d ? new Date(d).toLocaleDateString() : "");

function OwnerBilling({ adminKey }) {
  const [rows, setRows] = useState(null);
  const [configured, setConfigured] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [roomDraft, setRoomDraft] = useState({});

  async function call(body) {
    setErr("");
    const r = await fetch("/api/admin/billing", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-key": adminKey }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "Request failed");
    return j;
  }
  async function load() {
    setBusy("list");
    try { const j = await call({ action: "list" }); setRows(j.hotels); setConfigured(j.configured); } catch (e) { setErr(e.message); } finally { setBusy(""); }
  }
  async function act(hotelId, body) {
    setBusy(hotelId);
    try { const j = await call({ hotelId, ...body }); setRows((rs) => rs.map((r) => (r.id === hotelId ? j.hotel : r))); } catch (e) { setErr(e.message); } finally { setBusy(""); }
  }

  return (
    <section className="glass setup-form" style={{ marginTop: 28 }}>
      <h2 className="section-title" style={{ marginTop: 0 }}>Billing</h2>
      <p className="hint">$3/room/month, $99 minimum, 30-day trial. Founding = 50% off for 12 months (limited coupon redemptions). Comp = free, never paused.</p>
      <button className="btn btn-primary" type="button" onClick={load} disabled={!adminKey || busy === "list"}>{busy === "list" ? "Loading…" : rows ? "Refresh billing" : "Show billing for all hotels"}</button>
      {!configured && <p className="form-err">Stripe env vars are missing on this deployment.</p>}
      {err && <p className="form-err" role="alert">{err}</p>}
      {rows && rows.filter((r) => !r.sample).map((r) => (
        <div key={r.id} style={{ borderTop: "1px solid var(--glass-border)", paddingTop: 16, display: "grid", gap: 10 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{r.name} <code style={{ fontSize: 14 }}>{r.id}</code></div>
          <div style={{ fontSize: 17 }}>
            Status: <strong>{r.comp ? "comp" : r.status || "not started"}</strong>
            {r.trialEnd && r.status === "trialing" ? ` · trial ends ${day(r.trialEnd)}` : ""}
            {r.cancelAtPeriodEnd ? ` · cancels ${day(r.currentPeriodEnd)}` : ""}
            {" · "}Rooms: <strong>{r.rooms ?? "—"}</strong> · {money(r.monthlyCents)}/mo
            {" · "}Guests: <strong style={{ color: r.guestAccess ? "var(--lime)" : "#ffb4b4" }}>{r.guestAccess ? "on" : "paused"}</strong>
            {r.lastInvoice ? ` · last invoice: ${r.lastInvoice.status}` : ""}
          </div>
          <div className="btn-row">
            <label className="check"><input type="checkbox" checked={r.founding} disabled={busy === r.id} onChange={(e) => act(r.id, { action: "founding", founding: e.target.checked })} /> Founding (50% off 12 mo)</label>
            <label className="check"><input type="checkbox" checked={r.comp} disabled={busy === r.id} onChange={(e) => act(r.id, { action: "comp", comp: e.target.checked })} /> Comp</label>
            <input type="number" min={1} max={2000} placeholder="rooms" value={roomDraft[r.id] ?? ""} onChange={(e) => setRoomDraft({ ...roomDraft, [r.id]: e.target.value })}
              style={{ width: 110, minHeight: 48, fontSize: 18, borderRadius: 12, padding: "0 10px" }} aria-label={`Room count for ${r.name}`} />
            <button className="btn btn-ghost" type="button" disabled={busy === r.id || !roomDraft[r.id]} onClick={() => act(r.id, { action: "rooms", rooms: Number(roomDraft[r.id]) })}>Set rooms</button>
          </div>
        </div>
      ))}
      {rows && !rows.some((r) => !r.sample) && <p className="hint">No self-setup hotels yet.</p>}
    </section>
  );
}

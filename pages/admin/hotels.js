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

  async function onCreate(e) {
    e.preventDefault();
    setBusy(true); setErr(""); setCreated(null);
    try {
      const r = await fetch("/api/admin/hotels", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        body: JSON.stringify({ name }),
      });
      const j = await r.json();
      if (!r.ok) { setErr(j.error || "Could not create hotel"); return; }
      setCreated(j);
      setName("");
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
        </section>
      )}
    </div>
  );
}

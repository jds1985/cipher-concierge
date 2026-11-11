import Head from "next/head";
import { useState } from "react";
import Mark from "../components/Mark";
import { SETUP_CSS } from "../lib/setup-css";
import { sessionFromReq } from "../lib/auth";

export async function getServerSideProps({ req, res }) {
  res.setHeader("Cache-Control", "no-store");
  const s = await sessionFromReq(req);
  if (s) return { redirect: { destination: "/manage", permanent: false } };
  return { props: {} };
}

const CSS = `
.login-wrap{max-width:640px;margin:32px auto;padding:0 18px}
.login-wrap h1{font-size:40px;line-height:1.15;margin:18px 0 8px;color:#fff}
.login-wrap .lede{font-size:22px;color:#fff;margin:0 0 24px;line-height:1.4}
.login-form{display:grid;gap:22px;padding:28px;border-radius:18px;background:#000;border:4px solid #fff}
.login-form label{display:grid;gap:8px;font-size:22px;font-weight:700;color:#fff}
.login-form input{font-size:22px;padding:16px 14px;border-radius:12px;border:3px solid #fff;background:#fff;color:#060b1a;min-height:64px;width:100%;box-sizing:border-box}
.login-form input:focus{outline:4px solid #ffe14a;outline-offset:2px}
.login-form button{font-size:24px;font-weight:800;min-height:72px;border-radius:12px;border:4px solid #fff;background:#ffe14a;color:#000;cursor:pointer;text-align:left;padding:0 18px}
.login-form button:focus{outline:4px solid #fff;outline-offset:3px}
.login-form button[disabled]{opacity:.7}
.login-err{font-size:20px;background:#ffe3e3;color:#7a0010;border-radius:10px;padding:14px 16px;margin:0}
.login-help{font-size:20px;color:#fff;margin-top:22px;line-height:1.4}
.login-help a{color:#ffe14a}
.hp{position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden}
`;

export default function Signup() {
  const [hotelName, setHotelName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordAgain, setPasswordAgain] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelName, email, password, passwordAgain, website }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error || "Could not create the hotel."); return; }
      window.location.href = j.next || "/manage";
    } catch {
      setErr("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page setup-page">
      <Head>
        <title>Create your hotel · Cipher Concierge</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <style>{SETUP_CSS + CSS}</style>
      <nav className="nav" aria-label="Create a hotel"><Mark size={30} /><span className="brand">CIPHER</span></nav>
      <main className="login-wrap">
        <h1>Create your hotel</h1>
        <p className="lede">Make a manager login, then fill in what guests should hear. No owner key is needed.</p>
        <form className="login-form" onSubmit={onSubmit} noValidate>
          <label>Hotel name
            <input name="hotelName" value={hotelName} onChange={(e) => setHotelName(e.target.value)} required autoComplete="organization" autoFocus />
          </label>
          <label>Email
            <input type="email" name="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" inputMode="email" />
          </label>
          <label>Password
            <input type="password" name="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" minLength={10} />
          </label>
          <label>Password again
            <input type="password" name="passwordAgain" value={passwordAgain} onChange={(e) => setPasswordAgain(e.target.value)} required autoComplete="new-password" minLength={10} />
          </label>
          <label className="hp" aria-hidden="true">Website
            <input name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </label>
          {err && <p className="login-err" role="alert">{err}</p>}
          <button type="submit" disabled={busy}>{busy ? "Creating…" : "Create hotel and continue"}</button>
        </form>
        <p className="login-help">Already have a login? <a href="/login">Sign in</a>.</p>
      </main>
    </div>
  );
}

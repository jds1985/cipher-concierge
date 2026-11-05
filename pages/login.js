import Head from "next/head";
import { useState } from "react";
import Mark from "../components/Mark";
import { SETUP_CSS } from "../lib/setup-css";
import { sessionFromReq } from "../lib/auth";

export async function getServerSideProps({ req, res, query }) {
  res.setHeader("Cache-Control", "no-store");
  const s = await sessionFromReq(req);
  if (s) return { redirect: { destination: "/manage", permanent: false } };
  return { props: { signedOut: query.out === "1" } };
}

const LOGIN_CSS = `
.login-wrap{max-width:520px;margin:48px auto;padding:0 18px}
.login-wrap h1{font-size:40px;line-height:1.15;margin:18px 0 8px;color:#fff}
.login-wrap .lede{font-size:20px;color:#e8ecf7;margin:0 0 24px}
.login-form{display:grid;gap:22px;padding:28px;border-radius:18px}
.login-form label{display:grid;gap:8px;font-size:20px;font-weight:700;color:#fff}
.login-form input{font-size:22px;padding:16px 14px;border-radius:12px;border:2px solid #cfd6ea;background:#fff;color:#060b1a;min-height:56px}
.login-form input:focus{outline:4px solid #ffd54a;outline-offset:2px}
.login-form button{font-size:22px;font-weight:800;min-height:60px;border-radius:12px;border:0;background:#ffd54a;color:#060b1a;cursor:pointer}
.login-form button:focus{outline:4px solid #fff;outline-offset:2px}
.login-form button[disabled]{opacity:.7}
.login-err{font-size:19px;background:#ffe3e3;color:#7a0010;border-radius:10px;padding:12px 14px;margin:0}
.login-ok{font-size:19px;background:#e2f7e7;color:#0b4a1d;border-radius:10px;padding:12px 14px;margin:0}
.login-help{font-size:18px;color:#e8ecf7;margin-top:22px}
`;

export default function Login({ signedOut }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error || "Could not sign in."); return; }
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
        <title>Hotel sign in · Cipher Concierge</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <style>{SETUP_CSS + LOGIN_CSS}</style>
      <nav className="nav" aria-label="Hotel sign in"><Mark size={30} /><span className="brand">CIPHER</span></nav>
      <main className="login-wrap">
        <h1>Hotel sign in</h1>
        <p className="lede">Update your hotel's answers and print room QR cards.</p>
        <form className="login-form glass" onSubmit={onSubmit} noValidate>
          {signedOut && !err && <p className="login-ok" role="status">You are signed out.</p>}
          <label>Email
            <input type="email" name="email" autoComplete="username" inputMode="email" required
              value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </label>
          <label>Password
            <input type="password" name="password" autoComplete="current-password" required
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {err && <p className="login-err" role="alert">{err}</p>}
          <button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
        <p className="login-help">Forgot your password? Call or email Cipher CTS and we'll reset it. Your private edit link still works too.</p>
      </main>
    </div>
  );
}

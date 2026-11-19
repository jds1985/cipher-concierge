import Head from "next/head";
import Mark from "../../components/Mark";
import { TRIAL_DAYS } from "../../lib/pricing";

const CSS = `
.ok-wrap{max-width:720px;margin:40px auto;padding:0 18px}
.ok-card{background:#fff;color:#060b1a;border-radius:22px;padding:36px 28px;box-shadow:0 24px 60px rgba(0,0,0,.45)}
.ok-badge{display:inline-block;font:800 14px Inter;letter-spacing:.12em;text-transform:uppercase;background:#0b4a1d;color:#e2f7e7;padding:8px 14px;border-radius:999px;margin-bottom:18px}
.ok-wrap h1{font:800 clamp(34px,6vw,52px)/1.1 "Plus Jakarta Sans";color:#060b1a;margin:0 0 16px;letter-spacing:-.02em}
.ok-lede{font:600 22px/1.45 Inter;color:#1a2440;margin:0 0 18px}
.ok-body{font:500 20px/1.55 Inter;color:#243047;margin:0 0 14px}
.ok-note{font:600 19px/1.5 Inter;background:#fff6c8;color:#3a2f00;border:2px solid #e6c200;border-radius:14px;padding:16px 18px;margin:22px 0}
.ok-actions{display:flex;flex-wrap:wrap;gap:14px;margin-top:28px}
.ok-btn{display:inline-flex;align-items:center;justify-content:center;min-height:60px;padding:0 26px;border-radius:14px;font:800 20px "Plus Jakarta Sans";text-decoration:none;border:0}
.ok-btn-primary{background:#ffd54a;color:#060b1a}
.ok-btn-primary:focus{outline:4px solid #060b1a;outline-offset:2px}
.ok-btn-secondary{background:#060b1a;color:#fff}
.ok-btn-secondary:focus{outline:4px solid #ffd54a;outline-offset:2px}
.ok-nav{display:flex;align-items:center;gap:10px;margin-bottom:22px;color:#eaf1ff}
.ok-nav .brand{font:800 18px "Plus Jakarta Sans";letter-spacing:.12em}
`;

export default function BillingSuccess() {
  return (
    <div className="ok-wrap">
      <Head>
        <title>Trial started · Cipher Concierge</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <style>{CSS}</style>
      <div className="ok-nav" aria-label="Cipher">
        <Mark size={30} /><span className="brand">CIPHER</span>
      </div>
      <section className="ok-card" role="status" aria-live="polite">
        <span className="ok-badge">Trial started</span>
        <h1>Your {TRIAL_DAYS}-day free trial has started</h1>
        <p className="ok-lede">Thanks — your card is on file. You will not be charged until the trial ends.</p>
        <p className="ok-note">
          Guest QR scanning works now. Billing status on this page may take a few seconds to update while Stripe finishes activating your subscription (webhook).
        </p>
        <p className="ok-body">You can print room QR cards and let guests chat while that finishes. Refresh Billing in a moment to see “Free trial.”</p>
        <div className="ok-actions">
          <a className="ok-btn ok-btn-primary" href="/billing">View billing</a>
          <a className="ok-btn ok-btn-secondary" href="/manage">Hotel setup &amp; QR cards</a>
        </div>
      </section>
    </div>
  );
}

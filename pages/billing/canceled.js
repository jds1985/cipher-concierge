import Head from "next/head";
import Mark from "../../components/Mark";

const CSS = `
.cancel-wrap{max-width:720px;margin:40px auto;padding:0 18px}
.cancel-card{background:#fff;color:#060b1a;border-radius:22px;padding:36px 28px;box-shadow:0 24px 60px rgba(0,0,0,.45)}
.cancel-badge{display:inline-block;font:800 14px Inter;letter-spacing:.12em;text-transform:uppercase;background:#7a0010;color:#ffe3e3;padding:8px 14px;border-radius:999px;margin-bottom:18px}
.cancel-wrap h1{font:800 clamp(34px,6vw,48px)/1.1 "Plus Jakarta Sans";color:#060b1a;margin:0 0 16px;letter-spacing:-.02em}
.cancel-lede{font:600 22px/1.45 Inter;color:#1a2440;margin:0 0 18px}
.cancel-body{font:500 20px/1.55 Inter;color:#243047;margin:0 0 14px}
.cancel-actions{display:flex;flex-wrap:wrap;gap:14px;margin-top:28px}
.cancel-btn{display:inline-flex;align-items:center;justify-content:center;min-height:60px;padding:0 26px;border-radius:14px;font:800 20px "Plus Jakarta Sans";text-decoration:none;border:0}
.cancel-btn-primary{background:#ffd54a;color:#060b1a}
.cancel-btn-primary:focus{outline:4px solid #060b1a;outline-offset:2px}
.cancel-btn-secondary{background:#060b1a;color:#fff}
.cancel-btn-secondary:focus{outline:4px solid #ffd54a;outline-offset:2px}
.cancel-nav{display:flex;align-items:center;gap:10px;margin-bottom:22px;color:#eaf1ff}
.cancel-nav .brand{font:800 18px "Plus Jakarta Sans";letter-spacing:.12em}
`;

export default function BillingCanceled() {
  return (
    <div className="cancel-wrap">
      <Head>
        <title>Checkout canceled · Cipher Concierge</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <style>{CSS}</style>
      <div className="cancel-nav" aria-label="Cipher">
        <Mark size={30} /><span className="brand">CIPHER</span>
      </div>
      <section className="cancel-card" role="status" aria-live="polite">
        <span className="cancel-badge">No charge</span>
        <h1>Checkout was canceled</h1>
        <p className="cancel-lede">Nothing was charged. Your card was not saved for a Cipher Concierge subscription.</p>
        <p className="cancel-body">When you are ready, start the free trial again from Billing. Guests keep working as they do today until you subscribe.</p>
        <div className="cancel-actions">
          <a className="cancel-btn cancel-btn-primary" href="/billing">Back to billing</a>
          <a className="cancel-btn cancel-btn-secondary" href="/manage">Hotel setup</a>
        </div>
      </section>
    </div>
  );
}

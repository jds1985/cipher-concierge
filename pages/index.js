import Head from "next/head";
import Link from "next/link";
import Mark from "../components/Mark";

export async function getServerSideProps() { return { props: { demo: process.env.DEMO_MODE === "1" } }; }

const FAQ = [
  ["What time is checkout?", "Checkout is at **11:00 AM**."],
  ["It's 2 AM, is anything open?", "On-site dining is closed right now. Breakfast starts at 7:00 AM…"],
  ["I'm locked out of my room", "The front desk can make you a new key right away. [Call front desk]"],
];

export default function Home({ demo }) {
  return (
    <div className="page landing">
      <Head>
        <title>Cipher Concierge · The after-hours front desk for your hotel</title>
        <meta name="description" content="A private AI concierge guests reach by scanning the QR code in their room. Answers from your hotel's own information. No third-party AI." />
      </Head>
      <style>{`
        .landing .hero{display:grid;gap:36px;align-items:center;grid-template-columns:1.1fr .9fr;padding:30px 0 50px}
        .landing h1{font-size:clamp(32px,5.4vw,56px);line-height:1.05;letter-spacing:-.02em;margin:14px 0 18px}
        .landing .lede{font-size:clamp(16px,2vw,19px);color:var(--muted);line-height:1.6;max-width:560px}
        .landing .ctas{display:flex;gap:12px;flex-wrap:wrap;margin-top:26px}
        .phone{border-radius:34px;padding:16px;max-width:360px;margin:0 auto;width:100%}
        .phone .b{padding:10px 13px;border-radius:16px;font-size:14px;line-height:1.45;margin:8px 0}
        .phone .q{background:linear-gradient(135deg,rgba(21,87,240,.55),rgba(14,140,248,.45));border:1px solid rgba(110,170,255,.5);margin-left:18%}
        .phone .a{background:rgba(140,190,255,.07);border:1px solid var(--glass-border);margin-right:12%}
        .phone .a strong{color:#fff}
        .grid3{display:grid;gap:16px;grid-template-columns:repeat(3,1fr);margin:10px 0 50px}
        .tile{border-radius:22px;padding:22px}
        .tile h3{font-size:17px;margin:10px 0 8px}
        .tile p{color:var(--muted);line-height:1.55;font-size:14.5px}
        .num{font:800 13px "Plus Jakarta Sans";width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:var(--grad);color:#04122a}
        .sec-title{font-size:clamp(22px,3.4vw,32px);margin-bottom:16px}
        .tbd{display:inline-block;font:700 11px Inter;letter-spacing:.12em;padding:4px 10px;border-radius:999px;border:1px dashed var(--citron);color:var(--citron);margin-left:8px;vertical-align:middle}
        .foot{color:var(--dim);font-size:12.5px;line-height:1.6;border-top:1px solid var(--glass-border);padding-top:18px;margin-top:40px}
        @media (max-width:820px){.landing .hero,.grid3{grid-template-columns:1fr}}
      `}</style>
      <nav className="nav"><Mark size={34} /><span className="brand">CIPHER</span><span style={{ color: "var(--dim)", fontSize: 13 }}>Concierge</span><span className="spacer" />{demo && <Link className="btn btn-ghost" href="/demo" style={{ minHeight: 40 }}>Live demo</Link>}</nav>

      <section className="hero">
        <div>
          <span className="pill-label">For hotel general managers</span>
          <h1>The 2 AM front-desk call, <span className="grad-text">answered before it rings.</span></h1>
          <p className="lede">Guests scan the QR card in their room and ask: checkout time, Wi-Fi, "is anything open?", "where do I park?". Cipher answers instantly from <b>your hotel's own information</b>, and hands anything it can't answer straight to your front desk with one tap.</p>
          <div className="ctas">
            {demo && <Link className="btn btn-primary" href="/demo">Try it as a guest →</Link>}
            <a className="btn btn-ghost" href="#privacy">How privacy works</a>
          </div>
        </div>
        <div className="phone glass" aria-label="Example conversation">
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 4px 10px", borderBottom: "1px solid var(--glass-border)" }}><Mark size={26} small /><b style={{ font: "700 13px 'Plus Jakarta Sans'", letterSpacing: ".08em" }}>YOUR HOTEL</b><span style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)" }}>Room 304</span></div>
          {FAQ.map(([q, a]) => (<div key={q}><div className="b q">{q}</div><div className="b a" dangerouslySetInnerHTML={{ __html: a.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>") }} /></div>))}
        </div>
      </section>

      <h2 className="sec-title">How it works</h2>
      <div className="grid3">
        <div className="tile glass"><div className="num">1</div><h3>A QR card in every room</h3><p>Print branded cards from the admin page. Each code is signed for its room, so guests can't fake a room number. No app and no sign-up.</p></div>
        <div className="tile glass"><div className="num">2</div><h3>Answers from your facts</h3><p>Checkout, Wi-Fi, breakfast, parking, gym, pets, quiet hours and more are answered word-for-word from one hotel info file you control. It won't invent prices or hours.</p></div>
        <div className="tile glass"><div className="num">3</div><h3>Front desk, one tap away</h3><p>Lockouts, towels, noise, emergencies, or anything Cipher isn't sure about get a tap-to-call button for your front desk.</p></div>
      </div>

      <section id="privacy" className="tile glass" style={{ marginBottom: 40 }}>
        <span className="pill-label">Privacy · local-first</span>
        <h2 className="sec-title" style={{ marginTop: 10 }}>Intelligent systems. Zero data extraction.</h2>
        <p style={{ color: "var(--muted)", lineHeight: 1.65, maxWidth: 760 }}>Cipher Concierge runs on <b>Cipher 2.0</b>, Cipher CTS's own AI model, on servers run by Cipher CTS or on a small box at your property. No third-party AI service ever sees a guest's question. Conversations aren't stored or logged, the chat lives only in the guest's browser tab, and there are no trackers, analytics, or outside fonts. With the on-property option, guest questions never leave the building.</p>
      </section>

      <section className="tile glass">
        <h2 className="sec-title">Pricing <span className="tbd">TBD</span></h2>
        <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>Priced <b>per room, per month</b>. <i>Placeholder: final pricing to be announced. This is not a quote.</i></p>
      </section>

      <p className="foot">Demo: hotel names and details are sample data for illustration only. They haven't been confirmed by those hotels and don't imply any affiliation or endorsement. © 2026 Cipher CTS · ciphercts.com</p>
    </div>
  );
}

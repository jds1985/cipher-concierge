import Head from "next/head";
import Link from "next/link";
import { listHotels } from "../lib/hotels";
import { roomUrl } from "../lib/token";
import Mark from "../components/Mark";

// Public demo launcher. Enabled only when DEMO_MODE=1 (it hands out signed links for demo rooms).
export async function getServerSideProps() {
  if (process.env.DEMO_MODE !== "1") return { notFound: true };
  const hotels = listHotels().map((h) => ({ ...h, rooms: ["304", "412"].map((r) => ({ r, href: roomUrl("", h.id, r) })) }));
  return { props: { hotels } };
}
export default function Demo({ hotels }) {
  return (
    <div className="page">
      <Head><title>Live demo · Cipher Concierge</title></Head>
      <div className="nav"><Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, color: "inherit", textDecoration: "none" }}><Mark size={30} /><span className="brand">CIPHER</span></Link><span className="spacer" /><span className="pill-label">Live demo</span></div>
      <h1 style={{ fontSize: "clamp(26px,5vw,40px)", marginBottom: 10 }}>Try it as a guest</h1>
      <p style={{ color: "var(--muted)", maxWidth: 560, lineHeight: 1.6, marginBottom: 26 }}>These links act like scanning the QR card in a room. Ask what a guest would ask at 2 AM: checkout, Wi-Fi, "is anything open?", "I'm locked out", "extra towels". Hotel details are sample data for the demo and haven't been confirmed by the hotels.</p>
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))" }}>
        {hotels.map((h) => (
          <section key={h.id} className="glass" style={{ borderRadius: 22, padding: 22 }}>
            <h2 style={{ fontSize: 18, marginBottom: 14 }}>{h.name}</h2>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {h.rooms.map(({ r, href }) => <a key={r} className="btn btn-ghost" href={href}>Room {r} →</a>)}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

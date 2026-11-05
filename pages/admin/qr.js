import Head from "next/head";
import QRCode from "qrcode";
import { getHotel, listHotels, validRoom } from "../../lib/hotels";
import { roomUrl } from "../../lib/token";
import { adminOk, baseUrl } from "../../lib/admin";
import Mark from "../../components/Mark";

function expandRooms(spec) {
  const out = [];
  for (const part of String(spec || "").split(",").map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d{1,5})-(\d{1,5})$/);
    if (m) { for (let r = +m[1]; r <= +m[2] && out.length < 200; r++) out.push(String(r)); }
    else if (validRoom(part)) out.push(part);
  }
  return [...new Set(out)].slice(0, 200);
}

export async function getServerSideProps({ query, req }) {
  if (!adminOk(query.key)) return { notFound: true };
  const hotels = listHotels();
  const hotel = getHotel(query.hotel) || getHotel(hotels[0].id);
  const rooms = expandRooms(query.rooms || "301-304");
  const base = baseUrl(req);
  const cards = await Promise.all(rooms.map(async (room) => {
    const url = roomUrl(base, hotel.id, room);
    const svg = await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#060b1aff", light: "#ffffffff" } });
    return { room, url, svg };
  }));
  return { props: { hotels, hotel: { id: hotel.id, name: hotel.name, inRoom: hotel.frontDesk.inRoom }, rooms: query.rooms || "301-304", cards, keyParam: query.key || "" } };
}

export default function QR({ hotels, hotel, rooms, cards, keyParam }) {
  return (
    <div className="page qr-page">
      <Head><title>QR room cards · {hotel.name}</title></Head>
      <style>{`
        .qr-form{display:flex;flex-wrap:wrap;gap:10px;align-items:end;padding:16px;border-radius:18px;margin-bottom:22px}
        .qr-form label{display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--muted)}
        .qr-form select,.qr-form input{min-height:44px;padding:0 12px;border-radius:12px;border:1px solid var(--glass-border);background:rgba(6,11,26,.6);color:var(--text);font:15px Inter}
        .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:18px}
        .card{border-radius:22px;padding:22px 20px;text-align:center;background:linear-gradient(160deg,#0b1430,#060b1a);border:1px solid rgba(47,221,207,.35);position:relative;overflow:hidden;break-inside:avoid}
        .card::before{content:"";position:absolute;inset:0;background:radial-gradient(60% 40% at 0% 0%,rgba(21,87,240,.35),transparent 70%),radial-gradient(50% 40% at 100% 100%,rgba(140,239,96,.18),transparent 70%);pointer-events:none}
        .card>*{position:relative}
        .card .hn{font:700 13px "Plus Jakarta Sans";letter-spacing:.14em;margin-top:8px}
        .card .rm{font:800 30px "Plus Jakarta Sans";margin:2px 0 12px}
        .card .qr{background:#fff;border-radius:14px;padding:10px;width:180px;margin:0 auto}
        .card .qr svg{display:block;width:100%;height:auto}
        .card .cta{font:600 15px Inter;margin-top:14px}
        .card .sub{font-size:11.5px;color:var(--muted);margin-top:6px;line-height:1.45}
        .card .pw{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:12px;font-size:10.5px;color:var(--dim);letter-spacing:.08em}
        @media print{.nav,.qr-form,.wisps,.no-print{display:none!important}body{background:#fff}.page{padding:0;max-width:none}.cards{grid-template-columns:repeat(2,1fr);gap:12px}.card{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
      `}</style>
      <div className="nav"><Mark size={30} /><span className="brand">CIPHER</span><span className="spacer" /><span className="pill-label">Hotel admin · QR cards</span></div>
      <form className="qr-form glass" method="get">
        <input type="hidden" name="key" value={keyParam} />
        <label>Hotel<select name="hotel" defaultValue={hotel.id}>{hotels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
        <label>Rooms (e.g. 301-310, 412, PH1)<input name="rooms" defaultValue={rooms} /></label>
        <button className="btn btn-primary" type="submit">Generate</button>
        <button className="btn btn-ghost no-print" type="button" onClick={() => window.print()}>Print cards</button>
      </form>
      <p className="no-print" style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>Each QR code holds a signed link for one room. A guest can't change the room number in the link. To retire every printed card at once, rotate QR_KEY_VERSION.</p>
      <div className="cards">
        {cards.map((c) => (
          <article className="card" key={c.room}>
            <Mark size={44} />
            <div className="hn">{hotel.name.toUpperCase()}</div>
            <div className="rm">Room {c.room}</div>
            <div className="qr" role="img" aria-label={`QR code for room ${c.room}`} dangerouslySetInnerHTML={{ __html: c.svg }} />
            <div className="cta">Scan for your private concierge</div>
            <div className="sub">Checkout, Wi-Fi, dining, and more, any hour.<br />No app. No account. Nothing you type is stored.</div>
            <div className="pw"><Mark size={14} small /> POWERED BY CIPHER CTS</div>
          </article>
        ))}
      </div>
    </div>
  );
}

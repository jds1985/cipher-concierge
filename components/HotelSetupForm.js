import Head from "next/head";
import { useEffect, useState } from "react";
import Mark from "./Mark";
import { SETUP_CSS } from "../lib/setup-css";
import { layerTopicPreview } from "../lib/guest-facts";

function linesFromRecs(recs, kind) {
  return (recs || [])
    .filter((r) => r.kind === kind || (kind === "restaurant" && (!r.kind || r.kind === "restaurant")))
    .map((r) => (r.description && r.description !== "Restaurant nearby." && !r.description.startsWith("Coffee") && !r.description.startsWith("Bar")
      ? `${r.name} — ${r.description}` : r.name))
    .join("\n");
}

function formFromHotel(h) {
  if (!h) return emptyForm();
  const faqsText = (h.faqs || []).map((f) => `Q: ${f.q}\nA: ${f.a}`).join("\n\n");
  return {
    name: h.name || "",
    frontDeskPhone: h.frontDesk?.phoneDisplay || "",
    wifiNetwork: h.wifi?.network || "",
    wifiPassword: h.wifi?.password || "",
    wifiShowPassword: !!h.wifi?.showPassword,
    wifiNotes: h.wifi?.notes || "",
    checkIn: h.checkIn?.time || "3:00 PM",
    checkOut: h.checkOut?.time || "11:00 AM",
    lateCheckout: h.checkOut?.late || "",
    breakfastHours: h.breakfast?.hours || "",
    breakfastIncluded: h.breakfast?.included == null ? "" : h.breakfast.included ? "yes" : "no",
    breakfastLocation: h.breakfast?.location || "",
    parking: h.parking || "",
    pool: h.pool || "",
    gym: h.fitness || "",
    spa: h.spa || "",
    pets: h.pets || "",
    roomService: typeof h.roomService === "string" ? h.roomService : "",
    laundry: h.laundry || "",
    elevator: h.elevator || "",
    accessibleRooms: h.accessibleRooms || "",
    mobilityHelp: h.mobilityHelp || "",
    housekeeping: typeof h.housekeeping === "string" ? h.housekeeping : "",
    nearbyRestaurants: linesFromRecs(h.localRecommendations, "restaurant"),
    nearbyCoffee: linesFromRecs(h.localRecommendations, "coffee"),
    nearbyBars: linesFromRecs(h.localRecommendations, "bar"),
    faqs: faqsText,
    city: h.location?.city || "",
    area: h.location?.area || "",
    address: h.location?.address || "",
  };
}

function emptyForm() {
  return {
    name: "", frontDeskPhone: "", wifiNetwork: "", wifiPassword: "", wifiShowPassword: false, wifiNotes: "",
    checkIn: "3:00 PM", checkOut: "11:00 AM", lateCheckout: "",
    breakfastHours: "", breakfastIncluded: "", breakfastLocation: "",
    parking: "", pool: "", gym: "", spa: "", pets: "", roomService: "",
    nearbyRestaurants: "", nearbyCoffee: "", nearbyBars: "", faqs: "",
    city: "", area: "", address: "",
    laundry: "", elevator: "", accessibleRooms: "", mobilityHelp: "", housekeeping: "",
  };
}

export default function HotelSetupForm({ token, sessionMode = false, email = "", layerPreview = false }) {
  const auth = sessionMode ? {} : { token };
  const [form, setForm] = useState(emptyForm());
  const [hotelId, setHotelId] = useState("");
  const [loadErr, setLoadErr] = useState("");
  const [saveMsg, setSaveMsg] = useState("");
  const [saveErr, setSaveErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [rooms, setRooms] = useState("301-304");
  const [cards, setCards] = useState([]);
  const [qrErr, setQrErr] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/hotel/load", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(auth),
        });
        const j = await r.json();
        if (cancelled) return;
        if (!r.ok) {
          if (sessionMode && r.status === 401) { window.location.href = "/login"; return; }
          setLoadErr(j.error || "Invalid edit link"); return;
        }
        setHotelId(j.hotel.id);
        setForm(formFromHotel(j.hotel));
        setLoaded(true);
      } catch {
        if (!cancelled) setLoadErr("Could not load hotel. Check your connection.");
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function onSave(e) {
    e.preventDefault();
    setBusy(true); setSaveErr(""); setSaveMsg("");
    try {
      const r = await fetch("/api/hotel/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...auth, ...form }),
      });
      const j = await r.json();
      if (!r.ok) {
        setSaveErr((j.errors && j.errors.join(" ")) || j.error || "Save failed");
        return;
      }
      setSaveMsg("Saved. Guest answers update right away.");
      setForm(formFromHotel(j.hotel));
    } catch {
      setSaveErr("Network error while saving.");
    } finally {
      setBusy(false);
    }
  }

  async function onQr(e) {
    e.preventDefault();
    setQrErr(""); setCards([]);
    try {
      const r = await fetch("/api/hotel/qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...auth, rooms }),
      });
      const j = await r.json();
      if (!r.ok) { setQrErr(j.error || "Could not generate QR cards"); return; }
      setCards(j.cards || []);
    } catch {
      setQrErr("Network error while generating QR cards.");
    }
  }

  if (loadErr) {
    return (
      <div className="page setup-page">
        <Head><title>Setup · Cipher Concierge</title><meta name="robots" content="noindex,nofollow" /></Head>
        <style>{SETUP_CSS}</style>
        <nav className="nav"><Mark size={30} /><span className="brand">CIPHER</span></nav>
        <div className="center-card glass">
          <h1>Link not valid</h1>
          <p>{loadErr} Ask Cipher CTS for a new private edit link. One hotel can never open another hotel's link.</p>
        </div>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="page setup-page">
        <Head><title>Loading setup…</title><meta name="robots" content="noindex,nofollow" /></Head>
        <style>{SETUP_CSS}</style>
        <p className="setup-lede" style={{ marginTop: 40 }}>Loading your hotel form…</p>
      </div>
    );
  }

  return (
    <div className="page setup-page">
      <Head>
        <title>{form.name || "Hotel"} setup · Cipher Concierge</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <style>{SETUP_CSS}</style>
      <nav className="nav no-print" aria-label="Hotel setup">
        <Mark size={30} /><span className="brand">CIPHER</span>
        <span className="spacer" />
        <span className="pill-label">Hotel setup</span>
        {sessionMode && <a className="btn btn-ghost" href="/requests" style={{ marginLeft: 12 }}>Requests</a>}
        {sessionMode && <a className="btn btn-ghost" href="/usage" style={{ marginLeft: 12 }}>Usage</a>}
        {sessionMode && <a className="btn btn-ghost" href="/billing" style={{ marginLeft: 12 }}>Billing</a>}
        {sessionMode && (
          <form method="post" action="/api/auth/logout" style={{ marginLeft: 12 }}>
            <button className="btn btn-ghost" type="submit" title={email ? `Signed in as ${email}` : undefined}>Sign out</button>
          </form>
        )}
      </nav>

      {layerPreview && (
        <section className="hear-panel" aria-label="Facts the guest page will use">
          <style dangerouslySetInnerHTML={{ __html: ".hear-panel{background:#000;color:#fff;border:4px solid #ffe14a;padding:16px;margin:0 0 28px;font-size:22px;line-height:1.45;overflow-x:hidden;max-width:100%}.hear-panel h2{font-size:32px;line-height:1.2;margin:0 0 16px}.hear-panel p{font-size:22px;line-height:1.45;margin:0 0 12px;overflow-wrap:anywhere}.hear-panel article{display:block;border-top:4px solid #fff;margin-top:20px;padding-top:16px}.hear-panel h3{display:block;font-size:24px;line-height:1.3;margin:0 0 8px}.setup-page{overflow-x:hidden;max-width:100%}.setup-page .nav{flex-wrap:wrap;gap:8px}.setup-page .nav a,.setup-page .nav form{margin-left:0 !important}" }} />
          <h2>What guests will hear</h2>
          <p>These lines use the boxes already on this form. An empty box is not a fact. Saving still uses the same Save button.</p>
          {layerTopicPreview(form).map((row) => (
            <article key={row.label}>
              <h3>{row.label}</h3>
              <p>{row.hears}</p>
              {row.note ? <p>{row.note}</p> : null}
            </article>
          ))}
          <p>Leave a box empty when you do not have that information. Guests will be asked to call the front desk.</p>
        </section>
      )}
      <h1 className="setup-h1">Tell Cipher about your hotel</h1>
      <p className="setup-lede">
        Fill this out once. Guests who scan a room QR get answers from what you save here — no developer needed.
        Leave a box blank if you don't know; Cipher will send those questions to your front desk.
      </p>
      <p className="hint no-print">Hotel id: <code>{hotelId}</code> · Keep this page's link private.</p>

      <form className="setup-form glass no-print" onSubmit={onSave}>
        <h2 className="section-title" style={{ marginTop: 0 }}>Basics</h2>
        <label className="field"><span>Hotel name</span>
          <input value={form.name} onChange={(e) => set("name", e.target.value)} required maxLength={80} /></label>
        <div className="grid2">
          <label className="field"><span>City</span>
            <input value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="Knoxville, TN" maxLength={80} /></label>
          <label className="field"><span>Neighborhood / area</span>
            <input value={form.area} onChange={(e) => set("area", e.target.value)} placeholder="Market Square" maxLength={80} /></label>
        </div>
        <label className="field"><span>Street address</span>
          <input value={form.address || ""} onChange={(e) => set("address", e.target.value)} placeholder="12 Market Square" maxLength={160} /></label>
        <label className="field"><span>Front desk phone</span>
          <input value={form.frontDeskPhone} onChange={(e) => set("frontDeskPhone", e.target.value)} placeholder="(865) 555-0100" inputMode="tel" maxLength={40} /></label>

        <h2 className="section-title">Wi-Fi</h2>
        <div className="grid2">
          <label className="field"><span>Network name</span>
            <input value={form.wifiNetwork} onChange={(e) => set("wifiNetwork", e.target.value)} maxLength={64} /></label>
          <label className="field"><span>Password</span>
            <input value={form.wifiPassword} onChange={(e) => set("wifiPassword", e.target.value)} maxLength={64} autoComplete="off" /></label>
        </div>
        <label className="check">
          <input type="checkbox" checked={form.wifiShowPassword} onChange={(e) => set("wifiShowPassword", e.target.checked)} />
          <span>Show the Wi-Fi password to guests in chat. If unchecked, Cipher tells them to ask the front desk.</span>
        </label>
        <label className="field"><span>Wi-Fi notes (optional)</span>
          <input value={form.wifiNotes} onChange={(e) => set("wifiNotes", e.target.value)} placeholder="Join and accept the splash page terms" maxLength={280} /></label>

        <h2 className="section-title">Check-in & checkout</h2>
        <div className="grid2">
          <label className="field"><span>Check-in time</span>
            <input value={form.checkIn} onChange={(e) => set("checkIn", e.target.value)} maxLength={40} /></label>
          <label className="field"><span>Checkout time</span>
            <input value={form.checkOut} onChange={(e) => set("checkOut", e.target.value)} maxLength={40} /></label>
        </div>
        <label className="field"><span>Late checkout policy</span>
          <textarea value={form.lateCheckout} onChange={(e) => set("lateCheckout", e.target.value)} maxLength={500}
            placeholder="Late checkout is available on request, based on availability." /></label>

        <h2 className="section-title">Breakfast</h2>
        <div className="grid2">
          <label className="field"><span>Breakfast hours</span>
            <input value={form.breakfastHours} onChange={(e) => set("breakfastHours", e.target.value)} placeholder="7:00 AM to 10:00 AM" maxLength={40} /></label>
          <label className="field"><span>Is breakfast included?</span>
            <select value={form.breakfastIncluded} onChange={(e) => set("breakfastIncluded", e.target.value)}>
              <option value="">Not sure</option>
              <option value="yes">Yes, included</option>
              <option value="no">No, not included</option>
            </select>
          </label>
        </div>
        <label className="field"><span>Where is breakfast served?</span>
          <input value={form.breakfastLocation} onChange={(e) => set("breakfastLocation", e.target.value)} placeholder="Lobby restaurant" maxLength={400} /></label>

        <h2 className="section-title">Amenities</h2>
        <label className="field"><span>Parking</span>
          <textarea value={form.parking} onChange={(e) => set("parking", e.target.value)} placeholder="Valet $28/night; city garage across the street" maxLength={400} /></label>
        <label className="field"><span>Pool</span>
          <textarea value={form.pool} onChange={(e) => set("pool", e.target.value)} placeholder="Leave blank if none" maxLength={400} /></label>
        <label className="field"><span>Gym / fitness</span>
          <textarea value={form.gym} onChange={(e) => set("gym", e.target.value)} maxLength={400} /></label>
        <label className="field"><span>Spa</span>
          <textarea value={form.spa} onChange={(e) => set("spa", e.target.value)} maxLength={400} /></label>
        <label className="field"><span>Pets</span>
          <textarea value={form.pets} onChange={(e) => set("pets", e.target.value)} placeholder="Pet-friendly rooms on floors 2–3 with prior registration" maxLength={400} /></label>
        <label className="field"><span>Room service</span>
          <textarea value={form.roomService} onChange={(e) => set("roomService", e.target.value)} maxLength={400} /></label>
        <label className="field"><span>Laundry</span>
          <textarea value={form.laundry || ""} onChange={(e) => set("laundry", e.target.value)} placeholder="Floor 2, $4 a load. Leave blank if none." maxLength={400} /></label>
        <label className="field"><span>Elevators</span>
          <textarea value={form.elevator || ""} onChange={(e) => set("elevator", e.target.value)} placeholder="The elevator runs all night." maxLength={400} /></label>
        <label className="field"><span>Accessible rooms</span>
          <textarea value={form.accessibleRooms || ""} onChange={(e) => set("accessibleRooms", e.target.value)} placeholder="Accessible rooms are on the first floor." maxLength={400} /></label>
        <label className="field"><span>Mobility help</span>
          <textarea value={form.mobilityHelp || ""} onChange={(e) => set("mobilityHelp", e.target.value)} placeholder="A wheelchair is at the front desk." maxLength={400} /></label>
        <label className="field"><span>Housekeeping details</span>
          <textarea value={form.housekeeping || ""} onChange={(e) => set("housekeeping", e.target.value)} placeholder="Extra towels are at the front desk. Cleaning is 9:00 AM to 3:00 PM." maxLength={400} /></label>

        <h2 className="section-title">Nearby</h2>
        <p className="hint">One place per line. Optional: Name — short description</p>
        <label className="field"><span>Restaurants</span>
          <textarea value={form.nearbyRestaurants} onChange={(e) => set("nearbyRestaurants", e.target.value)}
            placeholder={"Tupelo Honey — Southern comfort food\nKabuki — sushi"} /></label>
        <label className="field"><span>Coffee shops</span>
          <textarea value={form.nearbyCoffee} onChange={(e) => set("nearbyCoffee", e.target.value)}
            placeholder="Pretentious Coffee — 3-minute walk" /></label>
        <label className="field"><span>Bars & lounges</span>
          <textarea value={form.nearbyBars} onChange={(e) => set("nearbyBars", e.target.value)}
            placeholder="Peter Kern Lounge — speakeasy cocktails" /></label>

        <h2 className="section-title">Extra FAQs</h2>
        <p className="hint">Optional. Format each as:<br />Q: Do you have a shuttle?<br />A: Yes, to the airport every hour.</p>
        <label className="field"><span>FAQs</span>
          <textarea value={form.faqs} onChange={(e) => set("faqs", e.target.value)} style={{ minHeight: 140 }} /></label>

        {saveErr && <p className="form-err" role="alert">{saveErr}</p>}
        {saveMsg && <p className="form-ok" role="status">{saveMsg}</p>}
        <div className="btn-row">
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save answers"}</button>
        </div>
      </form>

      <section className="qr-box glass">
        <h2>Print QR cards for your rooms</h2>
        <p className="no-print">Only rooms for <strong>{form.name}</strong>. Each code is signed so guests can't change the room number.</p>
        <form className="no-print" onSubmit={onQr} style={{ display: "grid", gap: 14 }}>
          <label className="field"><span>Room numbers or ranges</span>
            <input value={rooms} onChange={(e) => setRooms(e.target.value)} placeholder="301-310, 412, PH1" /></label>
          {qrErr && <p className="form-err" role="alert">{qrErr}</p>}
          <div className="btn-row">
            <button className="btn btn-primary" type="submit">Generate QR cards</button>
            {!!cards.length && <button className="btn btn-ghost" type="button" onClick={() => window.print()}>Print cards</button>}
          </div>
        </form>
        {!!cards.length && (
          <div className="cards">
            {cards.map((c) => (
              <article className="card" key={c.room}>
                <Mark size={44} />
                <div className="hn">{(form.name || "HOTEL").toUpperCase()}</div>
                <div className="rm">Room {c.room}</div>
                <div className="qr" role="img" aria-label={`QR code for room ${c.room}`} dangerouslySetInnerHTML={{ __html: c.svg }} />
                <div className="cta">Scan for your private concierge</div>
                <div className="sub">Checkout, Wi-Fi, dining, and more, any hour.<br />No app. No account.</div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

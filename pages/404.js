import Head from "next/head";
import Mark from "../components/Mark";
export default function NotFound() {
  return (
    <main className="center-card glass">
      <Head><title>Not found · Cipher Concierge</title></Head>
      <Mark size={56} />
      <h1>We couldn't find that page</h1>
      <p>If you're a guest, scan the QR code on the card in your room to open your hotel's concierge.</p>
    </main>
  );
}

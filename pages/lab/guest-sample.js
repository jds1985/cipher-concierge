import { cipherLayerGuestEnabled } from "../../lib/layer-flag";
import { roomUrl } from "../../lib/token";

// Preview-only door to The Oliver's real guest page. Production returns 404.
// The room token is signed on the server. The secret is not sent to the browser.
export async function getServerSideProps({ req }) {
  if (!cipherLayerGuestEnabled()) return { notFound: true };
  const proto = String(req.headers["x-forwarded-proto"] || "http").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  if (!host) return { notFound: true };
  return { redirect: { destination: roomUrl(`${proto}://${host}`, "the-oliver", "101"), permanent: false } };
}

export default function GuestSample() {
  return null;
}

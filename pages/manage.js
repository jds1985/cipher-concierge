import HotelSetupForm from "../components/HotelSetupForm";
import { sessionFromReq } from "../lib/auth";
import { cipherLayerGuestEnabled } from "../lib/layer-flag";

// Signed-in hotel manager's setup + QR page. The hotel comes from the session only.
export async function getServerSideProps({ req, res }) {
  res.setHeader("Cache-Control", "no-store");
  const s = await sessionFromReq(req);
  if (!s) return { redirect: { destination: "/login", permanent: false } };
  return { props: { email: s.email, layerPreview: cipherLayerGuestEnabled() } };
}

export default function Manage({ email, layerPreview = false }) {
  return <HotelSetupForm sessionMode email={email} layerPreview={layerPreview} />;
}

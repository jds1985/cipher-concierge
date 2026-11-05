import HotelSetupForm from "../../components/HotelSetupForm";

// Backup path: long private edit link. Hotel managers can also sign in at /login.
export async function getServerSideProps({ params }) {
  const token = typeof params.token === "string" ? params.token : "";
  if (!token || token.length < 20 || token.length > 80) return { notFound: true };
  return { props: { token } };
}

export default function HotelSetup({ token }) {
  return <HotelSetupForm token={token} />;
}

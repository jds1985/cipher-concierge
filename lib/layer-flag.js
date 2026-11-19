// Preview-only switch for the guest-page fact layer.
// Production ignores the variable. An unset variable stays off.
export function cipherLayerGuestEnabled(env = process.env) {
  if (env.VERCEL_ENV === "production") return false;
  return env.CIPHER_LAYER_GUEST === "1";
}

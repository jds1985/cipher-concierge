// Welcome note after a hotel signs up. Skipped when RESEND_API_KEY is unset.
// A send failure never throws, so sign-up still succeeds.
// The logo is the public Cipher CTS image already hosted on ciphercts.com.
// Email clients load PNG. The SVG lockup in this repo is not reliable in mail.

export const CIPHER_CTS_LOGO_URL = "https://ciphercts.com/og-image.png";

export function welcomeEmailConfigured(env = process.env) {
  return typeof env.RESEND_API_KEY === "string" && env.RESEND_API_KEY.startsWith("re_");
}

export function welcomeEmailContent({ hotelName, loginUrl, logoUrl = CIPHER_CTS_LOGO_URL }) {
  const name = String(hotelName || "your hotel").replace(/[<>&]/g, "");
  const href = String(loginUrl || "/login");
  const subject = "Welcome to Cipher Concierge";
  const text = [
    `Welcome. ${name} is ready.`,
    "",
    "Next step: open your hotel form and fill in what guests should hear.",
    "",
    `Log in: ${href}`,
  ].join("\n");
  const html = `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#000;color:#fff;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#000;">
    <tr><td style="padding:28px 18px;font-family:Arial,Helvetica,sans-serif;">
      <img src="${logoUrl}" width="320" alt="Cipher CTS" style="display:block;width:100%;max-width:320px;height:auto;border:0;background:#000;">
      <h1 style="margin:28px 0 12px;font-size:36px;line-height:1.2;color:#fff;">Welcome</h1>
      <p style="margin:0 0 18px;font-size:22px;line-height:1.45;color:#fff;">${name} is ready.</p>
      <p style="margin:0 0 28px;font-size:22px;line-height:1.45;color:#fff;">Next step: open your hotel form and fill in what guests should hear.</p>
      <a href="${href}" style="display:inline-block;background:#ffe14a;color:#000;font-size:24px;font-weight:800;text-decoration:none;padding:18px 22px;border-radius:12px;">Log in</a>
    </td></tr>
  </table>
</body>
</html>`;
  return { subject, text, html };
}

export async function sendWelcomeEmail({ to, hotelName, loginUrl, env = process.env, fetchImpl = fetch } = {}) {
  if (!welcomeEmailConfigured(env)) return { sent: false, reason: "not-configured" };
  const message = welcomeEmailContent({ hotelName, loginUrl });
  const from = env.WELCOME_FROM || "Cipher CTS <onboarding@resend.dev>";
  try {
    const r = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject: message.subject, html: message.html, text: message.text }),
    });
    if (!r.ok) {
      console.error("welcome email not sent", r.status);
      return { sent: false, reason: "error" };
    }
    return { sent: true, reason: "sent" };
  } catch (err) {
    console.error("welcome email failed", err?.message || "network");
    return { sent: false, reason: "error" };
  }
}

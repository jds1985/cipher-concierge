// POST /api/stripe/webhook — Stripe events. Signature-verified on the raw body; all fulfillment is here.
import { stripeClient, handleEvent } from "../../../lib/billing.js";

export const config = { api: { bodyParser: false } };

async function rawBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json({ error: "Webhook not configured" });
  let event;
  try {
    const buf = await rawBody(req);
    event = stripeClient().webhooks.constructEvent(buf, req.headers["stripe-signature"], secret);
  } catch {
    return res.status(400).json({ error: "Bad signature" });
  }
  try {
    const result = await handleEvent(event);
    return res.status(200).json({ received: true, result });
  } catch (e) {
    console.error("stripe webhook failed", event.type, event.id, e?.message);
    return res.status(500).json({ error: "Handler failed" }); // Stripe will retry
  }
}

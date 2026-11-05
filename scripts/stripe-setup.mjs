// One-time, idempotent: create Cipher Concierge Product, tiered Price ($99 floor + $3/room) and the
// founding coupon (50% off for 12 months). Refuses to run with a live key.
//   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.mjs
import Stripe from "stripe";
const key = process.env.STRIPE_SECRET_KEY;
if (!key || !key.startsWith("sk_test_")) { console.error("Set STRIPE_SECRET_KEY to a TEST key (sk_test_...)."); process.exit(1); }
const stripe = new Stripe(key);

const LOOKUP = "concierge_room_monthly_v1";
let product = (await stripe.products.search({ query: "metadata['app']:'cipher-concierge'" })).data[0];
if (!product) product = await stripe.products.create({
  name: "Cipher Concierge", description: "Private in-room AI concierge. $3 per room per month, $99 monthly minimum.",
  metadata: { app: "cipher-concierge" },
});
let price = (await stripe.prices.list({ lookup_keys: [LOOKUP], limit: 1 })).data[0];
if (!price) price = await stripe.prices.create({
  product: product.id, currency: "usd", lookup_key: LOOKUP, nickname: "Per room, $99 minimum",
  recurring: { interval: "month", usage_type: "licensed" },
  billing_scheme: "tiered", tiers_mode: "graduated",
  // First 33 rooms are covered by the $99 floor (33 x $3 = $99); each room after that is $3.
  tiers: [{ up_to: 33, flat_amount: 9900, unit_amount: 0 }, { up_to: "inf", unit_amount: 300 }],
  metadata: { app: "cipher-concierge" },
});
const COUPON = "CONCIERGE_FOUNDING_50";
let coupon;
try { coupon = await stripe.coupons.retrieve(COUPON); } catch {
  coupon = await stripe.coupons.create({
    id: COUPON, name: "Founding hotel: 50% off 12 months", percent_off: 50, duration: "repeating",
    duration_in_months: 12, max_redemptions: 10, metadata: { app: "cipher-concierge" },
  });
}
console.log(JSON.stringify({ product: product.id, price: price.id, coupon: coupon.id }, null, 2));

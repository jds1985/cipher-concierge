// Stripe subscription billing for hotels. One shared Stripe client instance; all fulfillment happens
// in the webhook (pages/api/stripe/webhook.js). Billing state lives in Redis at cc:v1:billing:<hotelId>.
//
// Pricing: one tiered Price (graduated): rooms 1-33 = $99 flat, each room after 33 = $3.
//   => monthly = max(rooms x $3, $99). Quantity on the subscription item = room count.
// Founding: coupon STRIPE_FOUNDING_COUPON_ID (50% off, repeating 12 months) => $1.50/room, $49.50 floor.
import Stripe from "stripe";
import { TRIAL_DAYS, MIN_ROOMS, MAX_ROOMS } from "./pricing.js";
export * from "./pricing.js";
import { STORE_PREFIX, kvGetJson, kvSetJson, getStoredHotel } from "./store.js";

let _client = null;
let _override = null;
/** Single Stripe client instance (reused across requests). */
export function stripeClient() {
  if (_override) return _override;
  if (_client) return _client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw Object.assign(new Error("Billing is not set up yet."), { status: 503 });
  _client = new Stripe(key, { appInfo: { name: "cipher-concierge" } });
  return _client;
}
/** Tests: inject a fake client. */
export function _setStripeClient(c) { _override = c; _client = null; }

export function billingConfigured() {
  return !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID_ROOM_MONTHLY);
}

export function cleanRooms(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < MIN_ROOMS || n > MAX_ROOMS) return null;
  return n;
}

const billKey = (id) => `${STORE_PREFIX}billing:${id}`;
const custKey = (cus) => `${STORE_PREFIX}billcust:${cus}`;
const evtKey = (id) => `${STORE_PREFIX}stripe-evt:${id}`;

export async function getBilling(hotelId) {
  const b = await kvGetJson(billKey(hotelId));
  return b && typeof b === "object" ? b : null;
}
export async function setBilling(hotelId, patch) {
  const cur = (await getBilling(hotelId)) || { hotelId };
  const next = { ...cur, ...patch, hotelId, updatedAt: new Date().toISOString() };
  await kvSetJson(billKey(hotelId), next);
  if (next.customerId) await kvSetJson(custKey(next.customerId), hotelId);
  return next;
}
export async function hotelIdForCustomer(cus) {
  if (!cus) return null;
  const id = await kvGetJson(custKey(cus));
  return typeof id === "string" ? id : null;
}

// Guest access + QR printing are allowed while trialing / active / past_due (Stripe is still retrying).
const ALLOWED = new Set(["trialing", "active", "past_due"]);
/**
 * { ok, reason }. File (sample) hotels and hotels Jim marked "comp" always pass.
 * A hotel with no subscription yet passes unless BILLING_REQUIRED=on (so existing hotels don't go dark).
 */
export async function guestAccess(hotelId, { isFile = false } = {}) {
  if (isFile) return { ok: true, reason: "sample" };
  const b = await getBilling(hotelId);
  if (b?.comp) return { ok: true, reason: "comp" };
  if (!b?.status) return process.env.BILLING_REQUIRED === "on" ? { ok: false, reason: "no-subscription" } : { ok: true, reason: "not-started" };
  return ALLOWED.has(b.status) ? { ok: true, reason: b.status } : { ok: false, reason: b.status };
}

/** Pull the live subscription from Stripe and store its status (handles out-of-order webhooks). */
export async function syncSubscription(subOrId, hintHotelId) {
  const stripe = stripeClient();
  const sub = typeof subOrId === "string" ? await stripe.subscriptions.retrieve(subOrId) : subOrId;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  const hotelId = sub.metadata?.hotelId || hintHotelId || (await hotelIdForCustomer(customerId));
  if (!hotelId) return null;
  const item = sub.items?.data?.[0];
  const periodEnd = item?.current_period_end ?? sub.current_period_end ?? null;
  return setBilling(hotelId, {
    customerId,
    subscriptionId: sub.id,
    status: sub.status,
    rooms: item?.quantity ?? null,
    itemId: item?.id ?? null,
    trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    discounted: !!(sub.discounts?.length || sub.discount),
  });
}

/** Webhook fulfillment. Returns a short string describing what happened. */
export async function handleEvent(event) {
  // Idempotency: Stripe may deliver an event more than once.
  if (await kvGetJson(evtKey(event.id))) return "duplicate";
  const o = event.data.object;
  let out = "ignored";
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      if (o.mode === "subscription" && o.subscription) {
        const hotelId = o.client_reference_id || o.metadata?.hotelId;
        if (hotelId && o.customer) await setBilling(hotelId, { customerId: o.customer });
        await syncSubscription(o.subscription, hotelId);
        out = "synced";
      }
      break;
    case "checkout.session.async_payment_failed":
      break;
    default:
      if (event.type.startsWith("customer.subscription.")) {
        // Re-fetch unless deleted (a deleted subscription can still be retrieved, but the object is final).
        await syncSubscription(event.type === "customer.subscription.deleted" ? o : o.id);
        out = "synced";
      } else if (event.type.startsWith("invoice.")) {
        const subId = o.parent?.subscription_details?.subscription || o.subscription;
        const hotelId = o.parent?.subscription_details?.metadata?.hotelId || (await hotelIdForCustomer(o.customer));
        if (hotelId) {
          await setBilling(hotelId, { lastInvoice: { id: o.id, status: o.status, event: event.type, amountDue: o.amount_due, at: new Date().toISOString() } });
          if (subId) await syncSubscription(typeof subId === "string" ? subId : subId.id, hotelId);
          out = "synced";
        }
      }
  }
  await kvSetJson(evtKey(event.id), 1, 60 * 60 * 24 * 7);
  return out;
}

/** Manager starts a subscription (Checkout, 30-day trial, optional founding coupon). */
export async function createCheckout({ hotelId, email, rooms, baseUrl }) {
  const stripe = stripeClient();
  const hotel = await getStoredHotel(hotelId);
  if (!hotel) throw Object.assign(new Error("Hotel not found."), { status: 404 });
  const b = (await getBilling(hotelId)) || {};
  if (b.subscriptionId && ["trialing", "active", "past_due", "unpaid", "incomplete"].includes(b.status)) {
    throw Object.assign(new Error("This hotel already has a subscription. Use Manage billing."), { status: 409 });
  }
  let customerId = b.customerId;
  if (!customerId) {
    const c = await stripe.customers.create({ email, name: hotel.name, metadata: { hotelId } });
    customerId = c.id;
    await setBilling(hotelId, { customerId });
  }
  const base = baseUrl.replace(/\/$/, "");
  const params = {
    mode: "subscription",
    customer: customerId,
    client_reference_id: hotelId,
    line_items: [{ price: process.env.STRIPE_PRICE_ID_ROOM_MONTHLY, quantity: rooms }],
    subscription_data: {
      trial_period_days: TRIAL_DAYS,
      metadata: { hotelId },
      trial_settings: { end_behavior: { missing_payment_method: "pause" } },
    },
    metadata: { hotelId },
    success_url: `${base}/billing/success`,
    cancel_url: `${base}/billing/canceled`,
  };
  if (b.founding && process.env.STRIPE_FOUNDING_COUPON_ID) params.discounts = [{ coupon: process.env.STRIPE_FOUNDING_COUPON_ID }];
  const session = await stripe.checkout.sessions.create(params, { idempotencyKey: `co:${hotelId}:${rooms}:${b.founding ? 1 : 0}:${Math.floor(Date.now() / 60000)}` });
  return session.url;
}

export async function createPortal({ hotelId, baseUrl }) {
  const b = await getBilling(hotelId);
  if (!b?.customerId) throw Object.assign(new Error("Start a subscription first."), { status: 400 });
  const s = await stripeClient().billingPortal.sessions.create({ customer: b.customerId, return_url: `${baseUrl.replace(/\/$/, "")}/billing` });
  return s.url;
}

/** Owner: change room count on a live subscription (prorated) or just store it for checkout. */
export async function ownerSetRooms(hotelId, rooms) {
  const b = (await getBilling(hotelId)) || {};
  if (b.subscriptionId && b.itemId && !["canceled", "incomplete_expired"].includes(b.status)) {
    await stripeClient().subscriptions.update(b.subscriptionId, { items: [{ id: b.itemId, quantity: rooms }] });
    return syncSubscription(b.subscriptionId, hotelId);
  }
  return setBilling(hotelId, { plannedRooms: rooms });
}

/** Owner: founding flag. Applies the coupon to an existing subscription too. */
export async function ownerSetFounding(hotelId, founding) {
  const b = (await getBilling(hotelId)) || {};
  const next = await setBilling(hotelId, { founding: !!founding });
  if (b.subscriptionId && !["canceled", "incomplete_expired"].includes(b.status) && process.env.STRIPE_FOUNDING_COUPON_ID) {
    await stripeClient().subscriptions.update(b.subscriptionId, {
      discounts: founding ? [{ coupon: process.env.STRIPE_FOUNDING_COUPON_ID }] : [],
    });
    return syncSubscription(b.subscriptionId, hotelId);
  }
  return next;
}

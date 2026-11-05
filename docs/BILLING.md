# Billing (Stripe subscriptions)

## Pricing (locked by Jim)
- $3 per room per month, $99 monthly minimum → `max(rooms × $3, $99)`
- 30-day free trial (card collected up front in Checkout)
- Founding: 50% off for 12 months ($1.50/room, $49.50 min) in exchange for a testimonial; limited spots

## Stripe objects (created by `scripts/stripe-setup.mjs`, idempotent, refuses live keys)
| Object | TEST id | Notes |
|---|---|---|
| Product "Cipher Concierge" | `prod_VZRfUNafQZc7Xy` | metadata app=cipher-concierge |
| Price (lookup `concierge_room_monthly_v1`) | `price_1UYImcGaPHVrWQA4InxC6R6O` | monthly, licensed, **graduated tiers**: rooms 1–33 = $99 flat; each room above 33 = $3. Quantity = room count, so the $99 floor is built into the price. |
| Coupon | `CONCIERGE_FOUNDING_50` | 50% off, `repeating` 12 months, `max_redemptions` 10 (= founding spots) |

**How founding half-off is applied:** a coupon, not a second price. Jim ticks "Founding" for a hotel on `/admin/hotels`.
If the hotel has not subscribed yet, Checkout gets `discounts: [{coupon}]`. If it already has a subscription, the coupon is
applied to that subscription immediately. Unticking removes it. Note: a repeating coupon's 12 months start when the
subscription is created, so the 30-day trial uses up month 1 (11 paid half-off months). If Jim wants 12 *paid* months,
create a 13-month coupon and point `STRIPE_FOUNDING_COUPON_ID` at it.

For live mode run: `STRIPE_SECRET_KEY=sk_live_... node scripts/stripe-setup.mjs` after removing the test-key guard deliberately (or create the same objects in the Dashboard).

## Flow
1. Manager signs in → `/billing` → enters room count (live price shown) → **Start 30-day free trial** → Stripe Checkout (`mode=subscription`, `trial_period_days=30`, no `payment_method_types`; Dashboard controls payment methods).
2. Fulfillment happens only in `POST /api/stripe/webhook` (signature-verified, raw body, event-id idempotency).
   Every subscription-related event re-fetches the subscription from Stripe, so out-of-order delivery is safe.
   Stored at Redis `cc:v1:billing:<hotelId>`: customerId, subscriptionId, status, rooms, trialEnd, currentPeriodEnd, cancelAtPeriodEnd, founding, comp, lastInvoice.
3. `/billing` → **Manage billing** opens the Stripe customer portal (update card, invoices, cancel).
4. Guest access (`/stay`, `/api/chat`, `/api/factpack`) and QR printing allowed when status is `trialing`, `active`, or `past_due` (Stripe still retrying), or the hotel is **Comp**.
   `unpaid`, `canceled`, `paused`, `incomplete*` → guests see "Cipher is taking a short break… call the front desk" with the call button.
   Hotels with no subscription yet stay ON unless `BILLING_REQUIRED=on`. Sample (file) hotels are never gated.
5. Owner (`/admin/hotels` → Billing): see status/rooms/$/guest access per hotel, toggle Founding / Comp, set room count (prorated update on a live subscription).

## Webhook events to enable on the endpoint `https://<host>/api/stripe/webhook`
checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed,
customer.subscription.created/updated/deleted/paused/resumed/trial_will_end, invoice.paid, invoice.payment_failed,
invoice.payment_succeeded, invoice.finalized, invoice.upcoming (or just `customer.subscription.*` + `invoice.*`).

Recommended Stripe Dashboard settings: Billing → Subscriptions → after all retries fail, **mark subscription unpaid**
(so guests pause but the subscription can recover when the card is fixed). Customer portal: allow payment-method update,
invoice history, cancellation.

## Env vars
| Var | Where | Value |
|---|---|---|
| `STRIPE_SECRET_KEY` | server | `sk_test_…` (Preview/Dev), `sk_live_…` (Production, later) |
| `STRIPE_WEBHOOK_SECRET` | server | `whsec_…` from the endpoint for that environment |
| `STRIPE_PRICE_ID_ROOM_MONTHLY` | server | price id above (live id differs) |
| `STRIPE_FOUNDING_COUPON_ID` | server | `CONCIERGE_FOUNDING_50` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | optional | `pk_test_…`; not used today (Checkout is a hosted redirect) |
| `BILLING_REQUIRED` | optional | `on` = hotels must subscribe before guests can use Cipher |

## Test (TEST mode)
Card `4242 4242 4242 4242`, any future expiry, any CVC/ZIP. Decline after trial: `4000 0000 0000 0341` (attaches, then fails).
Use a Stripe test clock or `stripe trigger` to move past the trial.

// Pure pricing helpers (safe to import in browser code; no Stripe SDK here).
export const TRIAL_DAYS = 30;
export const MIN_ROOMS = 1;
export const MAX_ROOMS = 2000;
export const PRICE_PER_ROOM_CENTS = 300;
export const MIN_MONTHLY_CENTS = 9900;
export function monthlyCents(rooms, founding = false) {
  const base = Math.max(rooms * PRICE_PER_ROOM_CENTS, MIN_MONTHLY_CENTS);
  return founding ? Math.round(base / 2) : base;
}
export const dollars = (c) => `$${(c / 100).toFixed(2).replace(/\.00$/, "")}`;
export const PAUSED_MESSAGE = "Cipher is taking a short break at this hotel. Please call or visit the front desk — they're happy to help.";

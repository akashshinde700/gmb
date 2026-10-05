// WebSetu — free trial length.
//
// One source of truth for both the subscription logic and the marketing copy:
// the number was previously hardcoded in fifteen places, so changing it meant
// the pricing page and the actual trial could disagree.
//
// NEXT_PUBLIC_ so the same value reaches the client bundle. It is inlined at
// build time, so changing it requires a rebuild — which is what a deploy does.

const DEFAULT_TRIAL_DAYS = 3;

export const TRIAL_DAYS: number = (() => {
  const raw = Number(process.env.NEXT_PUBLIC_TRIAL_DAYS ?? DEFAULT_TRIAL_DAYS);
  if (!Number.isFinite(raw) || raw < 0 || raw > 365) return DEFAULT_TRIAL_DAYS;
  return Math.trunc(raw);
})();

/** "3-day free trial" — for headlines and buttons. */
export const TRIAL_LABEL = `${TRIAL_DAYS}-day free trial`;

/** "3 days" — for sentences that already say "trial". */
export const TRIAL_DAYS_LABEL = `${TRIAL_DAYS} day${TRIAL_DAYS === 1 ? "" : "s"}`;

/** When a trial started now would end. */
export function trialEndsAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * A plan with no price is a "Custom"/Enterprise tier — quoted per customer, not
 * bought from the site. It is offered as an enquiry, never as a checkout, and
 * the subscribe endpoint refuses it too so a crafted request cannot activate a
 * priceless plan for free.
 */
export function isQuoteOnlyPlan(plan: { priceMonthly: number; priceYearly: number }): boolean {
  return plan.priceMonthly <= 0 && plan.priceYearly <= 0;
}

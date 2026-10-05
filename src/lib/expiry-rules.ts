// WebSetu — subscription entitlement rules, kept free of database imports so
// they can be unit-tested (and reused client-side) without a Prisma client.

/**
 * Days a paid subscription keeps serving after its renewal date passes. Payment
 * is collected out of band today, so cutting a paying customer off the moment
 * the date rolls over would take a live business website down over a bank delay.
 */
export const GRACE_DAYS: number = (() => {
  const raw = Number(process.env.SUBSCRIPTION_GRACE_DAYS ?? 5);
  if (!Number.isFinite(raw) || raw < 0 || raw > 90) return 5;
  return Math.trunc(raw);
})();

export const DAY_MS = 24 * 60 * 60 * 1000;

export interface SubscriptionDates {
  status: string;
  trialEndsAt?: Date | null;
  renewsAt?: Date | null;
}

/**
 * Whether a subscription still entitles the tenant to a public website.
 *
 * The sweep that persists these transitions is throttled, so between runs a
 * trial can be minutes past its end date while its row still says TRIALING.
 * Public gates therefore check the clock directly instead of trusting the
 * stored status — a site must go dark on the date it was sold as going dark,
 * not on the next sweep.
 */
export function subscriptionServesSite(
  sub: SubscriptionDates | null | undefined,
  now: Date = new Date(),
): boolean {
  // No subscription row at all is an older account; those stay visible.
  if (!sub) return true;
  if (sub.status === "EXPIRED" || sub.status === "CANCELED") return false;
  if (sub.status === "TRIALING") return !sub.trialEndsAt || sub.trialEndsAt > now;
  if (sub.status === "PAST_DUE") {
    if (!sub.renewsAt) return true;
    return sub.renewsAt.getTime() + GRACE_DAYS * DAY_MS > now.getTime();
  }
  return true;
}

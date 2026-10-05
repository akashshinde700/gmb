// WebSetu — appearance allowance rules (pure, no database).
//
// Kept apart from the database helper so the rules can be unit tested without a
// Prisma client or the "@/..." path alias.

export interface AppearanceAllowance {
  /** How many changes have been used against the allowance. */
  used: number;
  /** Total allowed; -1 means unlimited. */
  limit: number;
  /** Whether another change is permitted right now. */
  canChange: boolean;
  /** True when the plan is paid and active — no counting at all. */
  unlimited: boolean;
  /** Changes left; -1 when unlimited (JSON has no Infinity). */
  remaining: number;
}

export interface BusinessAllowanceRow {
  themeChangesUsed: number;
  subscription: {
    status: string;
    plan: { maxThemeChanges: number; priceMonthly: number; priceYearly: number } | null;
  } | null;
}

/**
 * Restyling is unlimited for every customer, trial included. The only way to
 * meter it is an explicit `maxThemeChanges` set on a plan by an admin.
 */
export function allowanceFor(business: BusinessAllowanceRow): AppearanceAllowance {
  const planLimit = business.subscription?.plan?.maxThemeChanges ?? -1;
  const limit = planLimit >= 0 ? planLimit : -1;
  const unlimited = limit < 0;

  const used = business.themeChangesUsed ?? 0;
  return {
    used,
    limit,
    canChange: unlimited || used < limit,
    unlimited,
    remaining: unlimited ? -1 : Math.max(0, limit - used),
  };
}

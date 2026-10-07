// WebSetu — appearance change allowance (database side).
//
// Customers can restyle their site a limited number of times on a free/trial
// plan, then the feature becomes part of a paid plan. The count is enforced on
// the server: hiding the controls in the dashboard would only stop the honest.
// The rules themselves live in appearance-rules.ts so they can be unit tested.

import { db } from "@/lib/db";
import { HttpError } from "@/lib/api";
import { allowanceFor, type AppearanceAllowance } from "@/lib/appearance-rules";

export { allowanceFor } from "@/lib/appearance-rules";
export type { AppearanceAllowance, BusinessAllowanceRow } from "@/lib/appearance-rules";

/** The row shape `allowanceFor` needs; one place so both reads agree. */
const ALLOWANCE_SELECT = {
  themeChangesUsed: true,
  subscription: {
    select: {
      status: true,
      plan: { select: { maxThemeChanges: true, priceMonthly: true, priceYearly: true } },
    },
  },
} as const;

function exhausted(limit: number): HttpError {
  return new HttpError(
    `You have used all ${limit} free design changes. Upgrade your plan to keep restyling your website.`,
    402,
  );
}

/**
 * Consume one appearance change, or refuse with a 402 telling the customer what
 * to do next. Call this only when the request actually changes how the site
 * looks — saving the same colours again must not cost an allowance.
 *
 * The claim is a conditional `updateMany`, not read-then-write: two tabs (or a
 * double-click that slips past the button's own guard) used to be able to both
 * read `used = limit - 1`, both pass the check, and both increment — one change
 * more than the plan allows, and no error anywhere. The same shape is used for
 * the coupon claim in billing.ts. A losing writer matches zero rows: the row is
 * re-read once, which either reports the exhausted allowance honestly or
 * retries against the count as it is now.
 */
export async function consumeThemeChange(businessId: string): Promise<AppearanceAllowance> {
  for (let attempt = 0; ; attempt++) {
    const business = await db.business.findUnique({
      where: { id: businessId },
      select: ALLOWANCE_SELECT,
    });
    if (!business) throw new HttpError("No business found", 404);

    const allowance = allowanceFor(business);
    // Paid-and-active plans never count, so there is nothing to claim.
    if (allowance.unlimited) return allowance;
    if (!allowance.canChange) throw exhausted(allowance.limit);

    const claim = await db.business.updateMany({
      where: { id: businessId, themeChangesUsed: { lt: allowance.limit } },
      data: { themeChangesUsed: { increment: 1 } },
    });
    if (claim.count === 0) {
      // Somebody else took the last one, or the plan changed under us. One more
      // pass decides on the row as it is now; a second loss is the answer.
      if (attempt < 1) continue;
      const fresh = await db.business.findUnique({ where: { id: businessId }, select: ALLOWANCE_SELECT });
      throw exhausted(fresh ? allowanceFor(fresh).limit : allowance.limit);
    }

    const used = await db.business
      .findUniqueOrThrow({ where: { id: businessId }, select: { themeChangesUsed: true } })
      .then((row) => row.themeChangesUsed);
    return {
      ...allowance,
      used,
      canChange: used < allowance.limit,
      remaining: Math.max(0, allowance.limit - used),
    };
  }
}

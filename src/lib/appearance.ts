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

/**
 * Consume one appearance change, or refuse with a 402 telling the customer what
 * to do next. Call this only when the request actually changes how the site
 * looks — saving the same colours again must not cost an allowance.
 */
export async function consumeThemeChange(businessId: string): Promise<AppearanceAllowance> {
  const business = await db.business.findUnique({
    where: { id: businessId },
    select: {
      themeChangesUsed: true,
      subscription: {
        select: {
          status: true,
          plan: { select: { maxThemeChanges: true, priceMonthly: true, priceYearly: true } },
        },
      },
    },
  });
  if (!business) throw new HttpError("No business found", 404);

  const allowance = allowanceFor(business);
  if (!allowance.canChange) {
    throw new HttpError(
      `You have used all ${allowance.limit} free design changes. Upgrade your plan to keep restyling your website.`,
      402,
    );
  }
  if (allowance.unlimited) return allowance;

  const updated = await db.business.update({
    where: { id: businessId },
    data: { themeChangesUsed: { increment: 1 } },
    select: { themeChangesUsed: true },
  });
  const used = updated.themeChangesUsed;
  return {
    ...allowance,
    used,
    canChange: used < allowance.limit,
    remaining: Math.max(0, allowance.limit - used),
  };
}

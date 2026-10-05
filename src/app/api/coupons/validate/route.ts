import { db } from "@/lib/db";
import { limitSubjectOrThrow, ok, readJson, requireUser, route } from "@/lib/api";

/**
 * POST /api/coupons/validate — check a coupon code and return the discount.
 * Sign-in + rate limiting are required: the endpoint is otherwise a free oracle
 * for enumerating valid promo codes.
 */
export const POST = route(async (req: Request) => {
  const session = await requireUser(req);
  limitSubjectOrThrow(`coupon:${session.id}`, 20, 10 * 60 * 1000);

  const body = await readJson<{ code?: string; amount?: number }>(req);
  const code = String(body.code || "").trim().toUpperCase().slice(0, 40);
  const rawAmount = Number(body.amount);
  const amount = Number.isFinite(rawAmount) && rawAmount > 0 ? rawAmount : 0;

  const invalid = { valid: false, message: "Invalid or expired coupon code" };
  if (!code) return ok(invalid);

  const coupon = await db.coupon.findUnique({ where: { code } });
  if (
    !coupon ||
    !coupon.active ||
    (coupon.expiresAt && coupon.expiresAt < new Date()) ||
    coupon.usedCount >= coupon.maxUses
  ) {
    return ok(invalid);
  }

  const discount =
    coupon.type === "PERCENT" ? Math.round(amount * (coupon.value / 100)) : Math.min(coupon.value, amount);

  return ok({
    valid: true,
    code: coupon.code,
    type: coupon.type,
    value: coupon.value,
    discount,
    finalAmount: Math.max(0, amount - discount),
    description: coupon.description,
  });
});

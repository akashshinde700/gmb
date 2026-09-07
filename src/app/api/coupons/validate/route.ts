import { db } from "@/lib/db";
import { ok } from "@/lib/auth";

/** POST /api/coupons/validate — check a coupon code and return the discount */
export async function POST(req: Request) {
  const body = (await req.json()) as { code?: string; amount?: number };
  const code = (body.code || "").trim().toUpperCase();
  const amount = Number(body.amount || 0);

  const coupon = await db.coupon.findUnique({ where: { code } });
  if (!coupon || !coupon.active || (coupon.expiresAt && coupon.expiresAt < new Date()) || coupon.usedCount >= coupon.maxUses) {
    return ok({ valid: false, message: "Invalid or expired coupon code" });
  }
  const discount = coupon.type === "PERCENT"
    ? Math.round(amount * (coupon.value / 100))
    : Math.min(coupon.value, amount);

  return ok({
    valid: true,
    code: coupon.code,
    type: coupon.type,
    value: coupon.value,
    discount,
    finalAmount: Math.max(0, amount - discount),
    description: coupon.description,
  });
}

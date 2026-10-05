import { db } from "@/lib/db";
import { audit, HttpError, ok, pageParams, readJson, requireAdmin, route, str } from "@/lib/api";

/** GET /api/admin/coupons */
export const GET = route(async (req: Request) => {
  await requireAdmin(req);
  const { take, skip } = pageParams(req, 100, 200);
  const [coupons, total] = await Promise.all([
    db.coupon.findMany({ orderBy: { createdAt: "desc" }, take, skip }),
    db.coupon.count(),
  ]);
  return ok(coupons, 200, { total, take, skip });
});

/** POST /api/admin/coupons — create coupon */
export const POST = route(async (req: Request) => {
  const admin = await requireAdmin(req);

  const body = await readJson<{
    code?: string; type?: string; value?: number; description?: string;
    maxUses?: number; expiresAt?: string;
  }>(req);

  const code = str(body.code, 40).toUpperCase();
  if (!code) throw new HttpError("Coupon code is required");
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) {
    throw new HttpError("Coupon code may only contain letters, numbers, dashes and underscores");
  }

  const type = body.type === "FIXED" ? "FIXED" : "PERCENT";
  const value = Number(body.value);
  if (!Number.isFinite(value) || value <= 0) throw new HttpError("Discount value must be positive");
  if (type === "PERCENT" && value > 90) throw new HttpError("Percentage discount cannot exceed 90%");

  const maxUsesRaw = Number(body.maxUses ?? 100);
  const maxUses = Number.isFinite(maxUsesRaw) ? Math.max(1, Math.trunc(maxUsesRaw)) : 100;

  let expiresAt: Date | null = null;
  if (body.expiresAt) {
    const parsed = new Date(body.expiresAt);
    if (Number.isNaN(parsed.getTime())) throw new HttpError("Expiry date is not a valid date");
    expiresAt = parsed;
  }

  const exists = await db.coupon.findUnique({ where: { code } });
  if (exists) throw new HttpError("A coupon with this code already exists", 409);

  const coupon = await db.coupon.create({
    data: { code, type, value, description: str(body.description, 200), maxUses, expiresAt },
  });
  await audit({ actor: admin.id, action: "COUPON_CREATE", entity: "coupon", entityId: coupon.id, meta: { code, type, value } });
  return ok(coupon, 201);
});

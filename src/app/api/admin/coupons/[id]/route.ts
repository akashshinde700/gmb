import { db } from "@/lib/db";
import { audit, HttpError, ok, readJson, requireAdmin, route } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

/** PATCH /api/admin/coupons/[id] — toggle active */
export const PATCH = route(async (req: Request, { params }: Params) => {
  const admin = await requireAdmin(req);
  const { id } = await params;

  const existing = await db.coupon.findUnique({ where: { id } });
  if (!existing) throw new HttpError("Coupon not found", 404);

  const body = await readJson<{ active?: boolean }>(req);
  if (body.active === undefined) throw new HttpError("Nothing to update");

  const coupon = await db.coupon.update({ where: { id }, data: { active: Boolean(body.active) } });
  await audit({
    actor: admin.id,
    action: coupon.active ? "COUPON_ENABLE" : "COUPON_DISABLE",
    entity: "coupon",
    entityId: id,
    meta: { code: coupon.code },
  });
  return ok(coupon);
});

export const DELETE = route(async (req: Request, { params }: Params) => {
  const admin = await requireAdmin(req);
  const { id } = await params;

  const existing = await db.coupon.findUnique({ where: { id } });
  if (!existing) throw new HttpError("Coupon not found", 404);

  await db.coupon.delete({ where: { id } });
  await audit({
    actor: admin.id, action: "COUPON_DELETE", entity: "coupon", entityId: id,
    meta: { code: existing.code, usedCount: existing.usedCount },
  });
  return ok({ deleted: true });
});

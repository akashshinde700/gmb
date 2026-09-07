import { db } from "@/lib/db";
import { fail, getSessionUser, ok } from "@/lib/auth";

async function requireAdmin(req: Request) {
  const session = await getSessionUser(req);
  if (!session) return { error: fail("Unauthorized", 401) as Response };
  if (session.role !== "ADMIN") return { error: fail("Admin access required", 403) as Response };
  return { session };
}

/** PATCH /api/admin/coupons/[id] — toggle active */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  const { id } = await params;
  const body = (await req.json()) as { active?: boolean };
  const coupon = await db.coupon.update({ where: { id }, data: { active: Boolean(body.active) } });
  return ok(coupon);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  const { id } = await params;
  await db.coupon.delete({ where: { id } });
  return ok({ deleted: true });
}

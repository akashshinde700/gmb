import { db } from "@/lib/db";
import { fail, getSessionUser, ok } from "@/lib/auth";

async function requireAdmin(req: Request) {
  const session = await getSessionUser(req);
  if (!session) return { error: fail("Unauthorized", 401) as Response };
  if (session.role !== "ADMIN") return { error: fail("Admin access required", 403) as Response };
  return { session };
}

const BUSINESS_STATUSES = ["DRAFT", "PUBLISHED", "SUSPENDED", "EXPIRED", "ARCHIVED"];

/** PATCH /api/admin/businesses/[id] — suspend / activate / change status */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  const { id } = await params;

  const body = (await req.json()) as { status?: string };
  if (!body.status || !BUSINESS_STATUSES.includes(body.status)) return fail("Invalid status");

  const business = await db.business.findUnique({ where: { id } });
  if (!business) return fail("Business not found", 404);

  const updated = await db.business.update({
    where: { id },
    data: { status: body.status },
  });

  await db.auditLog.create({
    data: {
      actor: "admin", action: `BUSINESS_${body.status}`, entity: "business", entityId: id,
      meta: JSON.stringify({ name: business.name }),
    },
  });

  await db.notification.create({
    data: {
      userId: business.userId,
      title: body.status === "SUSPENDED" ? "Website suspended" : `Website status: ${body.status}`,
      body: `Your website ${business.name} status was changed to ${body.status} by the platform team.`,
    },
  });

  return ok({ id: updated.id, status: updated.status });
}

/** DELETE /api/admin/businesses/[id] — remove business + data (audit-logged) */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  const { id } = await params;

  const business = await db.business.findUnique({ where: { id } });
  if (!business) return fail("Business not found", 404);

  await db.business.delete({ where: { id } });
  await db.auditLog.create({
    data: { actor: "admin", action: "BUSINESS_DELETE", entity: "business", entityId: id, meta: JSON.stringify({ name: business.name }) },
  });
  return ok({ deleted: id });
}

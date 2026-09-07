import { db } from "@/lib/db";
import { fail, getSessionBusiness, getSessionUser, ok } from "@/lib/auth";

const STATUSES = ["NEW", "CONTACTED", "FOLLOW_UP", "QUALIFIED", "CONVERTED", "CLOSED", "SPAM"];

/** PATCH /api/leads/[id] — update lead status/notes (tenant-isolated) */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionUser(req);
  if (!session) return fail("Unauthorized", 401);
  const business = await getSessionBusiness(session.id);
  if (!business) return fail("No business found", 404);

  const lead = await db.lead.findFirst({ where: { id, businessId: business.id } });
  if (!lead) return fail("Lead not found", 404);

  const body = (await req.json()) as { status?: string; notes?: string };
  const data: Record<string, string> = {};
  if (body.status) {
    if (!STATUSES.includes(body.status)) return fail("Invalid status");
    data.status = body.status;
  }
  if (body.notes !== undefined) data.notes = String(body.notes).slice(0, 2000);

  const updated = await db.lead.update({ where: { id }, data });
  return ok(updated);
}

/** DELETE /api/leads/[id] */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionUser(req);
  if (!session) return fail("Unauthorized", 401);
  const business = await getSessionBusiness(session.id);
  if (!business) return fail("No business found", 404);

  const lead = await db.lead.findFirst({ where: { id, businessId: business.id } });
  if (!lead) return fail("Lead not found", 404);

  await db.lead.delete({ where: { id } });
  return ok({ deleted: id });
}

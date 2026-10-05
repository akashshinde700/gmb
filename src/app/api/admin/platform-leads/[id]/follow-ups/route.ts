import { db } from "@/lib/db";
import { audit, HttpError, ok, readJson, requireAdmin, route, str } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

/** GET /api/admin/platform-leads/[id]/follow-ups — the chase history. */
export const GET = route(async (req: Request, { params }: Params) => {
  await requireAdmin(req);
  const { id } = await params;

  const lead = await db.platformLead.findUnique({
    where: { id },
    include: { followUps: { orderBy: { createdAt: "desc" } } },
  });
  if (!lead) throw new HttpError("Lead not found", 404);

  return ok({
    lead: { id: lead.id, name: lead.name, status: lead.status },
    followUps: lead.followUps.map((f) => ({
      id: f.id, note: f.note, actor: f.actor, createdAt: f.createdAt.toISOString(),
    })),
  });
});

/**
 * POST /api/admin/platform-leads/[id]/follow-ups — record a call, email or
 * meeting. Adding a note to a brand-new lead also moves it to CONTACTED, since
 * that is what the note means.
 */
export const POST = route(async (req: Request, { params }: Params) => {
  const admin = await requireAdmin(req);
  const { id } = await params;

  const lead = await db.platformLead.findUnique({ where: { id } });
  if (!lead) throw new HttpError("Lead not found", 404);

  const body = await readJson<{ note?: string }>(req);
  const note = str(body.note, 2000);
  if (note.length < 2) throw new HttpError("Write what happened on this follow-up");

  const followUp = await db.$transaction(async (tx) => {
    const created = await tx.platformLeadFollowUp.create({
      data: { leadId: id, note, actor: admin.email },
    });
    if (lead.status === "NEW") {
      await tx.platformLead.update({ where: { id }, data: { status: "CONTACTED" } });
    }
    return created;
  });

  await audit({ actor: admin.id, action: "PLATFORM_LEAD_FOLLOWUP", entity: "platformLead", entityId: id });

  return ok(
    {
      followUp: {
        id: followUp.id, note: followUp.note, actor: followUp.actor,
        createdAt: followUp.createdAt.toISOString(),
      },
      status: lead.status === "NEW" ? "CONTACTED" : lead.status,
    },
    201,
  );
});

/** DELETE /api/admin/platform-leads/[id]/follow-ups?noteId=… — remove one note. */
export const DELETE = route(async (req: Request, { params }: Params) => {
  const admin = await requireAdmin(req);
  const { id } = await params;
  const noteId = str(new URL(req.url).searchParams.get("noteId"), 60);
  if (!noteId) throw new HttpError("noteId is required");

  const existing = await db.platformLeadFollowUp.findFirst({ where: { id: noteId, leadId: id } });
  if (!existing) throw new HttpError("Follow-up not found", 404);

  await db.platformLeadFollowUp.delete({ where: { id: noteId } });
  await audit({ actor: admin.id, action: "PLATFORM_LEAD_FOLLOWUP_DELETE", entity: "platformLead", entityId: id });
  return ok({ deleted: noteId });
});

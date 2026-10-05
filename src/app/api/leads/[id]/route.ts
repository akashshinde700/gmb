import { db } from "@/lib/db";
import { HttpError, ok, readJson, requireBusiness, requireUser, route, str } from "@/lib/api";

const STATUSES = ["NEW", "CONTACTED", "FOLLOW_UP", "QUALIFIED", "CONVERTED", "CLOSED", "SPAM"];

type Params = { params: Promise<{ id: string }> };

async function ownedLead(req: Request, params: Params["params"]) {
  const { id } = await params;
  const session = await requireUser(req);
  const business = await requireBusiness(session);
  const lead = await db.lead.findFirst({ where: { id, businessId: business.id } });
  if (!lead) throw new HttpError("Lead not found", 404);
  return { id, lead };
}

/** PATCH /api/leads/[id] — update lead status/notes (tenant-isolated) */
export const PATCH = route(async (req: Request, { params }: Params) => {
  const { id } = await ownedLead(req, params);

  const body = await readJson<{ status?: string; notes?: string }>(req);
  const data: Record<string, string> = {};
  if (body.status !== undefined) {
    if (!STATUSES.includes(String(body.status))) throw new HttpError("Invalid status");
    data.status = String(body.status);
  }
  if (body.notes !== undefined) data.notes = str(body.notes, 2000);
  if (!Object.keys(data).length) throw new HttpError("Nothing to update");

  const updated = await db.lead.update({ where: { id }, data });
  return ok(updated);
});

/** DELETE /api/leads/[id] */
export const DELETE = route(async (req: Request, { params }: Params) => {
  const { id } = await ownedLead(req, params);
  await db.lead.delete({ where: { id } });
  return ok({ deleted: id });
});

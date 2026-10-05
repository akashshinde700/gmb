import { db } from "@/lib/db";
import { audit, HttpError, ok, pageParams, readJson, requireAdmin, route, str } from "@/lib/api";

const STATUSES = ["NEW", "CONTACTED", "CONVERTED", "CLOSED"];

/** GET /api/admin/platform-leads — leads captured by the SaaS's own website */
export const GET = route(async (req: Request) => {
  await requireAdmin(req);
  const { take, skip } = pageParams(req, 100, 200);
  const [leads, total] = await Promise.all([
    db.platformLead.findMany({
      orderBy: { createdAt: "desc" },
      take,
      skip,
      include: { _count: { select: { followUps: true } } },
    }),
    db.platformLead.count(),
  ]);
  const rows = leads.map(({ _count, ...lead }) => ({ ...lead, followUpCount: _count.followUps }));
  return ok(rows, 200, { total, take, skip });
});

/** PATCH — update status */
export const PATCH = route(async (req: Request) => {
  const admin = await requireAdmin(req);
  const body = await readJson<{ id?: string; status?: string }>(req);

  const id = str(body.id, 60);
  if (!id) throw new HttpError("Lead id required");

  // An unrecognised status used to be silently rewritten to NEW, quietly
  // discarding whatever the admin actually chose.
  const status = str(body.status, 30);
  if (!STATUSES.includes(status)) throw new HttpError("Invalid status");

  const existing = await db.platformLead.findUnique({ where: { id } });
  if (!existing) throw new HttpError("Lead not found", 404);

  const lead = await db.platformLead.update({ where: { id }, data: { status } });
  await audit({ actor: admin.id, action: "PLATFORM_LEAD_STATUS", entity: "platformLead", entityId: id, meta: { status } });
  return ok(lead);
});

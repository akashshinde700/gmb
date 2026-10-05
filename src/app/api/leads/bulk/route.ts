import { db } from "@/lib/db";
import { audit, HttpError, ok, readJson, requireBusiness, requireUser, route } from "@/lib/api";

export const runtime = "nodejs";

const LEAD_STATUSES = ["NEW", "CONTACTED", "FOLLOW_UP", "QUALIFIED", "CONVERTED", "CLOSED", "SPAM"];

/** One request per action, not per row: marking fifty leads contacted was fifty clicks. */
const MAX_IDS = 500;

/**
 * POST /api/leads/bulk — apply one action to several leads.
 *
 * Every id is scoped to the session's own business inside the query itself, so
 * a crafted list of ids belonging to another tenant simply matches nothing.
 * That is the whole tenant-isolation story here: it is not checked and then
 * trusted, it is impossible to express.
 */
export const POST = route(async (req: Request) => {
  const session = await requireUser(req);
  const business = await requireBusiness(session);

  const body = await readJson<{ ids?: string[]; action?: string; status?: string }>(req);
  const ids = Array.isArray(body.ids) ? body.ids.filter((i) => typeof i === "string").slice(0, MAX_IDS) : [];
  if (!ids.length) throw new HttpError("Select at least one lead");

  const action = String(body.action || "");

  if (action === "status") {
    const status = String(body.status || "");
    if (!LEAD_STATUSES.includes(status)) throw new HttpError("Invalid status");

    const result = await db.lead.updateMany({
      where: { id: { in: ids }, businessId: business.id },
      data: { status },
    });

    await audit({
      actor: session.id,
      action: "LEADS_BULK_STATUS",
      entity: "lead",
      meta: { count: result.count, status },
    });
    return ok({ updated: result.count, status });
  }

  if (action === "delete") {
    const result = await db.lead.deleteMany({
      where: { id: { in: ids }, businessId: business.id },
    });

    await audit({
      actor: session.id,
      action: "LEADS_BULK_DELETE",
      entity: "lead",
      meta: { count: result.count },
    });
    return ok({ deleted: result.count });
  }

  throw new HttpError("Unknown action");
});

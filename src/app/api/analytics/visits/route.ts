import { db } from "@/lib/db";
import { ok, requireBusiness, requireUser, route } from "@/lib/api";
import { dayKey } from "@/lib/analytics";
import { visitSummaries } from "@/lib/visits";
import type { AnalyticsVisitReport } from "@/lib/types";

/**
 * GET /api/analytics/visits — what the last visits actually did.
 *
 * The summary answers "how many"; this answers "who, and what happened". A
 * shopkeeper does not act on "12 visits"; they act on "someone looked at the
 * gallery, tapped WhatsApp twice, then sent an enquiry at 6:40pm".
 *
 * Reads the raw event log on purpose: the rollups exist to bound the table, but
 * a journey is precisely the detail a rollup throws away. The window is a day
 * by default (a week at most) so the query stays small either way.
 */
export const GET = route(async (req: Request) => {
  const session = await requireUser(req);
  const business = await requireBusiness(session);

  const hours = Math.min(24 * 7, Math.max(1, Number(new URL(req.url).searchParams.get("hours")) || 24));
  const rows = await db.analyticsEvent.findMany({
    where: { businessId: business.id, createdAt: { gte: new Date(Date.now() - hours * 60 * 60 * 1000) } },
    select: { type: true, meta: true, path: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  const { visits, untracked, converted } = visitSummaries(rows);

  // The enquiry behind each converted visit, so the list can show a name rather
  // than an id. One query for all of them, not one per visit.
  const leadIds = visits.map((v) => v.leadId).filter(Boolean);
  const leads = leadIds.length
    ? await db.lead.findMany({
        where: { businessId: business.id, id: { in: leadIds } },
        select: { id: true, name: true, phone: true, serviceName: true, status: true, createdAt: true },
      })
    : [];
  const leadById = new Map(leads.map((l) => [l.id, l]));

  const report: AnalyticsVisitReport = {
    hours,
    visits: visits.map((v) => {
      const lead = leadById.get(v.leadId);
      return {
        ...v,
        lead: lead
          ? { id: lead.id, name: lead.name, phone: lead.phone, serviceName: lead.serviceName, status: lead.status }
          : null,
      };
    }),
    untracked,
    converted,
    day: dayKey(new Date()),
  };
  return ok(report);
});

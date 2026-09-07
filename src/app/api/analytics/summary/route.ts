import { db } from "@/lib/db";
import { fail, getSessionBusiness, getSessionUser, ok } from "@/lib/auth";
import type { AnalyticsSummary } from "@/lib/types";

/** GET /api/analytics/summary — aggregated stats for the tenant dashboard */
export async function GET(req: Request) {
  const session = await getSessionUser(req);
  if (!session) return fail("Unauthorized", 401);
  const business = await getSessionBusiness(session.id);
  if (!business) return fail("No business found", 404);

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [events, leadCount] = await Promise.all([
    db.analyticsEvent.findMany({ where: { businessId: business.id, createdAt: { gte: since } } }),
    db.lead.count({ where: { businessId: business.id, createdAt: { gte: since } } }),
  ]);

  const visits = events.filter((e) => e.type === "VISIT").length;
  const uniqueVisits = new Set(events.filter((e) => e.type === "VISIT").map((e) => e.path + e.createdAt.toDateString())).size;

  const daily: AnalyticsSummary["daily"] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    daily.push({
      date: key,
      visits: events.filter((e) => e.type === "VISIT" && e.createdAt.toISOString().slice(0, 10) === key).length,
      leads: events.filter((e) => e.type === "FORM_SUBMIT" && e.createdAt.toISOString().slice(0, 10) === key).length,
    });
  }

  const summary: AnalyticsSummary = {
    visits,
    uniqueVisits,
    leads: leadCount,
    ctaCalls: events.filter((e) => e.type === "CTA_CALL").length,
    ctaWhatsapp: events.filter((e) => e.type === "CTA_WHATSAPP").length,
    ctaEmail: events.filter((e) => e.type === "CTA_EMAIL").length,
    formSubmits: events.filter((e) => e.type === "FORM_SUBMIT").length,
    daily,
  };
  return ok(summary);
}

import { db } from "@/lib/db";
import type { AnalyticsSummary } from "@/lib/types";
import { ok, requireBusiness, requireUser, route } from "@/lib/api";
import { dayKey, sweepAnalytics } from "@/lib/analytics";
import { distinctVisits } from "@/lib/visits";

/**
 * GET /api/analytics/summary — aggregated stats for the tenant dashboard.
 *
 * Reads from two places and adds them together: raw AnalyticsEvent rows inside
 * the retention window, and AnalyticsDaily rollups for everything older. A
 * tenant whose traffic predates the window still sees complete totals, while
 * the raw table stays bounded.
 *
 * All the grouping happens in Prisma and JavaScript. The previous version used
 * `date(createdAt / 1000, 'unixepoch')` in raw SQL, which is SQLite-only and
 * would have returned wrong answers — not an error — on any other database.
 */
export const GET = route(async (req: Request) => {
  const session = await requireUser(req);
  const business = await requireBusiness(session);

  // Folding old rows away is cheap here and keeps the table from growing
  // unbounded without a scheduler. Throttled internally; never throws.
  await sweepAnalytics();

  const now = Date.now();
  const since = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const chartSince = new Date(now - 13 * 24 * 60 * 60 * 1000);
  chartSince.setHours(0, 0, 0, 0);

  const sinceDay = dayKey(since);
  const chartSinceDay = dayKey(chartSince);

  const [rawByType, rolledByType, leadCount, orderCount, orderValue, rawVisits, rolledDaily] = await Promise.all([
    db.analyticsEvent.groupBy({
      by: ["type"],
      where: { businessId: business.id, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    db.analyticsDaily.groupBy({
      by: ["type"],
      where: { businessId: business.id, day: { gte: sinceDay } },
      _sum: { count: true, uniquePaths: true },
    }),
    db.lead.count({ where: { businessId: business.id, createdAt: { gte: since } } }),
    // The shop, counted the same window as everything else. Cancelled orders are
    // excluded: a number an owner reads as "orders" must not include the ones
    // that were called off.
    db.order.count({ where: { businessId: business.id, createdAt: { gte: since }, status: { not: "CANCELLED" } } }),
    db.order.aggregate({
      where: { businessId: business.id, createdAt: { gte: since }, status: "DELIVERED" },
      _sum: { total: true },
    }),
    // Raw visits are fetched with their day and path so "unique" can be counted
    // the same way it always was: distinct (day, path) pairs.
    db.analyticsEvent.findMany({
      where: { businessId: business.id, type: "VISIT", createdAt: { gte: since } },
      select: { path: true, meta: true, type: true, createdAt: true },
      take: 50_000,
    }),
    db.analyticsDaily.findMany({
      where: {
        businessId: business.id,
        day: { gte: chartSinceDay },
        type: { in: ["VISIT", "FORM_SUBMIT"] },
      },
      select: { day: true, type: true, count: true },
    }),
  ]);

  const count = (type: string) => {
    const raw = rawByType.find((r) => r.type === type)?._count._all ?? 0;
    const rolled = rolledByType.find((r) => r.type === type)?._sum.count ?? 0;
    return raw + rolled;
  };

  // Unique used to mean "distinct (day, path)" — the best available before
  // visits had ids. Once a site's pages carry visit ids, "unique" means what an
  // owner reads it as: distinct visits. Rows from before (and the rollups) keep
  // the old measure, so the number never silently drops.
  const uniqueTracked = distinctVisits(rawVisits);
  const uniqueRaw = uniqueTracked || new Set(rawVisits.map((v) => `${dayKey(v.createdAt)} ${v.path}`)).size;
  const uniqueRolled =
    rolledByType.find((r) => r.type === "VISIT")?._sum.uniquePaths ?? 0;

  // Daily chart: raw rows for recent days, rollups for anything already folded.
  const dayIndex = new Map<string, { visits: number; leads: number }>();
  const bump = (day: string, type: string, by: number) => {
    const entry = dayIndex.get(day) ?? { visits: 0, leads: 0 };
    if (type === "VISIT") entry.visits += by;
    else if (type === "FORM_SUBMIT") entry.leads += by;
    dayIndex.set(day, entry);
  };

  const chartRaw = await db.analyticsEvent.findMany({
    where: {
      businessId: business.id,
      createdAt: { gte: chartSince },
      type: { in: ["VISIT", "FORM_SUBMIT"] },
    },
    select: { type: true, createdAt: true },
    take: 50_000,
  });
  for (const e of chartRaw) bump(dayKey(e.createdAt), e.type, 1);
  for (const r of rolledDaily) bump(r.day, r.type, r.count);

  const daily: AnalyticsSummary["daily"] = [];
  for (let i = 13; i >= 0; i--) {
    const key = dayKey(new Date(now - i * 24 * 60 * 60 * 1000));
    const entry = dayIndex.get(key) ?? { visits: 0, leads: 0 };
    daily.push({ date: key, visits: entry.visits, leads: entry.leads });
  }

  const summary: AnalyticsSummary = {
    visits: count("VISIT"),
    uniqueVisits: uniqueRaw + uniqueRolled,
    leads: leadCount,
    ctaCalls: count("CTA_CALL"),
    ctaWhatsapp: count("CTA_WHATSAPP"),
    ctaEmail: count("CTA_EMAIL"),
    formSubmits: count("FORM_SUBMIT"),
    cartAdds: count("CART_ADD"),
    orders: orderCount,
    orderValue: Math.round((orderValue._sum.total ?? 0) * 100) / 100,
    daily,
  };
  return ok(summary);
});

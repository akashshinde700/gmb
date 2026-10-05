import { db } from "@/lib/db";
import { ok, requireAdmin, route } from "@/lib/api";
import { sweepSubscriptions } from "@/lib/expiry";

/** GET /api/admin/stats — platform overview KPIs */
export const GET = route(async (req: Request) => {
  await requireAdmin(req);

  // Counts an admin acts on must not include trials the clock already ended.
  await sweepSubscriptions();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    customers, businesses, published, trialing, expired,
    leads, newLeads, plans, templates, activeSubs,
    totalRevenueAgg, monthRevenueAgg, recentPayments, recentLeads,
  ] = await Promise.all([
    db.user.count({ where: { role: "CUSTOMER" } }),
    db.business.count(),
    db.business.count({ where: { status: "PUBLISHED" } }),
    db.subscription.count({ where: { status: "TRIALING" } }),
    db.subscription.count({ where: { status: { in: ["EXPIRED", "PAST_DUE"] } } }),
    db.lead.count(),
    db.lead.count({ where: { createdAt: { gte: monthStart } } }),
    db.plan.count(),
    db.template.count(),
    db.subscription.count({ where: { status: "ACTIVE" } }),
    // Revenue is summed in SQL over every successful payment. It used to be
    // derived from the 200 most recent rows, so both totals silently stopped
    // growing once a platform passed 200 payments.
    db.payment.aggregate({ where: { status: "SUCCESS" }, _sum: { amount: true } }),
    db.payment.aggregate({
      where: { status: "SUCCESS", createdAt: { gte: monthStart } },
      _sum: { amount: true },
    }),
    db.payment.findMany({ where: { status: "SUCCESS" }, orderBy: { createdAt: "desc" }, take: 10 }),
    db.lead.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { business: { select: { name: true } } },
    }),
  ]);

  return ok({
    customers, businesses, published, trialing, expired,
    leads, newLeads, activeSubs, plans, templates,
    monthRevenue: monthRevenueAgg._sum.amount ?? 0,
    totalRevenue: totalRevenueAgg._sum.amount ?? 0,
    recentPayments,
    recentLeads,
  });
});

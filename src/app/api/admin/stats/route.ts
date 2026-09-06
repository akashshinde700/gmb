import { db } from "@/lib/db";
import { fail, getSessionUser, ok } from "@/lib/auth";

async function requireAdmin(req: Request) {
  const session = await getSessionUser(req);
  if (!session) return { error: fail("Unauthorized", 401) };
  if (session.role !== "ADMIN") return { error: fail("Admin access required", 403) };
  return { session };
}

/** GET /api/admin/stats — platform overview KPIs */
export async function GET(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    customers, businesses, published, trialing, expired,
    leads, newLeads, payments, plans, templates,
  ] = await Promise.all([
    db.user.count({ where: { role: "CUSTOMER" } }),
    db.business.count(),
    db.business.count({ where: { status: "PUBLISHED" } }),
    db.subscription.count({ where: { status: "TRIALING" } }),
    db.subscription.count({ where: { status: { in: ["EXPIRED", "PAST_DUE"] } } }),
    db.lead.count(),
    db.lead.count({ where: { createdAt: { gte: monthStart } } }),
    db.payment.findMany({ where: { status: "SUCCESS" }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.plan.count(),
    db.template.count(),
  ]);

  const monthRevenue = payments
    .filter((p) => p.createdAt >= monthStart)
    .reduce((s, p) => s + p.amount, 0);
  const totalRevenue = payments.reduce((s, p) => s + p.amount, 0);
  const activeSubs = await db.subscription.count({ where: { status: "ACTIVE" } });

  return ok({
    customers, businesses, published, trialing, expired,
    leads, newLeads, activeSubs, plans, templates,
    monthRevenue, totalRevenue,
    recentPayments: payments.slice(0, 10),
    recentLeads: await db.lead.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { business: { select: { name: true } } } }),
  });
}

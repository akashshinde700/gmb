import { db } from "@/lib/db";
import { serializeSub } from "@/lib/serialize";
import { audit, HttpError, ok, readJson, requireAdmin, route, str } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

const STATUSES = ["TRIALING", "ACTIVE", "PAST_DUE", "EXPIRED", "CANCELED"];

/**
 * PATCH /api/admin/businesses/[id]/subscription — the operations support needs
 * on a live account: move it to another plan, extend a trial, record an
 * off-platform payment, or set the status directly.
 *
 * `markPaid` writes a real Payment row so revenue reporting stays truthful
 * about money that arrived by bank transfer or UPI outside the app.
 */
export const PATCH = route(async (req: Request, { params }: Params) => {
  const admin = await requireAdmin(req);
  const { id } = await params;

  const business = await db.business.findUnique({
    where: { id },
    include: { subscription: { include: { plan: true } } },
  });
  if (!business) throw new HttpError("Business not found", 404);
  if (!business.subscription) throw new HttpError("This customer has no subscription yet", 404);

  const body = await readJson<{
    planId?: string; cycle?: string; status?: string;
    extendTrialDays?: number; extendPeriodDays?: number;
    markPaid?: boolean; amount?: number; method?: string; note?: string;
  }>(req);

  const data: Record<string, unknown> = {};
  const changes: string[] = [];

  if (body.planId !== undefined) {
    const plan = await db.plan.findUnique({ where: { id: str(body.planId, 60) } });
    if (!plan) throw new HttpError("Plan not found", 404);
    if (plan.customForBusinessId && plan.customForBusinessId !== id) {
      throw new HttpError("That plan belongs to another customer", 400);
    }
    data.planId = plan.id;
    changes.push(`plan=${plan.name}`);
  }

  if (body.cycle !== undefined) {
    const cycle = body.cycle === "YEARLY" ? "YEARLY" : "MONTHLY";
    data.cycle = cycle;
    changes.push(`cycle=${cycle}`);
  }

  if (body.status !== undefined) {
    const status = str(body.status, 20);
    if (!STATUSES.includes(status)) throw new HttpError("Invalid subscription status");
    data.status = status;
    changes.push(`status=${status}`);
  }

  if (body.extendTrialDays !== undefined) {
    const days = Number(body.extendTrialDays);
    if (!Number.isFinite(days) || days <= 0 || days > 365) throw new HttpError("Trial extension must be 1-365 days");
    // Extend from whichever is later: today, or the trial end already set.
    const base = business.subscription.trialEndsAt && business.subscription.trialEndsAt > new Date()
      ? business.subscription.trialEndsAt
      : new Date();
    data.trialEndsAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
    data.status = "TRIALING";
    changes.push(`trial+${Math.trunc(days)}d`);
  }

  if (body.extendPeriodDays !== undefined) {
    const days = Number(body.extendPeriodDays);
    if (!Number.isFinite(days) || days <= 0 || days > 3650) throw new HttpError("Period extension must be 1-3650 days");
    const base = business.subscription.renewsAt && business.subscription.renewsAt > new Date()
      ? business.subscription.renewsAt
      : new Date();
    data.renewsAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
    changes.push(`period+${Math.trunc(days)}d`);
  }

  const markPaid = Boolean(body.markPaid);
  const plan = data.planId
    ? await db.plan.findUnique({ where: { id: String(data.planId) } })
    : business.subscription.plan;
  const cycle = (data.cycle as string) ?? business.subscription.cycle;

  let amount = 0;
  if (markPaid) {
    const supplied = Number(body.amount);
    amount = Number.isFinite(supplied) && supplied >= 0
      ? supplied
      : cycle === "YEARLY"
        ? (plan?.priceYearly ?? 0)
        : (plan?.priceMonthly ?? 0);
    data.status = "ACTIVE";
    data.amount = amount;
    data.trialEndsAt = null;
    if (body.extendPeriodDays === undefined) {
      const base = business.subscription.renewsAt && business.subscription.renewsAt > new Date()
        ? business.subscription.renewsAt
        : new Date();
      data.renewsAt = new Date(base.getTime() + (cycle === "YEARLY" ? 365 : 30) * 24 * 60 * 60 * 1000);
    }
    changes.push(`paid=${amount}`);
  }

  if (!Object.keys(data).length) throw new HttpError("Nothing to update");

  const invoiceNo = `WS-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;
  const updated = await db.$transaction(async (tx) => {
    const sub = await tx.subscription.update({
      where: { businessId: id },
      data,
      include: { plan: true },
    });

    if (markPaid) {
      await tx.payment.create({
        data: {
          businessId: id,
          subscriptionId: sub.id,
          amount,
          method: str(body.method, 20) || "OFFLINE",
          status: "SUCCESS",
          invoiceNo,
          description: str(body.note, 200) || `Recorded by admin — ${plan?.name ?? "plan"} (${cycle === "YEARLY" ? "Annual" : "Monthly"})`,
        },
      });
      await tx.notification.create({
        data: {
          userId: business.userId,
          title: "Payment recorded ✅",
          body: `Your ${plan?.name ?? "plan"} subscription is active. Invoice ${invoiceNo}.`,
        },
      });
    }

    return sub;
  });

  await audit({
    actor: admin.id, action: "SUBSCRIPTION_ADMIN_UPDATE", entity: "business", entityId: id,
    meta: { business: business.name, changes },
  });

  return ok({ subscription: serializeSub(updated) });
});

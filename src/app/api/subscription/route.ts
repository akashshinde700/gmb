import { db } from "@/lib/db";
import { fail, getSessionBusiness, getSessionUser, ok } from "@/lib/auth";
import { serializeSub } from "@/lib/serialize";

/** GET /api/subscription — current tenant subscription + payment history */
export async function GET(req: Request) {
  const session = await getSessionUser(req);
  if (!session) return fail("Unauthorized", 401);
  const business = await getSessionBusiness(session.id);
  if (!business) return fail("No business found", 404);

  const payments = await db.payment.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const sub = business.subscription ? serializeSub(business.subscription) : null;
  return ok({ subscription: sub, payments });
}

/**
 * POST /api/subscription — subscribe / upgrade (mock gateway, Razorpay-ready architecture).
 * In production this route creates a Razorpay order and the webhook confirms payment.
 */
export async function POST(req: Request) {
  const session = await getSessionUser(req);
  if (!session) return fail("Unauthorized", 401);
  const business = await getSessionBusiness(session.id);
  if (!business) return fail("No business found", 404);

  const body = (await req.json()) as { planId?: string; cycle?: string; couponCode?: string; method?: string };
  const plan = await db.plan.findUnique({ where: { id: body.planId || "" } });
  if (!plan || !plan.active) return fail("Invalid plan selected");

  const cycle = body.cycle === "YEARLY" ? "YEARLY" : "MONTHLY";
  let amount = cycle === "YEARLY" ? plan.priceYearly : plan.priceMonthly;
  let appliedCoupon = "";

  // Apply coupon
  const code = (body.couponCode || "").trim().toUpperCase();
  if (code) {
    const coupon = await db.coupon.findUnique({ where: { code } });
    if (!coupon || !coupon.active) return fail("Invalid or expired coupon code");
    if (coupon.expiresAt && coupon.expiresAt < new Date()) return fail("This coupon has expired");
    if (coupon.usedCount >= coupon.maxUses) return fail("This coupon has reached its usage limit");
    const discount = coupon.type === "PERCENT"
      ? Math.round(amount * (coupon.value / 100))
      : Math.min(coupon.value, amount);
    amount = Math.max(0, amount - discount);
    appliedCoupon = coupon.code;
    await db.coupon.update({ where: { id: coupon.id }, data: { usedCount: { increment: 1 } } });
  }

  const renewsAt = new Date(Date.now() + (cycle === "YEARLY" ? 365 : 30) * 24 * 60 * 60 * 1000);
  const invoiceNo = `WS-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

  // Upsert subscription
  const data = {
    planId: plan.id,
    cycle,
    status: "ACTIVE" as const,
    amount,
    startedAt: new Date(),
    renewsAt,
    trialEndsAt: null,
  };
  const subscription = business.subscription
    ? await db.subscription.update({ where: { businessId: business.id }, data })
    : await db.subscription.create({ data: { ...data, businessId: business.id } });

  const payment = await db.payment.create({
    data: {
      businessId: business.id,
      subscriptionId: subscription.id,
      amount,
      method: body.method === "CARD" ? "CARD" : body.method === "NETBANKING" ? "NETBANKING" : "UPI",
      status: "SUCCESS",
      invoiceNo,
      couponCode: appliedCoupon,
      description: `${plan.name} plan — ${cycle === "YEARLY" ? "Annual" : "Monthly"} subscription`,
    },
  });

  await db.notification.create({
    data: {
      userId: session.id,
      title: "Subscription activated ✅",
      body: `Your ${plan.name} plan is now active. Invoice ${invoiceNo}. Next renewal: ${renewsAt.toLocaleDateString("en-IN")}.`,
    },
  });

  return ok({ subscription: serializeSub(subscription), payment }, 201);
}

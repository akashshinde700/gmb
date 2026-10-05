import { db } from "@/lib/db";
import { serializeSub } from "@/lib/serialize";
import { activateSubscription, GST_RATE, invoiceNumber, quote } from "@/lib/billing";
import { isTestMode, razorpayConfigured } from "@/lib/razorpay";
import {
  audit, HttpError, limitSubjectOrThrow, ok, pageParams, readJson, requireBusiness, requireUser, route,
} from "@/lib/api";

/**
 * Payments are simulated: this route marks the invoice paid without a gateway.
 * That is fine for demos, but on a real deployment it lets any signed-in
 * customer activate a paid plan for free, so it must be switched on
 * deliberately via ALLOW_MOCK_PAYMENTS=true.
 */
const MOCK_PAYMENTS =
  process.env.ALLOW_MOCK_PAYMENTS === "true" || process.env.NODE_ENV !== "production";

/** GET /api/subscription — current tenant subscription + payment history */
export const GET = route(async (req: Request) => {
  const session = await requireUser(req);
  const business = await requireBusiness(session);
  const { take, skip } = pageParams(req, 50, 200);

  const [payments, total] = await Promise.all([
    db.payment.findMany({
      where: { businessId: business.id },
      orderBy: { createdAt: "desc" },
      take,
      skip,
    }),
    db.payment.count({ where: { businessId: business.id } }),
  ]);

  return ok({
    subscription: business.subscription ? serializeSub(business.subscription) : null,
    payments,
    total,
    // The dashboard needs to know which checkout to show, and that GST is
    // added on top of the listed plan price.
    mockPayments: MOCK_PAYMENTS && !razorpayConfigured(),
    gateway: razorpayConfigured() ? "razorpay" : null,
    testMode: isTestMode(),
    gstRate: GST_RATE,
  });
});

/**
 * POST /api/subscription — simulated activation, for development only.
 *
 * Real checkout is /api/subscription/order + /api/subscription/verify, which go
 * through Razorpay. This route bypasses payment entirely, so on a production
 * deployment it lets any signed-in customer activate a paid plan for free — it
 * stays behind ALLOW_MOCK_PAYMENTS, and is refused outright once a real gateway
 * is configured.
 */
export const POST = route(async (req: Request) => {
  const session = await requireUser(req);
  const business = await requireBusiness(session);

  if (razorpayConfigured()) {
    throw new HttpError(
      "This deployment takes real payments. Use the checkout on the Subscription page.",
      409,
    );
  }
  if (!MOCK_PAYMENTS) {
    throw new HttpError(
      "Online payments are not enabled on this deployment. Contact support to activate a plan.",
      503,
    );
  }

  limitSubjectOrThrow(`subscribe:${business.id}`, 3, 60 * 1000);

  const body = await readJson<{ planId?: string; cycle?: string; couponCode?: string; method?: string }>(req);
  const priced = await quote({
    planId: String(body.planId || ""),
    cycle: body.cycle,
    couponCode: String(body.couponCode || ""),
  });

  const method =
    body.method === "CARD" ? "CARD" : body.method === "NETBANKING" ? "NETBANKING" : "UPI";

  const result = await activateSubscription({
    businessId: business.id,
    userId: session.id,
    planId: priced.plan.id,
    planName: priced.plan.name,
    cycle: priced.cycle,
    amount: priced.amount,
    taxableAmount: priced.taxableAmount,
    taxRate: priced.taxRate,
    taxAmount: priced.taxAmount,
    couponCode: priced.couponCode,
    method,
    invoiceNo: invoiceNumber(),
  });

  await audit({
    actor: session.id,
    action: "SUBSCRIPTION_ACTIVATED",
    entity: "subscription",
    entityId: result.subscription?.id ?? business.id,
    meta: {
      plan: priced.plan.slug,
      cycle: priced.cycle,
      amount: priced.amount,
      invoiceNo: result.payment.invoiceNo,
      simulated: true,
    },
  });

  return ok(
    {
      subscription: result.subscription ? serializeSub(result.subscription) : null,
      payment: result.payment,
      simulated: true,
    },
    201,
  );
});

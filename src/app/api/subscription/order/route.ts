import { db } from "@/lib/db";
import { audit, HttpError, limitSubjectOrThrow, ok, readJson, requireBusiness, requireUser, route, str } from "@/lib/api";
import { invoiceNumber, quote } from "@/lib/billing";
import { createOrder, isTestMode, razorpayConfig } from "@/lib/razorpay";

export const runtime = "nodejs";

/**
 * POST /api/subscription/order — start a real checkout.
 *
 * Prices the plan server-side, creates a Razorpay order for exactly that
 * amount, and hands the browser only what Checkout needs: the public key id and
 * the order id. The amount travels to Razorpay from here, never from the page,
 * so it cannot be edited on the way.
 *
 * The invoice number is minted now and carried in the order's notes, which is
 * what lets the browser callback and the webhook recognise the same payment and
 * activate it only once.
 */
export const POST = route(async (req: Request) => {
  const session = await requireUser(req);
  const business = await requireBusiness(session);

  if (!razorpayConfig()) {
    throw new HttpError(
      "Online payments are not enabled on this deployment yet. Contact support to activate a plan.",
      503,
    );
  }

  // Stops a double-clicked button, and a script, from opening a run of orders.
  limitSubjectOrThrow(`order:${business.id}`, 10, 10 * 60 * 1000);

  const body = await readJson<{ planId?: string; cycle?: string; couponCode?: string }>(req);
  const priced = await quote({
    planId: str(body.planId, 40),
    cycle: body.cycle,
    couponCode: str(body.couponCode, 40),
  });

  // A fully discounted plan has nothing to charge, and Razorpay will not accept
  // a zero order. Those are activated by an admin rather than through checkout.
  if (priced.amount <= 0) {
    throw new HttpError(
      "That coupon covers the full price. Contact us and we will activate the plan for you.",
      409,
    );
  }

  const invoiceNo = invoiceNumber();
  const order = await createOrder({
    // Razorpay works in paise.
    amountPaise: Math.round(priced.amount * 100),
    receipt: invoiceNo,
    notes: {
      invoiceNo,
      businessId: business.id,
      userId: session.id,
      planId: priced.plan.id,
      planName: priced.plan.name,
      cycle: priced.cycle,
      couponCode: priced.couponCode,
      amount: String(priced.amount),
      // The GST split travels with the order so the invoice written after
      // payment reproduces exactly what the customer was shown.
      taxableAmount: String(priced.taxableAmount),
      taxRate: String(priced.taxRate),
      taxAmount: String(priced.taxAmount),
    },
  });

  await audit({
    actor: session.id,
    action: "CHECKOUT_STARTED",
    entity: "subscription",
    entityId: business.id,
    meta: { plan: priced.plan.slug, cycle: priced.cycle, amount: priced.amount, orderId: order.id, invoiceNo },
  });

  const user = await db.user.findUnique({
    where: { id: session.id },
    select: { name: true, email: true },
  });

  return ok(
    {
      orderId: order.id,
      amount: order.amount, // paise, for Checkout
      currency: order.currency,
      keyId: razorpayConfig()!.keyId,
      testMode: isTestMode(),
      invoiceNo,
      quote: {
        planName: priced.plan.name,
        cycle: priced.cycle,
        listPrice: priced.listPrice,
        discount: priced.discount,
        taxableAmount: priced.taxableAmount,
        taxRate: priced.taxRate,
        taxAmount: priced.taxAmount,
        amount: priced.amount,
        couponCode: priced.couponCode,
      },
      prefill: {
        name: user?.name ?? "",
        email: user?.email ?? "",
        contact: business.phone || business.whatsapp || "",
      },
    },
    201,
  );
});

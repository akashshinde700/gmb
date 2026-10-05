import { audit, HttpError, ok, readJson, requireBusiness, requireUser, route, str } from "@/lib/api";
import { serializeSub } from "@/lib/serialize";
import { activateSubscription, normalizeCycle } from "@/lib/billing";
import { fetchPayment, mapMethod, verifyPaymentSignature } from "@/lib/razorpay";

export const runtime = "nodejs";

/**
 * POST /api/subscription/verify — finish a checkout the browser completed.
 *
 * Three checks stand between a request and an activated plan, and each one
 * closes a different hole:
 *
 *   1. The signature must verify. Without the key secret nobody can forge one,
 *      so this is what makes "I paid" true rather than claimed.
 *   2. The payment is re-fetched from Razorpay and must be captured, for the
 *      right order. A signature proves the pair is genuine; only the fetch
 *      proves money actually moved.
 *   3. Plan, amount and invoice number come from the order's notes — written by
 *      this server when the order was created — never from this request body.
 *
 * The webhook does the same work independently, because a customer whose
 * browser dies after paying must still get their plan. Activation is idempotent
 * on the invoice number, so whichever arrives second changes nothing.
 */
export const POST = route(async (req: Request) => {
  const session = await requireUser(req);
  const business = await requireBusiness(session);

  const body = await readJson<{
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
  }>(req);

  const orderId = str(body.razorpay_order_id, 64);
  const paymentId = str(body.razorpay_payment_id, 64);
  const signature = str(body.razorpay_signature, 256);

  if (!verifyPaymentSignature({ orderId, paymentId, signature })) {
    await audit({
      actor: session.id,
      action: "PAYMENT_SIGNATURE_REJECTED",
      entity: "subscription",
      entityId: business.id,
      meta: { orderId, paymentId },
    });
    throw new HttpError("We could not verify that payment. Nothing has been charged twice — contact us with your payment id.", 400);
  }

  const payment = await fetchPayment(paymentId);
  if (!payment || payment.order_id !== orderId) {
    throw new HttpError("That payment does not match this order.", 400);
  }
  if (payment.status !== "captured") {
    throw new HttpError(`This payment is ${payment.status}, not captured yet. Try again in a moment.`, 409);
  }

  const order = await fetchOrderNotes(orderId);
  if (!order) throw new HttpError("We could not read that order. Contact us with your payment id.", 400);

  // The order belongs to whoever started it. A signed-in customer must not be
  // able to attach someone else's payment to their own account.
  if (order.businessId !== business.id) {
    throw new HttpError("That payment belongs to a different account.", 403);
  }

  const result = await activateSubscription({
    businessId: business.id,
    userId: session.id,
    planId: order.planId,
    planName: order.planName,
    cycle: normalizeCycle(order.cycle),
    // Rupees, from the captured amount in paise — what actually moved, not
    // what anyone said it would be.
    amount: payment.amount / 100,
    taxableAmount: order.taxableAmount,
    taxRate: order.taxRate,
    taxAmount: order.taxAmount,
    couponCode: order.couponCode,
    method: mapMethod(payment.method),
    invoiceNo: order.invoiceNo,
    gatewayRef: paymentId,
  });

  if (!result.alreadyDone) {
    await audit({
      actor: session.id,
      action: "SUBSCRIPTION_ACTIVATED",
      entity: "subscription",
      entityId: result.subscription?.id ?? business.id,
      meta: { plan: order.planName, amount: payment.amount / 100, orderId, paymentId, invoiceNo: order.invoiceNo },
    });
  }

  return ok({
    subscription: result.subscription ? serializeSub(result.subscription) : null,
    payment: result.payment,
    alreadyActivated: result.alreadyDone,
  });
});

/** Read back the notes this server attached when it created the order. */
async function fetchOrderNotes(orderId: string): Promise<{
  invoiceNo: string;
  businessId: string;
  planId: string;
  planName: string;
  cycle: string;
  couponCode: string;
  taxableAmount: number;
  taxRate: number;
  taxAmount: number;
} | null> {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) return null;

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(orderId)}`, {
      headers: { Authorization: `Basic ${auth}` },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const order = (await res.json()) as { notes?: Record<string, string> };
    const n = order.notes ?? {};
    if (!n.invoiceNo || !n.businessId || !n.planId) return null;
    return {
      invoiceNo: n.invoiceNo,
      businessId: n.businessId,
      planId: n.planId,
      planName: n.planName || "Subscription",
      cycle: n.cycle || "MONTHLY",
      couponCode: n.couponCode || "",
      taxableAmount: Number(n.taxableAmount) || 0,
      taxRate: Number(n.taxRate) || 0,
      taxAmount: Number(n.taxAmount) || 0,
    };
  } catch (e) {
    console.error("[razorpay] could not read order notes:", e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

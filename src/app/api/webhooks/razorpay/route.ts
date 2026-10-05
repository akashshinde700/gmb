import { db } from "@/lib/db";
import { audit } from "@/lib/api";
import {
  activateSubscription, applyRefund, normalizeCycle, recordFailedPayment,
} from "@/lib/billing";
import { mapMethod, verifyWebhookSignature } from "@/lib/razorpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/razorpay
 *
 * The path that does not depend on the customer's browser. A payment can be
 * captured and the tab closed, the phone can die mid-UPI, the network can drop
 * on the way back — in every one of those the money moved and the plan must
 * still activate. Razorpay retries this until it gets a 2xx.
 *
 * Deliberately outside `route()` and every auth guard: the caller is Razorpay,
 * not a session. The signature over the raw body is the authentication, which
 * is why the body is read as text and hashed before any parsing —
 * re-serialising parsed JSON would change the bytes and fail every check.
 *
 * Handles exactly three events, and subscribing to more in the Razorpay
 * dashboard than are handled here only produces retries and noise:
 *
 *   payment.captured  → activate the plan
 *   payment.failed    → record the attempt, so support can see it
 *   refund.processed  → mark the payment refunded and cancel the plan
 *
 * Anything else is acknowledged with 200 and ignored: a 4xx would make Razorpay
 * retry an event that is never going to succeed.
 */

interface PaymentEntity {
  id?: string;
  order_id?: string;
  amount?: number;
  method?: string;
  error_description?: string;
  error_reason?: string;
  notes?: Record<string, string>;
}

interface RefundEntity {
  id?: string;
  payment_id?: string;
  amount?: number;
}

export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature") || "";

  if (!verifyWebhookSignature(raw, signature)) {
    // Not retryable and not ours: whoever sent this could not sign it.
    console.warn("[razorpay] webhook with an invalid signature was rejected");
    return new Response("invalid signature", { status: 401 });
  }

  let event: {
    event?: string;
    payload?: {
      payment?: { entity?: PaymentEntity };
      refund?: { entity?: RefundEntity };
    };
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }

  const name = event.event ?? "unknown";
  const payment = event.payload?.payment?.entity;

  try {
    if (name === "payment.captured") {
      return await handleCaptured(payment);
    }
    if (name === "payment.failed") {
      return await handleFailed(payment);
    }
    if (name === "refund.processed") {
      return await handleRefund(event.payload?.refund?.entity);
    }
    return Response.json({ ok: true, ignored: name });
  } catch (e) {
    // A 500 is correct here: the signature was good and the event is one we
    // should have handled, so Razorpay retrying is what we want.
    console.error(`[razorpay] webhook ${name} failed:`, e);
    return new Response("handler error", { status: 500 });
  }
}

async function handleCaptured(payment: PaymentEntity | undefined) {
  const notes = payment?.notes ?? {};
  const { invoiceNo, businessId, planId } = notes;

  if (!invoiceNo || !businessId || !planId) {
    // A payment created outside this app's checkout — a payment link, say.
    // Nothing here can act on it, and a retry would not help.
    return Response.json({ ok: true, ignored: "no order notes" });
  }

  const business = await db.business.findUnique({
    where: { id: businessId },
    select: { id: true, userId: true },
  });
  if (!business) return Response.json({ ok: true, ignored: "unknown business" });

  const result = await activateSubscription({
    businessId: business.id,
    userId: business.userId,
    planId,
    planName: notes.planName || "Subscription",
    cycle: normalizeCycle(notes.cycle),
    amount: (payment?.amount ?? 0) / 100,
    taxableAmount: Number(notes.taxableAmount) || 0,
    taxRate: Number(notes.taxRate) || 0,
    taxAmount: Number(notes.taxAmount) || 0,
    couponCode: notes.couponCode || "",
    method: mapMethod(payment?.method),
    invoiceNo,
    gatewayRef: payment?.id,
  });

  if (!result.alreadyDone) {
    await audit({
      actor: "razorpay-webhook",
      action: "SUBSCRIPTION_ACTIVATED",
      entity: "subscription",
      entityId: result.subscription?.id ?? business.id,
      meta: { invoiceNo, paymentId: payment?.id, orderId: payment?.order_id, viaWebhook: true },
    });
  }

  return Response.json({ ok: true, activated: !result.alreadyDone });
}

async function handleFailed(payment: PaymentEntity | undefined) {
  const businessId = payment?.notes?.businessId;
  if (!businessId || !payment?.id) {
    return Response.json({ ok: true, ignored: "no order notes" });
  }

  const business = await db.business.findUnique({
    where: { id: businessId },
    select: { id: true },
  });
  if (!business) return Response.json({ ok: true, ignored: "unknown business" });

  await recordFailedPayment({
    businessId: business.id,
    amount: (payment.amount ?? 0) / 100,
    method: mapMethod(payment.method),
    gatewayPaymentId: payment.id,
    reason: payment.error_description || payment.error_reason || "",
  });

  await audit({
    actor: "razorpay-webhook",
    action: "PAYMENT_FAILED",
    entity: "business",
    entityId: business.id,
    meta: { paymentId: payment.id, reason: payment.error_description ?? "" },
  });

  return Response.json({ ok: true, recorded: true });
}

async function handleRefund(refund: RefundEntity | undefined) {
  if (!refund?.payment_id) return Response.json({ ok: true, ignored: "no payment id" });

  const result = await applyRefund({
    gatewayPaymentId: refund.payment_id,
    amountRefunded: (refund.amount ?? 0) / 100,
  });

  if (result.applied) {
    await audit({
      actor: "razorpay-webhook",
      action: "PAYMENT_REFUNDED",
      entity: "payment",
      entityId: result.payment?.id ?? "",
      meta: { paymentId: refund.payment_id, refundId: refund.id, amount: (refund.amount ?? 0) / 100 },
    });
  }

  // A refund for a payment this app never recorded is still a 200: retrying
  // will not make the row appear.
  return Response.json({ ok: true, refunded: result.applied });
}

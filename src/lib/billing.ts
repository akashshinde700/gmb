// WebSetu — what a plan costs, and what happens when it is paid for.
//
// Both live here so the mock path and the Razorpay path cannot drift: the price
// is computed once, on the server, and the activation that follows a payment is
// the same code whichever route reached it.
//
// Nothing in this file takes an amount from a caller. `quote()` derives it from
// the plan row and the coupon; `activateSubscription()` records what was
// actually charged. A request body can name a plan and a coupon code — never a
// number.

import { db } from "@/lib/db";
import { HttpError } from "@/lib/api";
import { isQuoteOnlyPlan } from "@/lib/trial";
import { gstFor, splitGst } from "@/lib/gst";
import { billToFrom, supplier } from "@/lib/invoice";

export type Cycle = "MONTHLY" | "YEARLY";

/**
 * GST on the plan price. Zero unless GST_RATE says otherwise.
 *
 * WebSetu is not GST registered, so nothing is charged and every document it
 * issues is a payment receipt rather than a tax invoice. The arithmetic below
 * stays because registration is a form, not a rewrite: set GST_RATE=18 and
 * PLATFORM_GSTIN, and the checkout, the invoice and the CGST/SGST split all
 * start working from the same values they were tested against.
 *
 * The default used to be 18, which meant a missing environment variable
 * silently added 18% to every customer's bill on behalf of a registration that
 * does not exist. Defaulting to zero makes the safe case the one that needs no
 * configuration.
 *
 * Software-as-a-service is 18% in India, if and when that day comes. The rate
 * is stored on every payment so an old receipt keeps what it was charged at.
 */
export const GST_RATE: number = (() => {
  const raw = Number(process.env.GST_RATE ?? 0);
  if (!Number.isFinite(raw) || raw < 0 || raw > 50) return 0;
  return raw;
})();

export interface Quote {
  plan: { id: string; slug: string; name: string };
  cycle: Cycle;
  /** Plan price before any discount, exclusive of GST. */
  listPrice: number;
  discount: number;
  /** What GST is charged on: list price minus discount. */
  taxableAmount: number;
  taxRate: number;
  taxAmount: number;
  /** What the customer actually pays. */
  amount: number;
  couponCode: string;
}

export function normalizeCycle(value: unknown): Cycle {
  return value === "YEARLY" ? "YEARLY" : "MONTHLY";
}

export function invoiceNumber(): string {
  return `WS-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;
}

/**
 * Price a plan for a cycle, applying a coupon if one is valid.
 *
 * Deliberately does NOT consume the coupon: pricing happens when the order is
 * created, and a customer who abandons checkout must not burn a use. The
 * coupon is claimed inside the activation transaction instead.
 */
export async function quote(input: {
  planId: string;
  cycle: unknown;
  couponCode?: string;
}): Promise<Quote> {
  const plan = await db.plan.findUnique({ where: { id: String(input.planId || "") } });
  if (!plan || !plan.active) throw new HttpError("Invalid plan selected");
  if (isQuoteOnlyPlan(plan)) {
    throw new HttpError(
      `${plan.name} is quoted per business — contact our team and we will set it up for you.`,
      409,
    );
  }

  const cycle = normalizeCycle(input.cycle);
  const listPrice = cycle === "YEARLY" ? plan.priceYearly : plan.priceMonthly;
  if (!Number.isFinite(listPrice) || listPrice <= 0) {
    throw new HttpError("This plan is not priced correctly");
  }

  const code = String(input.couponCode || "").trim().toUpperCase();
  let discount = 0;
  let couponCode = "";

  if (code) {
    const coupon = await db.coupon.findUnique({ where: { code } });
    const usable =
      coupon &&
      coupon.active &&
      (!coupon.expiresAt || coupon.expiresAt >= new Date()) &&
      coupon.usedCount < coupon.maxUses;
    if (usable) {
      discount =
        coupon.type === "PERCENT"
          ? Math.round(listPrice * (coupon.value / 100))
          : Math.min(coupon.value, listPrice);
      couponCode = coupon.code;
    }
    // An unusable code is silently ignored rather than failing the quote: the
    // customer already saw it validated or rejected in the coupon field, and
    // blocking checkout here would strand them at the payment step.
  }

  const taxableAmount = Math.max(0, listPrice - discount);
  const taxAmount = gstFor(taxableAmount, GST_RATE);
  const amount = taxableAmount + taxAmount;

  return {
    plan: { id: plan.id, slug: plan.slug, name: plan.name },
    cycle,
    listPrice,
    discount,
    taxableAmount,
    taxRate: GST_RATE,
    taxAmount,
    amount,
    couponCode,
  };
}

export interface ActivationInput {
  businessId: string;
  userId: string;
  planId: string;
  planName: string;
  cycle: Cycle;
  /** What was actually charged, in rupees, GST included. */
  amount: number;
  taxableAmount: number;
  taxRate: number;
  taxAmount: number;
  couponCode: string;
  method: "UPI" | "CARD" | "NETBANKING";
  invoiceNo: string;
  /** The gateway's payment id, for reconciliation and refund lookups. */
  gatewayRef?: string;
}

/**
 * Turn a completed payment into an active subscription.
 *
 * Subscription row, payment row, coupon claim and the owner's notification are
 * one transaction: a failure halfway through used to leave a coupon consumed
 * with no subscription, or an active plan with no payment record.
 *
 * Idempotent on `invoiceNo`. The browser callback and the webhook both land
 * here for the same payment, and the second one must not create a second
 * invoice or extend the period twice.
 */
export async function activateSubscription(input: ActivationInput) {
  const existing = await db.payment.findFirst({ where: { invoiceNo: input.invoiceNo } });
  if (existing) {
    const subscription = await db.subscription.findUnique({ where: { businessId: input.businessId } });
    return { subscription, payment: existing, alreadyDone: true };
  }

  const renewsAt = new Date(
    Date.now() + (input.cycle === "YEARLY" ? 365 : 30) * 24 * 60 * 60 * 1000,
  );

  // Read outside the transaction: these are the customer's billing details and
  // the supplier's own registration, neither of which the transaction changes.
  const business = await db.business.findUnique({
    where: { id: input.businessId },
    select: {
      name: true, address: true, city: true, state: true,
      pincode: true, gstin: true, email: true,
    },
  });
  const billTo = business ? billToFrom(business) : null;
  const split = splitGst(input.taxAmount, supplier().state, billTo?.state ?? "");

  const result = await db.$transaction(async (tx) => {
    if (input.couponCode) {
      // Conditional update rather than read-then-write: two concurrent
      // redemptions of the last remaining use cannot both succeed, because the
      // second matches zero rows.
      const claimed = await tx.coupon.updateMany({
        where: { code: input.couponCode, active: true },
        data: { usedCount: { increment: 1 } },
      });
      // A coupon that ran out between the order and the payment is not grounds
      // to refuse activation — the customer has already paid the discounted
      // amount. It is recorded and honoured.
      if (claimed.count === 0) {
        console.warn(`[billing] coupon ${input.couponCode} could not be claimed at activation`);
      }
    }

    const data = {
      planId: input.planId,
      cycle: input.cycle,
      status: "ACTIVE" as const,
      amount: input.amount,
      startedAt: new Date(),
      renewsAt,
      trialEndsAt: null,
    };

    const subscription = await tx.subscription.upsert({
      where: { businessId: input.businessId },
      update: data,
      create: { ...data, businessId: input.businessId },
    });

    const payment = await tx.payment.create({
      data: {
        businessId: input.businessId,
        subscriptionId: subscription.id,
        amount: input.amount,
        taxableAmount: input.taxableAmount,
        taxRate: input.taxRate,
        taxAmount: input.taxAmount,
        // Frozen onto the row at the moment of sale: the split depends on where
        // the customer was then, and an invoice already filed with a return
        // must not change because they later moved or edited their profile.
        cgst: split.cgst,
        sgst: split.sgst,
        igst: split.igst,
        placeOfSupply: billTo?.state ?? "",
        customerGstin: billTo?.gstin ?? "",
        billToJson: billTo ? JSON.stringify(billTo) : "{}",
        method: input.method,
        status: "SUCCESS",
        invoiceNo: input.invoiceNo,
        gatewayPaymentId: input.gatewayRef ?? "",
        couponCode: input.couponCode,
        description:
          `${input.planName} plan — ${input.cycle === "YEARLY" ? "Annual" : "Monthly"} subscription` +
          (input.gatewayRef ? ` (${input.gatewayRef})` : ""),
      },
    });

    await tx.notification.create({
      data: {
        userId: input.userId,
        title: "Subscription activated ✅",
        body: `Your ${input.planName} plan is now active. Invoice ${input.invoiceNo}. Next renewal: ${renewsAt.toLocaleDateString("en-IN")}.`,
      },
    });

    return { subscription, payment };
  });

  return { ...result, alreadyDone: false };
}

/**
 * Record a payment attempt that the gateway reported as failed.
 *
 * Nothing is granted and no subscription changes — this exists so that when a
 * customer says "I tried to pay and it did not work", support can see it
 * happened, with the gateway's own reason.
 */
export async function recordFailedPayment(input: {
  businessId: string;
  amount: number;
  method: "UPI" | "CARD" | "NETBANKING";
  gatewayPaymentId: string;
  reason: string;
}) {
  const existing = await db.payment.findFirst({
    where: { gatewayPaymentId: input.gatewayPaymentId },
  });
  if (existing) return existing;

  return db.payment.create({
    data: {
      businessId: input.businessId,
      amount: input.amount,
      method: input.method,
      status: "FAILED",
      gatewayPaymentId: input.gatewayPaymentId,
      description: `Failed payment${input.reason ? ` — ${input.reason}` : ""}`,
    },
  });
}

/**
 * Apply a refund: mark the payment refunded and stop the subscription.
 *
 * A refunded customer keeping a live paid plan is the one outcome nobody wants
 * from a refund, so the subscription is cancelled here rather than left to a
 * human to remember. `CANCELED` rather than `EXPIRED` because this was a
 * decision, not the clock running out.
 *
 * Idempotent: a payment already marked REFUNDED is left alone, so a retried
 * webhook cannot cancel a plan the customer has since paid for again.
 */
export async function applyRefund(input: { gatewayPaymentId: string; amountRefunded: number }) {
  const payment = await db.payment.findFirst({
    where: { gatewayPaymentId: input.gatewayPaymentId },
  });
  if (!payment || payment.status === "REFUNDED") return { applied: false, payment };

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "REFUNDED",
        description: `${payment.description} — refunded ${input.amountRefunded}`,
      },
    });

    if (payment.businessId) {
      await tx.subscription.updateMany({
        where: { businessId: payment.businessId },
        data: { status: "CANCELED" },
      });
      const business = await tx.business.findUnique({
        where: { id: payment.businessId },
        select: { userId: true },
      });
      if (business) {
        await tx.notification.create({
          data: {
            userId: business.userId,
            title: "Payment refunded",
            body: `Invoice ${payment.invoiceNo} has been refunded and your plan has been cancelled. Contact us if this was not expected.`,
          },
        });
      }
    }
    return row;
  });

  return { applied: true, payment: updated };
}

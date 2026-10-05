// WebSetu — Razorpay payments.
//
// No SDK: the Orders API is one authenticated POST and every signature check is
// an HMAC, so a dependency would add supply-chain surface for nothing.
//
// The rule the whole file exists to enforce: **the browser never decides what
// was paid.** It sends back three opaque strings; the server recomputes the
// signature with the key secret and only then believes anything. A client that
// invents an order id, a payment id or an amount gets a rejected signature,
// because it cannot produce one without the secret.

import { createHmac, timingSafeEqual } from "node:crypto";

const API = "https://api.razorpay.com/v1";
const TIMEOUT_MS = 15_000;

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
}

export function razorpayConfig(): RazorpayConfig | null {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret };
}

export function razorpayConfigured(): boolean {
  return razorpayConfig() !== null;
}

/** Test keys are prefixed; used to label the checkout so nobody is misled. */
export function isTestMode(): boolean {
  return (process.env.RAZORPAY_KEY_ID || "").startsWith("rzp_test_");
}

export interface RazorpayOrder {
  id: string;
  amount: number; // paise
  currency: string;
  status: string;
}

/**
 * Create an order.
 *
 * `amountPaise` is computed on the server from the plan and the coupon — it is
 * never taken from the request body. Razorpay then refuses to capture anything
 * other than this amount, which is what stops a customer paying ₹1 for a ₹2999
 * plan by editing the page.
 */
export async function createOrder(input: {
  amountPaise: number;
  receipt: string;
  notes: Record<string, string>;
}): Promise<RazorpayOrder> {
  const cfg = razorpayConfig();
  if (!cfg) throw new Error("Razorpay is not configured");
  if (!Number.isInteger(input.amountPaise) || input.amountPaise < 100) {
    // Razorpay's own minimum is ₹1. Anything below it is a bug upstream.
    throw new Error("Order amount must be a whole number of paise, at least 100");
  }

  const auth = Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API}/orders`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: input.amountPaise,
        currency: "INR",
        receipt: input.receipt.slice(0, 40),
        notes: input.notes,
        // The customer must land on a captured payment, not an authorised one
        // waiting for a second step.
        payment_capture: 1,
      }),
      signal: controller.signal,
    });
    const body = (await res.json().catch(() => null)) as
      | (RazorpayOrder & { error?: { description?: string } })
      | null;
    if (!res.ok || !body?.id) {
      throw new Error(body?.error?.description || `Razorpay refused the order (${res.status})`);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

/** Constant-time compare, so a signature cannot be guessed a byte at a time. */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Verify a checkout callback.
 *
 * Razorpay signs `order_id|payment_id` with the key secret. Only someone
 * holding that secret — Razorpay, or this server — can produce the signature,
 * so a matching one is proof the payment is real and belongs to this order.
 */
export function verifyPaymentSignature(input: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const cfg = razorpayConfig();
  if (!cfg || !input.orderId || !input.paymentId || !input.signature) return false;
  const expected = createHmac("sha256", cfg.keySecret)
    .update(`${input.orderId}|${input.paymentId}`)
    .digest("hex");
  return safeEqual(expected, input.signature);
}

/**
 * Verify a webhook.
 *
 * Signed with the webhook secret over the raw body, so the body must be read as
 * text and hashed before any JSON parsing — re-serialising the parsed object
 * would change the bytes and every signature would fail.
 */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqual(expected, signature);
}

/** Fetch a payment, to confirm state without trusting the caller. */
export async function fetchPayment(paymentId: string): Promise<{
  id: string;
  status: string;
  amount: number;
  order_id: string;
  method?: string;
} | null> {
  const cfg = razorpayConfig();
  if (!cfg) return null;
  const auth = Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API}/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Basic ${auth}` },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as { id: string; status: string; amount: number; order_id: string };
  } catch (e) {
    console.error("[razorpay] could not fetch payment:", e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Razorpay's method strings mapped onto the ones Payment.method stores. */
export function mapMethod(method: string | undefined): "UPI" | "CARD" | "NETBANKING" {
  if (method === "card") return "CARD";
  if (method === "netbanking") return "NETBANKING";
  return "UPI";
}

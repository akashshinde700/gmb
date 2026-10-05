"use client";
// WebSetu — opening Razorpay Checkout from the browser.
//
// The script is loaded on demand rather than in the layout: most page views
// never reach billing, and this is a third-party script on the critical path of
// every other page if it sits in <head>.
//
// Nothing here decides what is owed. The server priced the plan and created the
// order; this opens the sheet for that order and hands the three signed strings
// back for the server to verify. A tampered amount here changes nothing —
// Razorpay charges the order, not the page.

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

interface RazorpayInstance {
  open: () => void;
  on: (event: string, handler: (response: unknown) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

let loading: Promise<boolean> | null = null;

/** Load Checkout once per page. Resolves false when it cannot be reached. */
export function loadCheckoutScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  if (loading) return loading;

  loading = new Promise<boolean>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(!!window.Razorpay));
      existing.addEventListener("error", () => resolve(false));
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve(!!window.Razorpay);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  }).finally(() => {
    // A failed load must be retryable: leaving the rejected promise cached
    // would make every later attempt fail too.
    if (!window.Razorpay) loading = null;
  });

  return loading;
}

export interface CheckoutSuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface OpenCheckoutOptions {
  keyId: string;
  orderId: string;
  amount: number; // paise
  currency: string;
  name: string;
  description: string;
  prefill: { name: string; email: string; contact: string };
  onSuccess: (response: CheckoutSuccess) => void;
  /** Called when the sheet is dismissed or the payment fails. */
  onDismiss: (reason?: string) => void;
}

export async function openCheckout(options: OpenCheckoutOptions): Promise<boolean> {
  const ready = await loadCheckoutScript();
  if (!ready || !window.Razorpay) return false;

  const rzp = new window.Razorpay({
    key: options.keyId,
    order_id: options.orderId,
    amount: options.amount,
    currency: options.currency,
    name: options.name,
    description: options.description,
    prefill: options.prefill,
    theme: { color: "#059669" },
    handler: (response: CheckoutSuccess) => options.onSuccess(response),
    modal: {
      ondismiss: () => options.onDismiss(),
      // Closing by accident mid-payment is the most common way a customer ends
      // up charged with no plan; the webhook covers it, but asking first avoids
      // the situation entirely.
      confirm_close: true,
    },
  });

  rzp.on("payment.failed", (response: unknown) => {
    const error = (response as { error?: { description?: string } })?.error;
    options.onDismiss(error?.description || "The payment did not go through.");
  });

  rzp.open();
  return true;
}

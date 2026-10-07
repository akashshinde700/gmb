"use client";
// WebSetu — "where is my order?" on the shop's own site.
//
// The shop answers this question on the phone all day. The page asks for the two
// things a customer already has — the order number the shop read out, and the
// phone they ordered with — and shows the same status line the shopkeeper would
// have said.

import { useState } from "react";
import { Package, Phone } from "lucide-react";
import { api } from "@/lib/api-client";

interface TrackedOrder {
  number: string;
  customerName: string;
  items: { name: string; qty: number; price: number }[];
  subtotal: number;
  delivery: number;
  total: number;
  totalLabel: string;
  status: string;
  statusLine: string;
  payment: string;
  paymentStatus: string;
  fulfilment: string;
  address: string;
  notes: string;
  placedAt: string;
  updatedAt: string;
}

const STEPS = ["NEW", "CONFIRMED", "PACKED", "OUT_FOR_DELIVERY", "DELIVERED"];
const STEP_LABEL: Record<string, string> = {
  NEW: "Received",
  CONFIRMED: "Confirmed",
  PACKED: "Packed",
  OUT_FOR_DELIVERY: "On the way",
  DELIVERED: "Delivered",
};

export default function OrderTracker({ slug, shopPhone }: { slug: string; shopPhone: string }) {
  const [number, setNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [shop, setShop] = useState<{ name: string; whatsappUrl: string; phone: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function look() {
    setBusy(true);
    setError("");
    try {
      const result = await api.post<{ order: TrackedOrder; shop: typeof shop }>("/api/orders/track", {
        slug, number, phone,
      });
      setOrder(result.order);
      setShop(result.shop);
    } catch (e) {
      // One message for both wrongs: a lookup that says "right number, wrong
      // phone" has told a stranger the order exists.
      setError(e instanceof Error ? e.message : "We could not find that order");
      setOrder(null);
    } finally {
      setBusy(false);
    }
  }

  if (order) {
    const step = Math.max(0, STEPS.indexOf(order.status));
    const cancelled = order.status === "CANCELLED";
    return (
      <div>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
            <Package className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-lg font-bold text-[var(--brand-heading,var(--brand-secondary))]">{order.number}</p>
            <p className="text-sm text-[var(--brand-subheading,var(--brand-muted))]">
              Placed {new Date(order.placedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          </div>
        </div>

        <p className={`mt-4 rounded-xl px-4 py-3 text-sm ${cancelled ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>
          {order.statusLine}
        </p>

        {!cancelled && (
          <ol className="mt-5 flex items-center gap-1" aria-label="Order progress">
            {STEPS.map((s, i) => (
              <li key={s} className="flex flex-1 flex-col items-center gap-1.5 text-center">
                <span className={`h-1.5 w-full rounded-full ${i <= step ? "bg-[var(--brand-primary)]" : "bg-zinc-200"}`} />
                <span className={`text-[11px] ${i <= step ? "font-semibold text-[var(--brand-secondary)]" : "text-zinc-400"}`}>
                  {STEP_LABEL[s]}
                </span>
              </li>
            ))}
          </ol>
        )}

        <ul className="mt-6 space-y-1 rounded-xl bg-[var(--brand-surface,#f8f7f4)] p-4 text-sm">
          {order.items.map((item) => (
            <li key={item.name} className="flex justify-between gap-3">
              <span>{item.qty} × {item.name}</span>
              <span>₹{(item.price * item.qty).toLocaleString("en-IN")}</span>
            </li>
          ))}
          {order.delivery > 0 && (
            <li className="flex justify-between gap-3 text-zinc-500">
              <span>Delivery</span><span>₹{order.delivery.toLocaleString("en-IN")}</span>
            </li>
          )}
          <li className="flex justify-between border-t pt-1 font-bold">
            <span>Total</span><span>{order.totalLabel}</span>
          </li>
          <li className="pt-1 text-xs text-zinc-500">
            {order.payment === "COD" ? "Cash on delivery" : "Paid by UPI"}
            {order.paymentStatus === "PAID" ? " · payment received" : ""}
          </li>
        </ul>

        {order.fulfilment === "PICKUP" ? (
          <p className="mt-3 text-sm text-[var(--brand-subheading,var(--brand-muted))]">You chose to collect this from the shop.</p>
        ) : order.address ? (
          <p className="mt-3 text-sm text-[var(--brand-subheading,var(--brand-muted))]">Delivering to: {order.address}</p>
        ) : null}

        {(shop?.whatsappUrl || shop?.phone) && (
          <div className="mt-5 flex flex-wrap gap-2">
            {shop?.whatsappUrl && (
              <a href={shop.whatsappUrl} target="_blank" rel="noreferrer"
                className="rounded-xl bg-[#25d366] px-4 py-2.5 text-sm font-semibold text-white">
                Ask about this order
              </a>
            )}
            {shop?.phone && (
              <a href={`tel:${shop.phone}`} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold">
                <Phone className="h-4 w-4" aria-hidden="true" /> {shop.phone}
              </a>
            )}
          </div>
        )}

        <button type="button" onClick={() => { setOrder(null); setError(""); }}
          className="mt-5 text-sm text-[var(--brand-subheading,var(--brand-muted))] underline underline-offset-2">
          Look up another order
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); void look(); }}
      className="space-y-3"
    >
      <label className="block">
        <span className="text-sm font-medium text-[var(--brand-heading,var(--brand-secondary))]">Order number</span>
        <input
          className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm"
          placeholder="e.g. ORD-1042"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-[var(--brand-heading,var(--brand-secondary))]">Phone you ordered with</span>
        <input
          className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm"
          placeholder="10-digit mobile number"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </label>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={busy || !number || !phone}
        className="w-full rounded-xl bg-[var(--brand-primary)] px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
      >
        {busy ? "Looking…" : "Find my order"}
      </button>
      <p className="text-xs text-[var(--brand-subheading,var(--brand-muted))]">
        The number is on the confirmation you got when you ordered{shopPhone ? `, or call us on ${shopPhone}` : ""}.
      </p>
    </form>
  );
}

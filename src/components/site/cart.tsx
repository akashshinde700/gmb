"use client";
// WebSetu — the storefront cart.
//
// Everything a shop needs to take an order on its own website: a bar that
// follows the customer, a sheet with the lines, and one screen with the four
// things a shop actually needs to know — name, phone, where to send it, and how
// it will be paid for.
//
// Two rules are deliberate and both come from how small Indian shops sell:
//
//   · The cart lives in localStorage, keyed per website. Nobody is asked to make
//     an account to buy a ₹400 fan, and a cart that survives a refresh is the
//     difference between an order and an abandoned tab.
//   · The price shown is recomputed from the catalogue the page was rendered
//     with, and the server recomputes it again from the database before it
//     writes anything down. This screen is a preview of the total, not the
//     authority on it — a cart file edited in devtools buys nothing cheaper.

import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "react-qr-code";
import { Check, Minus, Phone, Plus, ShoppingBag, Trash2, Truck, X } from "lucide-react";
import { api } from "@/lib/api-client";
import { upiDeepLink } from "@/lib/site-utils";
import { money, priceCart } from "@/lib/commerce";
import { visitMeta } from "@/lib/site-utils";
import type { Business, CommerceSettings, Product } from "@/lib/types";

export interface CartLine {
  productId: string;
  qty: number;
}

const KEY = (slug: string) => `ws_cart_${slug}`;

/** Read the saved cart. Never throws: a corrupted cart is an empty cart. */
function readCart(slug: string): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY(slug)) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((row) => row && typeof row.productId === "string")
      .map((row) => ({ productId: row.productId, qty: Math.max(1, Math.min(99, Number(row.qty) || 1)) }));
  } catch {
    return [];
  }
}

function writeCart(slug: string, lines: CartLine[]) {
  try {
    if (lines.length) window.localStorage.setItem(KEY(slug), JSON.stringify(lines));
    else window.localStorage.removeItem(KEY(slug));
  } catch {
    /* private mode, or a full quota — the cart still works for this visit */
  }
}

/**
 * The cart, shared by the products grid, the bar and the checkout sheet.
 *
 * State lives in the site renderer rather than in each component, because the
 * "Add" button and the bar that counts the items are in different parts of the
 * tree and must never disagree about what is in the cart.
 */
export function useCart(slug: string, products: readonly Product[], settings: CommerceSettings) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);

  // Read after mount: the server has no localStorage, and rendering a cart on
  // the server that the client then disagrees with is a hydration error.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLines(readCart(slug));
    setReady(true);
  }, [slug]);

  const update = useCallback(
    (next: CartLine[]) => {
      setLines(next);
      writeCart(slug, next);
    },
    [slug],
  );

  const add = useCallback(
    (productId: string, qty = 1) => {
      const existing = lines.find((line) => line.productId === productId);
      const next = existing
        ? lines.map((line) => (line.productId === productId ? { ...line, qty: Math.min(99, line.qty + qty) } : line))
        : [...lines, { productId, qty: Math.max(1, Math.min(99, qty)) }];
      update(next);
      return next;
    },
    [lines, update],
  );

  const setQty = useCallback(
    (productId: string, qty: number) => {
      if (qty <= 0) update(lines.filter((line) => line.productId !== productId));
      else update(lines.map((line) => (line.productId === productId ? { ...line, qty: Math.min(99, qty) } : line)));
    },
    [lines, update],
  );

  const remove = useCallback(
    (productId: string) => update(lines.filter((line) => line.productId !== productId)),
    [lines, update],
  );
  const clear = useCallback(() => update([]), [update]);

  const total = useMemo(() => priceCart(products, lines, settings, "DELIVERY"), [products, lines, settings]);
  const count = useMemo(() => lines.reduce((sum, line) => sum + line.qty, 0), [lines]);

  return { lines, ready, add, setQty, remove, clear, count, total };
}

export type Cart = ReturnType<typeof useCart>;

/** The bar that follows the customer once there is something to buy. */
export function CartBar({ cart, onOpen, onTrack }: { cart: Cart; onOpen: () => void; onTrack: string }) {
  // Until the cart has been read from storage it is empty, and an empty cart is
  // nothing to show — so the bar cannot flash on the first paint.
  if (!cart.ready || cart.count === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-16 z-40 flex justify-center px-3 sm:bottom-4 sm:justify-end sm:px-6">
      <button
        type="button"
        onClick={onOpen}
        className="pointer-events-auto flex items-center gap-3 rounded-full bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:brightness-110 active:scale-[0.98]"
      >
        <span className="flex items-center gap-2">
          <ShoppingBag className="h-4 w-4" aria-hidden="true" />
          {cart.count} {cart.count === 1 ? "item" : "items"}
        </span>
        <span className="opacity-80">·</span>
        <span>{money(cart.total.total)}</span>
        <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium">View cart</span>
      </button>
      {onTrack && (
        <a
          href={onTrack}
          className="pointer-events-auto ml-2 hidden items-center rounded-full bg-white/95 px-3 py-2.5 text-xs font-medium text-zinc-600 shadow ring-1 ring-black/5 transition hover:text-[var(--brand-primary)] sm:flex"
        >
          Track an order
        </a>
      )}
    </div>
  );
}

interface PlacedOrder {
  number: string;
  total: number;
  items: { name: string; qty: number; price: number }[];
  payment: string;
  fulfilment: string;
  message: string;
  whatsappUrl: string;
}

/** The sheet: lines first, then the four questions a shop needs answered. */
export function CheckoutSheet({
  open, onClose, cart, business, products, settings, slug, preview = false, onPlaced,
}: {
  open: boolean;
  onClose: () => void;
  cart: Cart;
  business: Business;
  /** The catalogue the page rendered with — the only prices this screen trusts. */
  products: readonly Product[];
  settings: CommerceSettings;
  slug: string;
  /** The dashboard preview: everything works except placing a real order. */
  preview?: boolean;
  onPlaced: (order: PlacedOrder) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState(business.phone || "");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [fulfilment, setFulfilment] = useState<"DELIVERY" | "PICKUP">("DELIVERY");
  const [payment, setPayment] = useState<"COD" | "UPI">(settings.cod ? "COD" : "UPI");
  const [paymentRef, setPaymentRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);
  /** Honeypot. Hidden from people, filled by bots. */
  const [website, setWebsite] = useState("");

  const total = useMemo(
    () => priceCart(products, cart.lines, settings, fulfilment),
    [products, cart.lines, fulfilment, settings],
  );

  // Escape closes the sheet, the way every other dialog on the web behaves.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const upi = (business.upiId || "").trim();
  const payLink = upi ? upiDeepLink(upi, business.name, `Order payment`) : "";

  async function place() {
    if (preview) {
      setError("This is the dashboard preview — open your live site to place a real order.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const ids = visitMeta();
      const result = await api.post<{ order: PlacedOrder; whatsappUrl: string; message: string }>("/api/orders", {
        slug,
        name,
        phone,
        email,
        address: fulfilment === "PICKUP" ? "" : address,
        notes,
        website,
        fulfilment,
        payment,
        paymentRef,
        items: cart.lines,
        ...(ids.visit ? { visitor: ids.visitor, visit: ids.visit } : {}),
      });
      const order: PlacedOrder = {
        ...result.order,
        message: result.message,
        whatsappUrl: result.whatsappUrl,
      };
      setPlaced(order);
      onPlaced(order);
      cart.clear();
      // The order event is written by the server, inside the same transaction as
      // the order itself, so a beacon that never arrives cannot lose it.
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not place the order. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Your cart">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-base font-bold text-zinc-900">
            {placed ? "Order placed" : total.lines.length ? "Your cart" : "Your cart is empty"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {placed ? (
            <div className="text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <Check className="h-6 w-6" aria-hidden="true" />
              </span>
              <p className="mt-3 text-lg font-bold text-zinc-900">{placed.number}</p>
              <p className="mt-1 text-sm text-zinc-600">{placed.message}</p>
              <ul className="mt-4 space-y-1 rounded-xl bg-zinc-50 p-3 text-left text-sm text-zinc-700">
                {placed.items.map((item) => (
                  <li key={item.name} className="flex justify-between gap-3">
                    <span>{item.qty} × {item.name}</span>
                    <span>{money(item.price * item.qty)}</span>
                  </li>
                ))}
                <li className="flex justify-between border-t pt-1 font-semibold">
                  <span>Total</span>
                  <span>{money(placed.total)}</span>
                </li>
              </ul>
              <div className="mt-4 flex flex-col gap-2">
                {placed.whatsappUrl && (
                  <a
                    href={placed.whatsappUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl bg-[#25d366] px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    Send this order on WhatsApp
                  </a>
                )}
                <a href={`/s/${slug}/order`} className="rounded-xl border px-4 py-2.5 text-sm font-semibold text-zinc-700">
                  Track this order
                </a>
                <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-zinc-500">
                  Keep looking around
                </button>
              </div>
            </div>
          ) : total.lines.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">
              Add something from the products on this page and it will show up here.
            </p>
          ) : (
            <>
              <ul className="space-y-3">
                {total.lines.map((line) => (
                  <li key={line.productId} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-900">{line.name}</p>
                      <p className="text-xs text-zinc-500">{money(line.price)} each</p>
                    </div>
                    <div className="flex items-center gap-1 rounded-full border px-1 py-0.5">
                      <button type="button" aria-label={`One less ${line.name}`} className="rounded-full p-1 text-zinc-600 hover:bg-zinc-100"
                        onClick={() => cart.setQty(line.productId, line.qty - 1)}>
                        <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <span className="w-6 text-center text-sm font-semibold">{line.qty}</span>
                      <button type="button" aria-label={`One more ${line.name}`} className="rounded-full p-1 text-zinc-600 hover:bg-zinc-100"
                        onClick={() => cart.setQty(line.productId, line.qty + 1)}>
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                    <span className="w-16 text-right text-sm font-semibold text-zinc-900">{money(line.lineTotal)}</span>
                    <button type="button" aria-label={`Remove ${line.name}`} className="rounded p-1 text-zinc-400 hover:text-red-600"
                      onClick={() => cart.remove(line.productId)}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>

              <dl className="mt-4 space-y-1 rounded-xl bg-zinc-50 p-3 text-sm">
                <div className="flex justify-between"><dt className="text-zinc-600">Items</dt><dd>{money(total.subtotal)}</dd></div>
                <div className="flex justify-between">
                  <dt className="text-zinc-600">{fulfilment === "PICKUP" ? "Collect from the shop" : "Delivery"}</dt>
                  <dd>{total.delivery === 0 ? "Free" : money(total.delivery)}</dd>
                </div>
                {total.freeDeliveryShortfall > 0 && (
                  <p className="pt-1 text-xs text-emerald-700">
                    Add {money(total.freeDeliveryShortfall)} more for free delivery.
                  </p>
                )}
                {total.minOrderShortfall > 0 && (
                  <p className="pt-1 text-xs text-amber-700">
                    Minimum order is {money(settings.minOrder)} — {money(total.minOrderShortfall)} to go.
                  </p>
                )}
                <div className="flex justify-between border-t pt-1 text-base font-bold">
                  <dt>To pay</dt><dd>{money(total.total)}</dd>
                </div>
              </dl>

              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm ${fulfilment === "DELIVERY" ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/5 font-semibold" : ""}`}>
                    <input type="radio" name="fulfilment" className="sr-only" checked={fulfilment === "DELIVERY"}
                      onChange={() => setFulfilment("DELIVERY")} />
                    <Truck className="h-4 w-4" aria-hidden="true" /> Home delivery
                  </label>
                  <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm ${fulfilment === "PICKUP" ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/5 font-semibold" : ""} ${settings.pickup ? "" : "opacity-50"}`}>
                    <input type="radio" name="fulfilment" className="sr-only" checked={fulfilment === "PICKUP"} disabled={!settings.pickup}
                      onChange={() => setFulfilment("PICKUP")} />
                    I will collect it
                  </label>
                </div>

                <input
                  className="w-full rounded-xl border px-3 py-2.5 text-sm" placeholder="Your name" value={name} autoComplete="name"
                  onChange={(e) => setName(e.target.value)}
                />
                <input
                  className="w-full rounded-xl border px-3 py-2.5 text-sm" placeholder="Phone number" value={phone} inputMode="tel" autoComplete="tel"
                  onChange={(e) => setPhone(e.target.value)}
                />
                {fulfilment === "DELIVERY" && (
                  <textarea
                    className="w-full rounded-xl border px-3 py-2.5 text-sm" rows={2} placeholder="Delivery address"
                    value={address} onChange={(e) => setAddress(e.target.value)}
                  />
                )}
                <input
                  className="w-full rounded-xl border px-3 py-2.5 text-sm" placeholder="Email (optional)" value={email} inputMode="email" autoComplete="email"
                  onChange={(e) => setEmail(e.target.value)}
                />
                <textarea
                  className="w-full rounded-xl border px-3 py-2.5 text-sm" rows={2}
                  placeholder={fulfilment === "PICKUP" ? "Anything the shop should know? (optional)" : "Landmark, preferred time… (optional)"}
                  value={notes} onChange={(e) => setNotes(e.target.value)}
                />

                <div className="rounded-xl border p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">How will you pay?</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" disabled={!settings.cod}
                      onClick={() => setPayment("COD")}
                      className={`rounded-xl border px-3 py-2 text-sm ${payment === "COD" ? "border-[var(--brand-primary)] font-semibold" : ""} ${settings.cod ? "" : "opacity-40"}`}>
                      Cash on delivery
                    </button>
                    <button type="button" disabled={!upi}
                      onClick={() => setPayment("UPI")}
                      className={`rounded-xl border px-3 py-2 text-sm ${payment === "UPI" ? "border-[var(--brand-primary)] font-semibold" : ""} ${upi ? "" : "opacity-40"}`}>
                      Pay by UPI
                    </button>
                  </div>
                  {payment === "UPI" && upi && (
                    <div className="mt-3 flex flex-col items-center gap-2 border-t pt-3">
                      <QRCode value={payLink} size={132} bgColor="#ffffff" fgColor="#111827" />
                      <p className="text-xs text-zinc-600">Pay {money(total.total)} to <span className="font-mono">{upi}</span></p>
                      <a href={payLink} className="rounded-lg bg-[var(--brand-primary)] px-3 py-1.5 text-xs font-semibold text-white">
                        Open a UPI app
                      </a>
                      <input
                        className="w-full rounded-xl border px-3 py-2 text-xs"
                        placeholder="After paying, paste the UTR / reference (optional)"
                        value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                {/* Honeypot. Off-screen and skipped by tab order, not `hidden`:
                    a bot that checks visibility would skip a `display:none` field. */}
                <input
                  tabIndex={-1} aria-hidden="true" autoComplete="off"
                  className="pointer-events-none absolute h-0 w-0 opacity-0"
                  value={website} onChange={(e) => setWebsite(e.target.value)}
                />
              </div>
            </>
          )}
        </div>

        {!placed && total.lines.length > 0 && (
          <div className="border-t px-5 py-4">
            {error && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
            <button
              type="button"
              disabled={busy}
              onClick={place}
              className="w-full rounded-xl bg-[var(--brand-primary)] px-4 py-3 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-60"
            >
              {busy ? "Placing your order…" : `Place order · ${money(total.total)}`}
            </button>
            <p className="mt-2 text-center text-xs text-zinc-500">
              {business.phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3 w-3" aria-hidden="true" /> {business.phone} ·
                </span>
              )}{" "}
              The shop confirms every order before it is sent.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

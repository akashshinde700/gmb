// WebSetu — the shop: cart maths, order rules, and what a shopkeeper may do next.
//
// Nothing here touches the database or React. That matters more here than
// anywhere else in the codebase, because two of these functions decide money:
//
//   · prices() totals a cart. It takes the products as arguments and never a
//     client-supplied price, so the only way to change what is owed is to change
//     what the shop actually sells.
//   · nextStatuses() is the set of moves an order may legally make, and it is
//     the same list the dashboard buttons and the API validate against — a
//     cancelled order cannot be marked delivered by a stale tab.
//
// A shop can run on three payment methods and two fulfilment kinds, and the
// Indian default is cash on delivery, so that is what an unconfigured shop
// gets: COD, home delivery, no delivery charge, no minimum.

import type { CommerceSettings, OrderItem, OrderStatus } from "@/lib/types";

/** Milliseconds in a rupee — the smallest unit any of this rounds to. */
const PAISE = 100;

export const DEFAULT_COMMERCE: CommerceSettings = {
  enabled: false,
  deliveryCharge: 0,
  freeDeliveryAbove: 0,
  minOrder: 0,
  pickup: true,
  cod: true,
};

export const ORDER_STATUSES: OrderStatus[] = [
  "NEW", "CONFIRMED", "PACKED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED",
];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  NEW: "New",
  CONFIRMED: "Confirmed",
  PACKED: "Packed",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

/** What the customer is told, in the customer's words. */
export const STATUS_CUSTOMER_LINE: Record<OrderStatus, string> = {
  NEW: "We have your order and will confirm it shortly.",
  CONFIRMED: "Confirmed. We are getting it ready.",
  PACKED: "Packed and waiting to go out.",
  OUT_FOR_DELIVERY: "On its way to you.",
  DELIVERED: "Delivered. Thank you for your order.",
  CANCELLED: "This order was cancelled. Call the shop if that is unexpected.",
};

/**
 * The legal moves.
 *
 * Forward-only, with two deliberate exceptions: an order can be cancelled from
 * anything that has not been handed over, and a delivered order can go back to
 * out-for-delivery (a courier marked it delivered and then it turned up again).
 */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  NEW: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PACKED", "CANCELLED"],
  PACKED: ["OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "CANCELLED"],
  DELIVERED: ["OUT_FOR_DELIVERY"],
  CANCELLED: [],
};

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUSES as string[]).includes(value);
}

/** The moves allowed from here. An unknown stored status offers only the start. */
export function nextStatuses(status: string): OrderStatus[] {
  return isOrderStatus(status) ? TRANSITIONS[status] : ["CONFIRMED", "CANCELLED"];
}

export function canMove(from: string, to: string): boolean {
  return isOrderStatus(to) && nextStatuses(from).includes(to);
}

/** Orders the shop still has to act on — the number worth putting in the nav. */
export function isOpenOrder(status: string): boolean {
  return status !== "DELIVERED" && status !== "CANCELLED";
}

// ---------------------------------------------------------------- settings

/** Never throws: an unreadable blob means the shipped defaults, not a crash. */
export function readCommerce(json: string | null | undefined): CommerceSettings {
  let raw: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(json || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) raw = parsed as Record<string, unknown>;
  } catch {
    raw = {};
  }
  const money = (value: unknown, fallback: number) => {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n * PAISE) / PAISE, 10_000_000) : fallback;
  };
  return {
    enabled: raw.enabled === true,
    deliveryCharge: money(raw.deliveryCharge, DEFAULT_COMMERCE.deliveryCharge),
    freeDeliveryAbove: money(raw.freeDeliveryAbove, DEFAULT_COMMERCE.freeDeliveryAbove),
    minOrder: money(raw.minOrder, DEFAULT_COMMERCE.minOrder),
    // Both default on: an owner who has not thought about it should not lose the
    // walk-in customer who would rather collect, or the one with no UPI.
    pickup: raw.pickup !== false,
    cod: raw.cod !== false,
  };
}

/** Money as the customer sees it: no decimals when there are none to show. */
export function money(amount: number): string {
  const rounded = Math.round(amount * PAISE) / PAISE;
  return `₹${rounded.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

// ---------------------------------------------------------------- pricing

export interface PricedLine {
  productId: string;
  name: string;
  qty: number;
  /** The price actually charged, after any sale price. */
  price: number;
  lineTotal: number;
}

/** What a product costs today: the sale price when there is one. */
export function effectivePrice(product: { price?: number | null; salePrice?: number | null }): number {
  const sale = typeof product.salePrice === "number" && product.salePrice > 0 ? product.salePrice : null;
  const list = typeof product.price === "number" && product.price > 0 ? product.price : null;
  return round2(sale ?? list ?? 0);
}

const round2 = (n: number) => Math.round(n * PAISE) / PAISE;

export interface CartTotal {
  lines: PricedLine[];
  subtotal: number;
  delivery: number;
  total: number;
  /** Rupees still to spend before delivery is free; 0 when it already is. */
  freeDeliveryShortfall: number;
  /** Rupees still to spend to reach the minimum order; 0 when it is met. */
  minOrderShortfall: number;
}

/**
 * Price a cart against the shop's own products and rules.
 *
 * `wanted` is what the browser asked for — `{ productId, qty }` only. A product
 * that is not in `products` (deleted, or an id someone invented) is dropped
 * rather than priced at zero, and a price-less or price-hidden product cannot be
 * bought at all: those are the "ask for a quote" items, and the enquiry button
 * is how they are sold.
 */
export function priceCart(
  products: readonly {
    id: string; name: string; price?: number | null; salePrice?: number | null; hidePrice?: boolean;
  }[],
  wanted: readonly { productId?: unknown; qty?: unknown }[],
  settings: CommerceSettings,
  fulfilment: "DELIVERY" | "PICKUP" = "DELIVERY",
): CartTotal {
  const lines: PricedLine[] = [];
  for (const want of wanted) {
    const productId = typeof want?.productId === "string" ? want.productId : "";
    const product = products.find((p) => p.id === productId);
    if (!product || product.hidePrice) continue;
    const price = effectivePrice(product);
    if (price <= 0) continue;
    // Quantity is clamped rather than refused: a fat-fingered 9999 on a phone
    // should become "the most anyone could plausibly want", not an error page.
    const rawQty = typeof want?.qty === "number" ? want.qty : Number(want?.qty);
    const qty = Number.isFinite(rawQty) ? Math.max(1, Math.min(99, Math.floor(rawQty))) : 1;
    lines.push({ productId, name: product.name, qty, price, lineTotal: round2(price * qty) });
  }

  const subtotal = round2(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  const freeAbove = settings.freeDeliveryAbove;
  const qualifies = freeAbove > 0 && subtotal >= freeAbove;
  const delivery =
    fulfilment === "PICKUP" || subtotal === 0 || qualifies ? 0 : round2(settings.deliveryCharge);
  return {
    lines,
    subtotal,
    delivery,
    total: round2(subtotal + delivery),
    freeDeliveryShortfall: freeAbove > 0 && !qualifies && subtotal > 0 ? round2(freeAbove - subtotal) : 0,
    minOrderShortfall: settings.minOrder > 0 && subtotal < settings.minOrder ? round2(settings.minOrder - subtotal) : 0,
  };
}

/** What the customer asked for, before it becomes an order. */
export interface CheckoutRequest {
  customerName: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  fulfilment: "DELIVERY" | "PICKUP";
  payment: "COD" | "UPI";
  paymentRef: string;
  items: { productId: string; qty: number }[];
}

/**
 * What is wrong with a checkout, in words the customer can act on.
 *
 * Empty array means "place it". Phone is required because it is the only way
 * the shop can reach a customer in an India where the address is "near the
 * water tank": an order nobody can follow up is not an order.
 */
export function checkoutProblems(input: CheckoutRequest, settings: CommerceSettings, total: CartTotal): string[] {
  const problems: string[] = [];
  if (!input.items.length) problems.push("Your cart is empty");
  if (!input.customerName.trim()) problems.push("Please enter your name");
  if (!/^[+\d][\d\s-]{6,19}$/.test(input.phone.trim())) problems.push("Please enter a phone number we can call");
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) problems.push("That email does not look right");
  if (input.fulfilment === "DELIVERY" && !input.address.trim()) problems.push("Please enter the delivery address");
  if (input.fulfilment === "PICKUP" && !settings.pickup) problems.push("This shop does not offer pickup");
  if (input.payment === "COD" && !settings.cod) problems.push("This shop does not offer cash on delivery");
  if (total.minOrderShortfall > 0) {
    problems.push(`Minimum order is ${money(settings.minOrder)} — add ${money(total.minOrderShortfall)} more`);
  }
  return problems;
}

// ---------------------------------------------------------------- numbers

/**
 * The next order number for a shop.
 *
 * Sequential per business, because a shopkeeper reads these out loud on the
 * phone and "ORD-1042" survives that where a cuid does not. The caller passes
 * the highest number already used; the database has the unique index, so a race
 * loses the insert rather than duplicating a number.
 */
export function nextOrderNumber(highestExisting: string | null | undefined, prefix = "ORD"): string {
  const match = /(\d+)\s*$/.exec(highestExisting ?? "");
  const next = match ? Number(match[1]) + 1 : 1001;
  return `${prefix}-${next}`;
}

/** Highest first, by the numeric tail — "ORD-1042" beats "ORD-999". */
export function highestOrderNumber(numbers: readonly string[]): string | null {
  let best: string | null = null;
  let bestValue = -1;
  for (const number of numbers) {
    const match = /(\d+)\s*$/.exec(number);
    const value = match ? Number(match[1]) : -1;
    if (value > bestValue) {
      bestValue = value;
      best = number;
    }
  }
  return best;
}

// ---------------------------------------------------------------- reporting

export interface OrderLike {
  id: string;
  number: string;
  customerName: string;
  phone: string;
  status: string;
  payment: string;
  paymentStatus: string;
  total: number;
  createdAt: string | Date;
  itemsJson?: string;
}

/** Read an order's lines back. Malformed lines are skipped, never thrown on. */
export function orderItems(itemsJson: string | undefined | null): OrderItem[] {
  try {
    const parsed = JSON.parse(itemsJson || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((row) => row && typeof row === "object")
      .map((row) => ({
        productId: typeof row.productId === "string" ? row.productId : "",
        name: typeof row.name === "string" ? row.name : "",
        qty: Number.isFinite(Number(row.qty)) ? Number(row.qty) : 0,
        price: Number.isFinite(Number(row.price)) ? Number(row.price) : 0,
      }))
      .filter((row) => row.name && row.qty > 0);
  } catch {
    return [];
  }
}

/** One line per item, for a WhatsApp message or an email. */
export function itemsLine(items: readonly OrderItem[]): string {
  return items.map((item) => `${item.qty} × ${item.name}`).join(", ");
}

export interface OrderSummary {
  orders: number;
  open: number;
  delivered: number;
  cancelled: number;
  /** Money that has actually been delivered — the only number that is revenue. */
  earned: number;
  /** Money in open orders, i.e. quoted work rather than earned work. */
  pending: number;
}

export function summarizeOrders(rows: readonly Pick<OrderLike, "status" | "total">[]): OrderSummary {
  const summary: OrderSummary = { orders: rows.length, open: 0, delivered: 0, cancelled: 0, earned: 0, pending: 0 };
  for (const row of rows) {
    if (row.status === "DELIVERED") {
      summary.delivered++;
      summary.earned = round2(summary.earned + row.total);
    } else if (row.status === "CANCELLED") {
      summary.cancelled++;
    } else {
      summary.open++;
      summary.pending = round2(summary.pending + row.total);
    }
  }
  return summary;
}

/**
 * The same summary, from one grouped query rather than every row.
 *
 * A shop with four thousand orders must not load four thousand of them to print
 * four numbers, so the list endpoint asks the database to group and this adds
 * the groups up.
 */
export function summarizeGroups(
  groups: readonly { status: string; count: number; total: number }[],
): OrderSummary {
  const summary: OrderSummary = { orders: 0, open: 0, delivered: 0, cancelled: 0, earned: 0, pending: 0 };
  for (const group of groups) {
    const total = Number.isFinite(group.total) ? group.total : 0;
    summary.orders += group.count;
    if (group.status === "DELIVERED") {
      summary.delivered += group.count;
      summary.earned = round2(summary.earned + total);
    } else if (group.status === "CANCELLED") {
      summary.cancelled += group.count;
    } else {
      summary.open += group.count;
      summary.pending = round2(summary.pending + total);
    }
  }
  return summary;
}

/** CSV for the owner's accountant. Quoted, because a name may contain a comma. */
export function ordersCsv(rows: readonly OrderLike[]): string {
  const head = ["Order", "Date", "Customer", "Phone", "Items", "Subtotal", "Delivery", "Total", "Payment", "Paid", "Status"];
  const cell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  const lines = rows.map((row) => {
    const items = orderItems(row.itemsJson);
    return [
      row.number,
      new Date(row.createdAt).toISOString().slice(0, 10),
      row.customerName,
      row.phone,
      items.map((i) => `${i.qty} x ${i.name}`).join("; "),
      // Subtotal is recomputed from the lines rather than stored twice.
      items.reduce((sum, i) => sum + i.price * i.qty, 0).toFixed(2),
      (row.total - items.reduce((sum, i) => sum + i.price * i.qty, 0)).toFixed(2),
      row.total.toFixed(2),
      row.payment,
      row.paymentStatus,
      row.status,
    ].map(cell).join(",");
  });
  return [head.join(","), ...lines].join("\n");
}

/**
 * Look an order up the way a customer can: the number and the phone it was
 * placed with. A number alone is guessable ("ORD-1001"), so the phone is the
 * password — and a wrong phone must be indistinguishable from a wrong number,
 * which is why this returns a boolean rather than the row.
 */
export function trackingMatches(order: { number: string; phone: string }, number: string, phone: string): boolean {
  const digits = (value: string) => value.replace(/\D/g, "").slice(-10);
  if (!number.trim() || !phone.trim()) return false;
  if (order.number.trim().toLowerCase() !== number.trim().toLowerCase()) return false;
  const wanted = digits(phone);
  const stored = digits(order.phone);
  return wanted.length >= 10 && stored.length >= 10 && wanted === stored;
}

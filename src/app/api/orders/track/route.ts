import { db } from "@/lib/db";
import { HttpError, limitOrThrow, ok, readJson, route, str } from "@/lib/api";
import { money, orderItems, STATUS_CUSTOMER_LINE, trackingMatches, isOrderStatus } from "@/lib/commerce";
import type { OrderStatus } from "@/lib/types";

/**
 * POST /api/orders/track — "where is my order?", the question a shop answers on
 * the phone twenty times a day.
 *
 * Public, so it is guarded rather than authenticated: the order number AND the
 * phone it was placed with. A number alone is guessable ("ORD-1001"), so the
 * phone is the password — and a wrong number and a wrong phone give the same
 * 404, because a lookup that says "correct number, wrong phone" has just told a
 * stranger that the order exists.
 */
export const POST = route(async (req: Request) => {
  const body = await readJson<{ slug?: string; number?: string; phone?: string }>(req);
  const slug = str(body.slug, 120);
  const number = str(body.number, 40);
  const phone = str(body.phone, 20);
  if (!slug || !number || !phone) throw new HttpError("Please enter your order number and phone number");

  // This is a two-factor-by-obscurity endpoint; without a cap it is also a
  // phone-number oracle. Ten tries per IP per ten minutes.
  limitOrThrow(req, "order:track", 10, 10 * 60 * 1000);

  const business = await db.business.findUnique({
    where: { slug },
    select: { id: true, name: true, phone: true, whatsapp: true, status: true },
  });
  if (!business || business.status !== "PUBLISHED") throw new HttpError("Order not found", 404);

  const order = await db.order.findFirst({
    where: { businessId: business.id, number },
    select: {
      number: true, phone: true, customerName: true, itemsJson: true, subtotal: true,
      delivery: true, total: true, status: true, payment: true, paymentStatus: true,
      fulfilment: true, address: true, notes: true, createdAt: true, updatedAt: true,
    },
  });
  if (!order || !trackingMatches(order, number, phone)) throw new HttpError("Order not found", 404);

  const status: OrderStatus = isOrderStatus(order.status) ? order.status : "NEW";
  const waNumber = (business.whatsapp || business.phone || "").replace(/\D/g, "");
  const waText = encodeURIComponent(`Hello ${business.name}, about order ${order.number}…`);

  return ok({
    order: {
      number: order.number,
      customerName: order.customerName,
      items: orderItems(order.itemsJson),
      subtotal: order.subtotal,
      delivery: order.delivery,
      total: order.total,
      totalLabel: money(order.total),
      status,
      statusLine: STATUS_CUSTOMER_LINE[status],
      payment: order.payment,
      paymentStatus: order.paymentStatus,
      fulfilment: order.fulfilment,
      address: order.fulfilment === "PICKUP" ? "" : order.address,
      notes: order.notes,
      placedAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    },
    shop: {
      name: business.name,
      whatsappUrl: waNumber ? `https://wa.me/${waNumber.length === 10 ? `91${waNumber}` : waNumber}?text=${waText}` : "",
      phone: business.phone,
    },
  });
});

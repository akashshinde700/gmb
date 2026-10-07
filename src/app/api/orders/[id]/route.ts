import { db } from "@/lib/db";
import { HttpError, ok, readJson, requireBusiness, requireUser, route, str } from "@/lib/api";
import { canMove, isOpenOrder, money, nextStatuses, ORDER_STATUSES, orderItems, STATUS_LABEL } from "@/lib/commerce";
import type { OrderStatus } from "@/lib/types";

/**
 * One order, from the shop's side.
 *
 *   GET    /api/orders/[id] — the order, its lines, and what may be done to it
 *   PATCH  /api/orders/[id] — move it along, mark it paid, write a note
 *   DELETE /api/orders/[id] — remove a spam or test order
 *
 * The legal moves come from lib/commerce, the same list the dashboard buttons
 * are built from, so a stale tab cannot mark a cancelled order delivered — and
 * the API says why when it refuses.
 */

async function ownOrder(req: Request, id: string) {
  const session = await requireUser(req);
  const business = await requireBusiness(session);
  const order = await db.order.findFirst({ where: { id, businessId: business.id } });
  if (!order) throw new HttpError("Order not found", 404);
  return { session, business, order };
}

function serialize(order: Awaited<ReturnType<typeof db.order.findFirstOrThrow>>) {
  return {
    id: order.id,
    number: order.number,
    customerName: order.customerName,
    phone: order.phone,
    email: order.email,
    address: order.address,
    notes: order.notes,
    ownerNotes: order.ownerNotes,
    items: orderItems(order.itemsJson),
    subtotal: order.subtotal,
    delivery: order.delivery,
    total: order.total,
    totalLabel: money(order.total),
    fulfilment: order.fulfilment,
    payment: order.payment,
    paymentStatus: order.paymentStatus,
    paymentRef: order.paymentRef,
    status: order.status,
    statusLabel: STATUS_LABEL[order.status as OrderStatus] ?? order.status,
    open: isOpenOrder(order.status),
    leadId: order.leadId,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    nextStatuses: nextStatuses(order.status),
  };
}

export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { order } = await ownOrder(req, str((await params).id, 40));
  return ok({ order: serialize(order) });
});

export const PATCH = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const id = str((await params).id, 40);
  const { business, order } = await ownOrder(req, id);
  const body = await readJson<{
    status?: string; paymentStatus?: string; paymentRef?: string; ownerNotes?: string;
  }>(req);

  const data: Record<string, unknown> = {};

  if (body.status !== undefined) {
    const next = str(body.status, 20);
    if (!ORDER_STATUSES.includes(next as OrderStatus)) throw new HttpError("That is not an order status");
    if (next === order.status) {
      // Not an error — a double-tapped button should not look like a failure.
      return ok({ order: serialize(order) });
    }
    if (!canMove(order.status, next)) {
      throw new HttpError(
        `An order that is ${STATUS_LABEL[order.status as OrderStatus] ?? order.status} cannot be marked ${STATUS_LABEL[next as OrderStatus]}`,
        409,
      );
    }
    data.status = next;
  }

  if (body.paymentStatus !== undefined) {
    const paid = str(body.paymentStatus, 20);
    if (!["PENDING", "PAID", "REFUNDED"].includes(paid)) throw new HttpError("That is not a payment status");
    data.paymentStatus = paid;
    // Marking an order paid is the shop confirming the money arrived, so the
    // payment reference is what they typed, not what the customer claimed.
    if (str(body.paymentRef, 80)) data.paymentRef = str(body.paymentRef, 80);
  }

  if (body.ownerNotes !== undefined) data.ownerNotes = str(body.ownerNotes, 2000);
  if (!Object.keys(data).length) throw new HttpError("Nothing to update");

  const updated = await db.order.update({ where: { id: order.id }, data });

  // A note for the record: who moved it, and where to.
  if (data.status) {
    await db.analyticsEvent.create({
      data: {
        businessId: business.id,
        type: "ORDER_STATUS",
        path: `/orders/${order.number}`,
        meta: JSON.stringify({ orderId: order.id, to: String(data.status) }),
      },
    }).catch(() => 0);
  }

  return ok({ order: serialize(updated) });
});

export const DELETE = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { order } = await ownOrder(req, str((await params).id, 40));
  // Delivered orders are the shop's sales history — deleting one silently
  // changes how much the business earned this month.
  if (order.status === "DELIVERED") {
    throw new HttpError("A delivered order is part of your history. Cancel it instead.", 409);
  }
  await db.order.delete({ where: { id: order.id } });
  return ok({ deleted: true, number: order.number });
});

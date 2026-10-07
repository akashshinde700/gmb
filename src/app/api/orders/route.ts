import { db } from "@/lib/db";
import { after } from "next/server";
import {
  HttpError, limitOrThrow, limitSubjectOrThrow, ok, pageParams, readJson, requireBusiness,
  requireUser, route, str,
} from "@/lib/api";
import { subscriptionServesSite } from "@/lib/expiry";
import { isVisitId } from "@/lib/visits";
import { sendLeadAlert } from "@/lib/emails";
import { sendLeadSms, smsConfigured } from "@/lib/sms";
import {
  checkoutProblems, highestOrderNumber, isOpenOrder, isOrderStatus, itemsLine, money,
  nextOrderNumber, orderItems, priceCart, readCommerce, summarizeGroups,
  type CheckoutRequest,
} from "@/lib/commerce";
import type { OrderItem } from "@/lib/types";

/**
 * Orders — the shop side of a tenant's website, and the owner's inbox for them.
 *
 *   POST /api/orders  place an order (public, unauthenticated)
 *   GET  /api/orders  list them (owner only)
 *
 * The POST is the money path, so nothing in the request decides a price: the
 * browser sends product ids and quantities, and the server prices them from the
 * shop's own catalogue. A tampered cart changes what the shop is told to send,
 * never what the customer owes.
 */

/** Alerts are on unless switched off; an unreadable blob reads as "on". */
function leadAlertsEnabled(notifyJson: string | undefined | null): boolean {
  try {
    const prefs = JSON.parse(notifyJson || "{}") as { leadAlerts?: boolean };
    return prefs.leadAlerts !== false;
  } catch {
    return true;
  }
}

function smsAlertsEnabled(notifyJson: string | undefined | null): boolean {
  try {
    const prefs = JSON.parse(notifyJson || "{}") as { smsAlerts?: boolean };
    return prefs.smsAlerts === true;
  } catch {
    return false;
  }
}

export const POST = route(async (req: Request) => {
  const body = await readJson<Record<string, unknown>>(req);
  const slug = str(body.slug, 120);
  if (!slug) throw new HttpError("Website not specified");

  // Unauthenticated write path: capped per IP and per shop, so one script cannot
  // create orders a shopkeeper then has to phone about.
  limitOrThrow(req, "order:ip", 8, 10 * 60 * 1000);
  limitSubjectOrThrow(`order:site:${slug}`, 20, 10 * 60 * 1000);

  const business = await db.business.findUnique({
    where: { slug },
    include: {
      subscription: true,
      products: { orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] },
      user: { select: { email: true, name: true, notifyJson: true } },
    },
  });
  if (!business) throw new HttpError("Shop not found", 404);
  if (business.status !== "PUBLISHED") {
    throw new HttpError("This website is not accepting orders right now", 403);
  }
  if (!subscriptionServesSite(business.subscription)) {
    throw new HttpError("This website is not accepting orders right now", 403);
  }

  const settings = readCommerce(business.commerceJson);
  if (!settings.enabled) {
    throw new HttpError("This shop does not take orders on the website yet — please send an enquiry", 403);
  }

  const rawItems = Array.isArray(body.items) ? (body.items as { productId?: unknown; qty?: unknown }[]) : [];
  const fulfilment: "DELIVERY" | "PICKUP" = body.fulfilment === "PICKUP" ? "PICKUP" : "DELIVERY";
  const payment: "COD" | "UPI" = body.payment === "UPI" ? "UPI" : "COD";

  const total = priceCart(business.products, rawItems, settings, fulfilment);
  const request: CheckoutRequest = {
    customerName: str(body.name, 100),
    phone: str(body.phone, 20),
    email: str(body.email, 200),
    address: str(body.address, 400),
    notes: str(body.notes, 1000),
    fulfilment,
    payment,
    paymentRef: str(body.paymentRef, 80),
    items: total.lines.map((line) => ({ productId: line.productId, qty: line.qty })),
  };

  // A hidden field no human fills in. Cheaper than a captcha and it stops the
  // bots that fill every input they find.
  if (str(body.website, 200)) throw new HttpError("We could not place that order", 422);

  const problems = checkoutProblems(request, settings, total);
  if (problems.length) throw new HttpError(problems.join(" · "), 422);

  const items: OrderItem[] = total.lines.map((line) => ({
    productId: line.productId, name: line.name, qty: line.qty, price: line.price,
  }));

  // The number the shopkeeper will read out loud. Sequential per shop; the
  // unique index is the referee, so a simultaneous second order retries rather
  // than sharing a number.
  const recent = await db.order.findMany({
    where: { businessId: business.id },
    select: { number: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  let number = nextOrderNumber(highestOrderNumber(recent.map((r) => r.number)));

  const summaryLine = itemsLine(items);
  const placed = await (async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await db.$transaction(async (tx) => {
          const order = await tx.order.create({
            data: {
              businessId: business.id,
              number,
              customerName: request.customerName,
              phone: request.phone,
              email: request.email,
              address: request.address,
              notes: request.notes,
              itemsJson: JSON.stringify(items),
              subtotal: total.subtotal,
              delivery: total.delivery,
              total: total.total,
              fulfilment,
              payment,
              paymentRef: request.paymentRef,
              visitId: isVisitId(str(body.visit, 40)) ? str(body.visit, 40) : "",
            },
          });

          // The order also files an enquiry. A shop that sells online still
          // reads one inbox, and the lead is what the WhatsApp alert, the SMS
          // and the "what to do next" machinery already understand.
          const lead = await tx.lead.create({
            data: {
              businessId: business.id,
              name: request.customerName,
              phone: request.phone,
              email: request.email,
              message: [
                `Order ${number} — ${itemsLine(items)}`,
                `Total ${money(total.total)} (${payment === "UPI" ? "UPI" : "cash on delivery"})`,
                fulfilment === "PICKUP" ? "Collect from the shop" : `Deliver to: ${request.address}`,
                request.notes,
              ].filter(Boolean).join("\n"),
              serviceName: `Order ${number}`,
              source: "FORM",
            },
          });

          const meta: Record<string, string> = { leadId: lead.id, orderId: order.id, order: number };
          const visitor = str(body.visitor, 40);
          const visit = str(body.visit, 40);
          if (isVisitId(visitor)) meta.visitor = visitor;
          if (isVisitId(visit)) meta.visit = visit;
          await tx.analyticsEvent.create({
            data: { businessId: business.id, type: "ORDER_PLACED", path: "/shop", meta: JSON.stringify(meta) },
          });

          await tx.notification.create({
            data: {
              userId: business.userId,
              title: `New order ${number} 🛍️`,
              body: `${request.customerName} (${request.phone}) ordered ${summaryLine} — ${money(total.total)}.`,
            },
          });

          return { order, leadId: lead.id };
        });
      } catch (error) {
        // P2002 = the unique index on `number`. Somebody else took it; try the
        // next one instead of failing an order the customer already placed.
        if ((error as { code?: string })?.code === "P2002" && attempt < 2) {
          number = nextOrderNumber(number);
          continue;
        }
        throw error;
      }
    }
    throw new HttpError("Could not place the order — please try again", 500);
  })();

  // The buyer's own copy of what they just bought, ready to send to the shop —
  // a WhatsApp message is the receipt most Indian shops actually keep.
  const waNumber = (business.whatsapp || business.phone || "").replace(/\D/g, "");
  const waText = encodeURIComponent(
    `Order ${number}\n${items.map((i) => `${i.qty} × ${i.name}`).join("\n")}\nTotal: ${money(total.total)}\n${request.customerName}, ${request.phone}`,
  );
  const whatsappUrl = waNumber ? `https://wa.me/${waNumber.length === 10 ? `91${waNumber}` : waNumber}?text=${waText}` : "";

  // Notifications go out after the response: the buyer sees their order number
  // immediately, and a mail server having a bad afternoon cannot fail an order.
  after(async () => {
    const alertsOn = leadAlertsEnabled(business.user?.notifyJson);
    const ownerEmail = business.email || business.user?.email || "";
    if (alertsOn && ownerEmail) {
      await sendLeadAlert({
        to: ownerEmail,
        businessName: business.name,
        lead: {
          name: request.customerName,
          phone: request.phone,
          email: request.email,
          message: [
            `Order ${number} — ${itemsLine(items)}`,
            `Total ${money(total.total)} (${payment === "UPI" ? "UPI" : "cash on delivery"})`,
            fulfilment === "PICKUP" ? "Collect from the shop" : `Deliver to: ${request.address}`,
            request.notes,
          ].filter(Boolean).join("\n"),
          serviceName: `Order ${number}`,
        },
      });
    }
    if (smsAlertsEnabled(business.user?.notifyJson) && smsConfigured()) {
      const ownerPhone = business.whatsapp || business.phone;
      if (ownerPhone) {
        await sendLeadSms({
          to: ownerPhone,
          businessName: business.name,
          leadName: `${request.customerName} — order ${number}`,
          leadPhone: request.phone,
          serviceName: money(total.total),
        });
      }
    }
  });

  return ok(
    {
      order: {
        id: placed.order.id,
        number,
        subtotal: total.subtotal,
        delivery: total.delivery,
        total: total.total,
        items,
        fulfilment,
        payment,
        status: placed.order.status,
      },
      whatsappUrl,
      trackUrl: `/s/${business.slug}/order`,
      message: `Order ${number} received. ${business.name} will confirm it on ${request.phone}.`,
    },
    201,
  );
});

/** GET /api/orders — the owner's list, with the numbers the dashboard shows. */
export const GET = route(async (req: Request) => {
  const session = await requireUser(req);
  const business = await requireBusiness(session);
  const { take, skip, searchParams } = pageParams(req, 50, 200);

  const status = str(searchParams.get("status"), 20);
  if (status && status !== "ALL" && !isOrderStatus(status)) throw new HttpError("Invalid status filter");
  const query = str(searchParams.get("q"), 80);

  const where = {
    businessId: business.id,
    ...(status && status !== "ALL" && status !== "OPEN" ? { status } : {}),
    ...(status === "OPEN" ? { status: { notIn: ["DELIVERED", "CANCELLED"] } } : {}),
    ...(query
      ? {
          OR: [
            { number: { contains: query } },
            { customerName: { contains: query } },
            { phone: { contains: query } },
          ],
        }
      : {}),
  };

  const [rows, filtered, byStatus] = await Promise.all([
    db.order.findMany({ where, orderBy: { createdAt: "desc" }, take, skip }),
    db.order.count({ where }),
    // The headline numbers are over every order, not this page: a shop wants to
    // know how much it has earned, not how much of page one it earned.
    db.order.groupBy({ by: ["status"], where: { businessId: business.id }, _count: { _all: true }, _sum: { total: true } }),
  ]);

  const all = byStatus.map((row) => ({
    status: row.status,
    total: row._sum.total ?? 0,
    count: row._count._all,
  }));
  const summary = summarizeGroups(all);
  const settings = readCommerce(business.commerceJson);

  return ok(
    {
      orders: rows.map((row) => ({
        id: row.id,
        number: row.number,
        customerName: row.customerName,
        phone: row.phone,
        email: row.email,
        address: row.address,
        notes: row.notes,
        ownerNotes: row.ownerNotes,
        items: orderItems(row.itemsJson),
        subtotal: row.subtotal,
        delivery: row.delivery,
        total: row.total,
        fulfilment: row.fulfilment,
        payment: row.payment,
        paymentStatus: row.paymentStatus,
        paymentRef: row.paymentRef,
        status: row.status,
        open: isOpenOrder(row.status),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      summary,
      counts: Object.fromEntries(all.map((row) => [row.status, row.count])),
      settings,
    },
    200,
    { total: filtered, take, skip },
  );
});

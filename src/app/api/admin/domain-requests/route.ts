import { db } from "@/lib/db";
import { audit, HttpError, ok, readJson, requireAdmin, route, str } from "@/lib/api";
import { DOMAIN_REQUEST_STATUSES, serializeDomainRequest, type DomainRequestStatus } from "@/lib/domain-requests";
import { checkHostname, domainAllowance, newDomainToken, verifyDomain } from "@/lib/domains";

export const runtime = "nodejs";

/** GET /api/admin/domain-requests?status=… — every request, newest first. */
export const GET = route(async (req: Request) => {
  await requireAdmin(req);
  const status = str(new URL(req.url).searchParams.get("status"), 20);
  const rows = await db.domainRequest.findMany({
    where: DOMAIN_REQUEST_STATUSES.includes(status as DomainRequestStatus) ? { status } : {},
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { business: { select: { id: true, name: true, slug: true, phone: true, email: true, ownerName: true } } },
  });
  return ok({
    requests: rows.map((r) => ({ ...serializeDomainRequest(r), business: r.business })),
  });
});

const CUSTOMER_MESSAGE: Partial<Record<DomainRequestStatus, (domain: string, price: number | null) => string>> = {
  QUOTED: (d, p) => `${d} can be registered for you${p ? ` at ₹${p.toLocaleString("en-IN")}/year` : ""}. Our team will share payment details — the domain is paid separately from your WebSetu plan.`,
  PAID: (d) => `Payment received for ${d}. We are registering it and will connect it to your website shortly.`,
  CONNECTED: (d) => `${d} is now connected to your website. It goes live as soon as DNS updates (usually within an hour).`,
  CANCELLED: (d) => `Your request for ${d} was closed. Reply to us if you would like a different domain.`,
};

/**
 * PATCH /api/admin/domain-requests
 *   { id, status?, quotedPrice?, adminNote?, domain? }
 * Moving to CONNECTED attaches www.<domain> (primary) and the bare domain to
 * the business, granting the domain credits needed so the plan limit never
 * blocks a domain the customer has paid for.
 */
export const PATCH = route(async (req: Request) => {
  const session = await requireAdmin(req);
  const body = await readJson<{ id?: string; status?: string; quotedPrice?: unknown; adminNote?: string; domain?: string }>(req);
  const row = await db.domainRequest.findUnique({ where: { id: str(body.id, 40) } });
  if (!row) throw new HttpError("Request not found", 404);

  const data: Record<string, unknown> = {};
  if (body.adminNote !== undefined) data.adminNote = str(body.adminNote, 1000);
  if (body.quotedPrice !== undefined) {
    const price = body.quotedPrice === null || body.quotedPrice === "" ? null : Number(body.quotedPrice);
    if (price !== null && (!Number.isFinite(price) || price < 0 || price > 1_000_000)) throw new HttpError("Invalid price");
    data.quotedPrice = price;
  }
  // The admin may have registered one of the alternatives instead.
  if (body.domain !== undefined) {
    const c = checkHostname(str(body.domain, 253));
    if (!c.ok) throw new HttpError(c.error || "Invalid domain");
    data.domain = c.hostname.replace(/^www\./, "");
  }
  let status = row.status as DomainRequestStatus;
  if (body.status !== undefined) {
    if (!DOMAIN_REQUEST_STATUSES.includes(body.status as DomainRequestStatus)) throw new HttpError("Invalid status");
    status = body.status as DomainRequestStatus;
    data.status = status;
  }
  const domain = (data.domain as string | undefined) ?? row.domain;

  if (status === "CONNECTED" && row.status !== "CONNECTED") {
    const business = await db.business.findUnique({
      where: { id: row.businessId },
      include: { subscription: { include: { plan: true } } },
    });
    if (!business) throw new HttpError("Business not found", 404);

    const wanted = [`www.${domain}`, domain];
    for (const host of wanted) {
      const taken = await db.domain.findUnique({ where: { hostname: host } });
      if (taken && taken.businessId !== business.id) {
        throw new HttpError(`${host} is already connected to another site`, 409);
      }
    }
    const existing = await db.domain.findMany({ where: { businessId: business.id } });
    const toAdd = wanted.filter((h) => !existing.some((d) => d.hostname === h));
    const allowance = domainAllowance(business.subscription?.plan, business);
    const shortfall = allowance === -1 ? 0 : Math.max(0, existing.length + toAdd.length - allowance);
    if (shortfall) {
      await db.business.update({ where: { id: business.id }, data: { domainCredits: { increment: shortfall } } });
    }
    const hasPrimary = existing.some((d) => d.primary);
    const created = [];
    for (const host of toAdd) {
      created.push(await db.domain.create({
        data: {
          businessId: business.id,
          hostname: host,
          token: newDomainToken(),
          primary: !hasPrimary && host.startsWith("www."),
        },
      }));
    }
    for (const d of created) await verifyDomain(d.id);
  }

  const updated = await db.domainRequest.update({ where: { id: row.id }, data });

  if (body.status !== undefined && status !== row.status) {
    const message = CUSTOMER_MESSAGE[status]?.(domain, updated.quotedPrice);
    const owner = await db.business.findUnique({ where: { id: row.businessId }, select: { userId: true } });
    if (message && owner) {
      await db.notification.create({ data: { userId: owner.userId, title: `Domain update: ${domain}`, body: message } });
    }
  }

  await audit({
    actor: session.id,
    action: "DOMAIN_REQUEST_UPDATED",
    entity: "domainRequest",
    entityId: row.id,
    meta: { from: row.status, to: status, quotedPrice: updated.quotedPrice, domain },
  });

  return ok({ request: serializeDomainRequest(updated) });
});

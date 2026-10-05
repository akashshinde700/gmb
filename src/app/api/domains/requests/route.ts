import { db } from "@/lib/db";
import {
  audit, HttpError, limitSubjectOrThrow, ok, readJson, requireBusiness, requireUser, route, str,
} from "@/lib/api";
import {
  checkAvailability, notifyAdmins, parseWantedDomain, serializeDomainRequest,
} from "@/lib/domain-requests";

export const runtime = "nodejs";

/** GET /api/domains/requests — this tenant's "buy a domain for me" requests. */
export const GET = route(async (req: Request) => {
  const session = await requireUser(req);
  const business = await requireBusiness(session);
  const rows = await db.domainRequest.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return ok({ requests: rows.map(serializeDomainRequest) });
});

/**
 * POST /api/domains/requests
 *   { check: "shop.com" }                         → availability hint only
 *   { domain, alternatives?: string[], note? }    → create a request
 */
export const POST = route(async (req: Request) => {
  const session = await requireUser(req);
  const business = await requireBusiness(session);
  const body = await readJson<{ check?: string; domain?: string; alternatives?: unknown; note?: string }>(req);

  if (body.check !== undefined) {
    limitSubjectOrThrow(`domain:check:${business.id}`, 30, 10 * 60 * 1000);
    const parsed = parseWantedDomain(str(body.check, 253));
    if (!parsed.ok) throw new HttpError(parsed.error);
    return ok({ domain: parsed.domain, availability: await checkAvailability(parsed.domain) });
  }

  limitSubjectOrThrow(`domain:request:${business.id}`, 5, 60 * 60 * 1000);
  const parsed = parseWantedDomain(str(body.domain, 253));
  if (!parsed.ok) throw new HttpError(parsed.error);

  const alternatives = (Array.isArray(body.alternatives) ? body.alternatives : [])
    .slice(0, 3)
    .map((a) => parseWantedDomain(str(a, 253)))
    .filter((a): a is { ok: true; domain: string } => a.ok && a.domain !== parsed.domain)
    .map((a) => a.domain);

  const open = await db.domainRequest.count({
    where: { businessId: business.id, status: { in: ["REQUESTED", "QUOTED", "PAID"] } },
  });
  if (open >= 2) {
    throw new HttpError("You already have a domain request in progress — we will contact you about it shortly.", 409);
  }

  const availability = await checkAvailability(parsed.domain);
  const request = await db.domainRequest.create({
    data: {
      businessId: business.id,
      domain: parsed.domain,
      alternatives: alternatives.join(","),
      note: str(body.note, 500),
      availability,
    },
  });

  await audit({
    actor: session.id,
    action: "DOMAIN_REQUESTED",
    entity: "domainRequest",
    entityId: request.id,
    meta: { domain: parsed.domain, availability },
  });

  await notifyAdmins(
    `Domain request: ${parsed.domain}`,
    `${business.name} (${business.phone}) wants us to buy ${parsed.domain}` +
      (alternatives.length ? ` (alternatives: ${alternatives.join(", ")})` : "") +
      `. Availability check: ${availability}.` +
      (request.note ? `\nNote: ${request.note}` : "") +
      `\nQuote the price in Admin → Domains.`,
  );

  return ok({ request: serializeDomainRequest(request) }, 201);
});

/** DELETE /api/domains/requests?id=… — the customer withdraws a request not yet paid for. */
export const DELETE = route(async (req: Request) => {
  const session = await requireUser(req);
  const business = await requireBusiness(session);
  const id = str(new URL(req.url).searchParams.get("id"), 40);
  const row = await db.domainRequest.findFirst({ where: { id, businessId: business.id } });
  if (!row) throw new HttpError("Request not found", 404);
  if (!["REQUESTED", "QUOTED"].includes(row.status)) {
    throw new HttpError("This request has already been paid for — contact us to change it.", 409);
  }
  const updated = await db.domainRequest.update({ where: { id: row.id }, data: { status: "CANCELLED" } });
  return ok({ request: serializeDomainRequest(updated) });
});

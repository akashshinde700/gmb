import { db } from "@/lib/db";
import { audit, HttpError, limitSubjectOrThrow, ok, readJson, requireBusiness, requireUser, route } from "@/lib/api";
import { forgetHost, txtRecordName, txtRecordValue, verifyDomain } from "@/lib/domains";

export const runtime = "nodejs";

/**
 * POST /api/domains/[id] — re-run the DNS check ("Check now" in the dashboard).
 * PATCH /api/domains/[id] — make this the canonical domain for the business.
 */

type Params = { params: Promise<{ id: string }> };

function serialize(d: {
  id: string; hostname: string; status: string; token: string; primary: boolean;
  lastCheckAt: Date | null; lastError: string; verifiedAt: Date | null; createdAt: Date;
}) {
  return {
    id: d.id,
    hostname: d.hostname,
    status: d.status,
    primary: d.primary,
    lastError: d.lastError,
    lastCheckAt: d.lastCheckAt?.toISOString() ?? null,
    verifiedAt: d.verifiedAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
    txtName: txtRecordName(d.hostname),
    txtValue: txtRecordValue(d.token),
  };
}

/** Resolve a domain that belongs to the session's own business, or 404. */
async function ownDomain(req: Request, id: string) {
  const session = await requireUser(req);
  const business = await requireBusiness(session);
  const domain = await db.domain.findFirst({ where: { id, businessId: business.id } });
  if (!domain) throw new HttpError("Domain not found", 404);
  return { session, business, domain };
}

export const POST = route(async (req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const { domain } = await ownDomain(req, id);

  // Each check is a live DNS lookup, and an impatient customer will hold the
  // button down while they wait for propagation.
  limitSubjectOrThrow(`domain:check:${domain.id}`, 20, 10 * 60 * 1000);

  const updated = await verifyDomain(domain.id);
  if (!updated) throw new HttpError("Domain not found", 404);
  return ok({ domain: serialize(updated) });
});

export const PATCH = route(async (req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const { session, business, domain } = await ownDomain(req, id);

  const body = await readJson<{ primary?: boolean }>(req);
  if (body.primary !== true) throw new HttpError("Nothing to update");

  if (domain.status !== "ACTIVE") {
    throw new HttpError("Verify this domain before making it the primary one");
  }

  // Exactly one primary per business: demote the rest in the same transaction,
  // or a failure halfway through would leave two canonical domains redirecting
  // at each other.
  await db.$transaction([
    db.domain.updateMany({ where: { businessId: business.id }, data: { primary: false } }),
    db.domain.update({ where: { id: domain.id }, data: { primary: true } }),
  ]);

  // Every domain of this business now resolves to a different canonical host.
  const siblings = await db.domain.findMany({
    where: { businessId: business.id },
    select: { hostname: true },
  });
  for (const s of siblings) forgetHost(s.hostname);

  await audit({
    actor: session.id,
    action: "DOMAIN_SET_PRIMARY",
    entity: "domain",
    entityId: domain.id,
    meta: { hostname: domain.hostname },
  });

  const updated = await db.domain.findUnique({ where: { id: domain.id } });
  return ok({ domain: serialize(updated!) });
});

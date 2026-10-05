import { db } from "@/lib/db";
import {
  audit, HttpError, limitSubjectOrThrow, ok, readJson, requireBusiness, requireUser, route, str,
} from "@/lib/api";
import {
  checkHostname, dnsTarget, domainAllowance, forgetHost, newDomainToken,
  txtRecordName, txtRecordValue, verifyDomain,
} from "@/lib/domains";
import { notifyAdmins } from "@/lib/domain-requests";

export const runtime = "nodejs";

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
    // Shown in the dashboard as the records to create.
    txtName: txtRecordName(d.hostname),
    txtValue: txtRecordValue(d.token),
  };
}

/** GET /api/domains — this tenant's domains, plus the DNS values to publish. */
export const GET = route(async (req: Request) => {
  const session = await requireUser(req);
  const business = await requireBusiness(session);

  const domains = await db.domain.findMany({
    where: { businessId: business.id },
    orderBy: [{ primary: "desc" }, { createdAt: "asc" }],
  });

  const allowance = domainAllowance(business.subscription?.plan, business);
  return ok({
    domains: domains.map(serialize),
    target: dnsTarget(),
    allowance,
    used: domains.length,
    // The dashboard needs to distinguish "you have used them all" from "your
    // plan does not include this" — they are different upgrade conversations.
    canAdd: allowance === -1 || domains.length < allowance,
  });
});

/** POST /api/domains — connect a domain. Created PENDING until DNS checks out. */
export const POST = route(async (req: Request) => {
  const session = await requireUser(req);
  const business = await requireBusiness(session);
  limitSubjectOrThrow(`domain:add:${business.id}`, 10, 60 * 60 * 1000);

  const body = await readJson<{ hostname?: string }>(req);
  const check = checkHostname(str(body.hostname, 253));
  if (!check.ok) throw new HttpError(check.error || "That domain cannot be used");

  const allowance = domainAllowance(business.subscription?.plan, business);
  if (allowance === 0) {
    // A domain is bought as an add-on, not unlocked by moving up a tier, so
    // this must not tell the customer to upgrade — that would sell them the
    // wrong thing.
    throw new HttpError(
      "A custom domain is a paid add-on. Contact us and we will register it and connect it for you.",
      402,
    );
  }
  const used = await db.domain.count({ where: { businessId: business.id } });
  if (allowance !== -1 && used >= allowance) {
    throw new HttpError(
      `You have used all ${allowance} of your custom domain${allowance === 1 ? "" : "s"}. Contact us to add another.`,
      402,
    );
  }

  // A hostname routes to exactly one tenant, so this is a hard conflict — and
  // the message must not reveal which other customer holds it.
  const existing = await db.domain.findUnique({ where: { hostname: check.hostname } });
  if (existing) {
    throw new HttpError(
      existing.businessId === business.id
        ? "You have already added that domain"
        : "That domain is already connected to another WebSetu site",
      409,
    );
  }

  const domain = await db.domain.create({
    data: {
      businessId: business.id,
      hostname: check.hostname,
      token: newDomainToken(),
      // The first domain a business connects becomes the canonical one.
      primary: used === 0,
    },
  });

  await audit({
    actor: session.id,
    action: "DOMAIN_ADDED",
    entity: "domain",
    entityId: domain.id,
    meta: { hostname: domain.hostname },
  });

  // Check immediately: customers who set DNS up first should not have to wait.
  const verified = await verifyDomain(domain.id);

  // Serving the domain still needs a vhost and a certificate on the server,
  // which nobody does unless they know a customer is waiting.
  await notifyAdmins(
    `Domain connected: ${domain.hostname}`,
    `${business.name} connected ${domain.hostname}.
` +
      `DNS: ${verified?.status === "ACTIVE" ? "verified" : verified?.lastError || "not pointing here yet"}.
` +
      `Next: add the vhost for this hostname to the app (port ${process.env.PORT || "4400"}) and issue its HTTPS certificate, ` +
      `then it serves /s/${business.slug}.`,
  );

  return ok({ domain: serialize(verified ?? domain), target: dnsTarget() }, 201);
});

/** DELETE /api/domains?id=… — disconnect a domain. */
export const DELETE = route(async (req: Request) => {
  const session = await requireUser(req);
  const business = await requireBusiness(session);

  const id = str(new URL(req.url).searchParams.get("id"), 40);
  if (!id) throw new HttpError("Which domain?");

  // Scoped to the session's own business: an id from another tenant simply is
  // not found here.
  const domain = await db.domain.findFirst({ where: { id, businessId: business.id } });
  if (!domain) throw new HttpError("Domain not found", 404);

  await db.domain.delete({ where: { id: domain.id } });
  forgetHost(domain.hostname);

  // Removing the canonical domain would leave the rest redirecting to a name
  // that no longer routes, so the oldest survivor takes over.
  if (domain.primary) {
    const next = await db.domain.findFirst({
      where: { businessId: business.id },
      orderBy: { createdAt: "asc" },
    });
    if (next) {
      await db.domain.update({ where: { id: next.id }, data: { primary: true } });
      forgetHost(next.hostname);
    }
  }

  await audit({
    actor: session.id,
    action: "DOMAIN_REMOVED",
    entity: "domain",
    entityId: domain.id,
    meta: { hostname: domain.hostname },
  });

  return ok({ removed: true });
});

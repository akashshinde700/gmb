import { db } from "@/lib/db";
import { HttpError, limitOrThrow, ok, readJson, route } from "@/lib/api";
import { provisionCustomer } from "@/lib/provisioning";
import { randomBytes } from "node:crypto";
import {
  generatedOwnerEmail, readSiteRequest, requireApiKey, siteRequestProblems, siteUrls, type ResellerSite,
} from "@/lib/reseller";

/**
 * The Website Builder API.
 *
 * One call, one website: a caller's product posts a business profile with its
 * key and gets back a live site, the address a customer can edit it at, and the
 * one-time password for the account that owns it. This is the reseller half of
 * the product — the agency's customer never sees the platform, and the agency's
 * own software never sees a wizard.
 *
 * Everything a human would have typed in the wizard is optional except the name
 * and the trade: what the caller does not know is left empty for the owner to
 * fill in later, never invented here. Repeating the call with the same `apiRef`
 * returns the site that already exists rather than building a second one, so a
 * retried request from a payment webhook cannot charge a customer twice.
 */

const SITE_LIST_LIMIT = 200;

function toSite(row: {
  slug: string; name: string; status: string; apiRef: string; createdAt: Date;
}, origin: string, host?: string | null, leads = 0): ResellerSite {
  const { url, editUrl } = siteUrls(row.slug, host, origin);
  return {
    slug: row.slug, name: row.name, status: row.status, url, editUrl,
    apiRef: row.apiRef, createdAt: row.createdAt.toISOString(), leads,
  };
}

/** GET /api/v1/sites — every site this key has created, newest first. */
export const GET = route(async (req: Request) => {
  const key = await requireApiKey(req);
  const url = new URL(req.url);
  const rows = await db.business.findMany({
    where: { resellerId: key.resellerId },
    select: {
      slug: true, name: true, status: true, apiRef: true, createdAt: true, id: true,
      _count: { select: { leads: true } },
    },
    orderBy: { createdAt: "desc" },
    take: SITE_LIST_LIMIT,
  });
  const primaryHosts = await db.domain.findMany({
    where: { businessId: { in: rows.map((r) => r.id) }, primary: true, status: "ACTIVE" },
    select: { businessId: true, hostname: true },
  });
  const hostByBusiness = new Map(primaryHosts.map((d) => [d.businessId, d.hostname]));
  const origin = url.origin;

  return ok({
    sites: rows.map((row) => toSite(row, origin, hostByBusiness.get(row.id) ?? null, row._count.leads)),
    count: rows.length,
  });
});

/** POST /api/v1/sites — build a website for one of the caller's customers. */
export const POST = route(async (req: Request) => {
  const key = await requireApiKey(req);
  limitOrThrow(req, `api:sites:${key.keyId}`, 60, 60 * 60 * 1000);

  const body = await readJson<Record<string, unknown>>(req);
  const input = readSiteRequest(body);
  const problems = siteRequestProblems(input);
  if (problems.length) {
    throw new HttpError(`Missing or invalid: ${problems.join(", ")}`, 422);
  }

  // Idempotency first, so a retry after a timeout cannot build a second site.
  if (input.apiRef) {
    const existing = await db.business.findFirst({
      where: { resellerId: key.resellerId, apiRef: input.apiRef },
      select: {
        slug: true, name: true, status: true, apiRef: true, createdAt: true,
        _count: { select: { leads: true } },
      },
    });
    if (existing) {
      return ok(
        { site: toSite(existing, new URL(req.url).origin, null, existing._count.leads), created: false },
        200,
      );
    }
  }

  const ownerEmail = input.ownerEmail || generatedOwnerEmail(`client-${randomBytes(4).toString("hex")}`, key.hostname);
  const ownerName = input.ownerName || input.name;

  let provisioned: Awaited<ReturnType<typeof provisionCustomer>>;
  try {
    provisioned = await provisionCustomer({
      name: ownerName,
      email: ownerEmail,
      business: {
        name: input.name,
        category: input.category,
        city: input.city,
        phone: input.phone,
        address: input.address,
        description: input.description,
        resellerId: key.resellerId,
        apiRef: input.apiRef,
        publish: input.publish !== false,
      },
    });
  } catch (error) {
    if (error instanceof HttpError && error.status === 409) {
      // The generated owner address already exists (a previous attempt whose
      // response never reached the caller). Hand back that site instead.
      const existing = await db.business.findFirst({
        where: { resellerId: key.resellerId, email: ownerEmail },
        select: { slug: true, name: true, status: true, apiRef: true, createdAt: true },
      });
      if (existing) {
        return ok({ site: toSite(existing, new URL(req.url).origin, null), created: false }, 200);
      }
    }
    throw error;
  }

  if (!provisioned.slug) throw new HttpError("The website could not be generated", 500);

  const site = toSite(
    {
      slug: provisioned.slug,
      name: input.name,
      status: input.publish !== false ? "PUBLISHED" : "DRAFT",
      apiRef: input.apiRef,
      createdAt: new Date(),
    },
    new URL(req.url).origin,
  );

  return ok(
    {
      site,
      created: true,
      // Shown once, like the password an admin hands over: the account belongs
      // to the agency's customer, and this is how they get into it.
      owner: { email: provisioned.email, password: provisioned.password },
      note: "Give the owner these credentials. They can change the password after signing in.",
    },
    201,
  );
});

import { db } from "@/lib/db";
import { HttpError, ok, readJson, requireUser, route } from "@/lib/api";
import { cleanBrandInput, siteUrls, type BrandInput } from "@/lib/reseller";

/**
 * The reseller's own account: their brand, in one place.
 *
 * GET  /api/reseller — brand + everything their account has created
 * PUT  /api/reseller — set the brand (name, logo, support address, colour, host)
 *
 * Only the reseller's own account can read or write this; there is no id in the
 * URL for somebody to guess at.
 */

async function ownReseller(req: Request) {
  const session = await requireUser(req);
  const reseller = await db.reseller.findUnique({ where: { userId: session.id } });
  if (!reseller) throw new HttpError("This account is not set up as a reseller", 403);
  return { session, reseller };
}

export const GET = route(async (req: Request) => {
  const { reseller } = await ownReseller(req);
  const origin = new URL(req.url).origin;

  const [sites, keys] = await Promise.all([
    db.business.findMany({
      where: { resellerId: reseller.id },
      select: {
        slug: true, name: true, status: true, apiRef: true, createdAt: true,
        _count: { select: { leads: true } },
        domains: { where: { primary: true, status: "ACTIVE" }, select: { hostname: true }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.apiKey.findMany({
      where: { resellerId: reseller.id },
      select: { id: true, label: true, prefix: true, lastUsedAt: true, revokedAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return ok({
    brand: {
      brandName: reseller.brandName, logoUrl: reseller.logoUrl, supportEmail: reseller.supportEmail,
      primaryColor: reseller.primaryColor, hostname: reseller.hostname,
    },
    sites: sites.map((s) => ({
      ...siteUrls(s.slug, s.domains[0]?.hostname ?? null, origin),
      slug: s.slug, name: s.name, status: s.status, apiRef: s.apiRef,
      createdAt: s.createdAt.toISOString(), leads: s._count.leads,
    })),
    keys: keys.map((k) => ({
      id: k.id, label: k.label, prefix: k.prefix, createdAt: k.createdAt.toISOString(),
      lastUsedAt: k.lastUsedAt?.toISOString() ?? null, revoked: Boolean(k.revokedAt),
    })),
  });
});

export const PUT = route(async (req: Request) => {
  const { reseller } = await ownReseller(req);
  const body = await readJson<BrandInput>(req);
  const fields = cleanBrandInput(body);

  if (fields.hostname) {
    if (!fields.hostname.includes(".")) throw new HttpError("That does not look like a domain");
    const clash = await db.reseller.findFirst({
      where: { hostname: fields.hostname, NOT: { id: reseller.id } },
      select: { id: true },
    });
    if (clash) throw new HttpError("Another reseller already uses that domain", 409);
  }

  const updated = await db.reseller.update({ where: { id: reseller.id }, data: fields });
  return ok({
    brand: {
      brandName: updated.brandName, logoUrl: updated.logoUrl, supportEmail: updated.supportEmail,
      primaryColor: updated.primaryColor, hostname: updated.hostname,
    },
  });
});

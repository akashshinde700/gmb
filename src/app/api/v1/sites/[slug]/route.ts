import { db } from "@/lib/db";
import { HttpError, ok, route } from "@/lib/api";
import { requireApiKey, siteUrls } from "@/lib/reseller";

/**
 * GET /api/v1/sites/:slug — one site's state, for a caller polling after a
 * create. Scoped to the key's own reseller, so one agency can never read
 * another's — or the platform's own — customers.
 */
export const GET = route(async (req: Request, context: { params: Promise<{ slug: string }> }) => {
  const key = await requireApiKey(req);
  const { slug } = await context.params;

  const business = await db.business.findFirst({
    where: { slug, resellerId: key.resellerId },
    select: {
      slug: true, name: true, status: true, apiRef: true, createdAt: true, phone: true, city: true,
      _count: { select: { leads: true } },
      domains: { where: { primary: true, status: "ACTIVE" }, select: { hostname: true }, take: 1 },
    },
  });
  if (!business) throw new HttpError("No such site", 404);

  const { url, editUrl } = siteUrls(business.slug, business.domains[0]?.hostname ?? null, new URL(req.url).origin);
  return ok({
    site: {
      slug: business.slug, name: business.name, status: business.status, url, editUrl,
      apiRef: business.apiRef, createdAt: business.createdAt.toISOString(),
      leads: business._count.leads, phone: business.phone, city: business.city,
    },
  });
});

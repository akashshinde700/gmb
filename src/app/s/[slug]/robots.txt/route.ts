import { db } from "@/lib/db";
import { subscriptionServesSite } from "@/lib/expiry";
import { tenantBaseUrl } from "@/lib/site-utils";

/**
 * Per-tenant robots.txt, served by `proxy.ts` at the root of a connected domain.
 *
 * A crawler arriving on example.com would otherwise be handed the platform's
 * robots.txt, which points at the platform sitemap and says nothing about this
 * customer's pages.
 *
 * A tenant who is not currently servable is told not to index anything, rather
 * than being handed a 404 that some crawlers read as "no rules, crawl freely".
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

const DISALLOW_ALL = "User-agent: *\nDisallow: /\n";

export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;

  const business = await db.business.findUnique({
    where: { slug: (slug || "").trim().slice(0, 120) },
    select: {
      slug: true,
      status: true,
      website: { select: { publishedAt: true } },
      subscription: { select: { status: true, trialEndsAt: true, renewsAt: true } },
      domains: { where: { status: "ACTIVE", primary: true }, select: { hostname: true }, take: 1 },
    },
  });

  const visible =
    business &&
    business.status === "PUBLISHED" &&
    business.website?.publishedAt &&
    subscriptionServesSite(business.subscription);

  const body = visible
    ? `User-agent: *\nAllow: /\n\nSitemap: ${tenantBaseUrl(business.slug, business.domains[0]?.hostname ?? null)}/sitemap.xml\n`
    : DISALLOW_ALL;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}

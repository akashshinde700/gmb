import { db } from "@/lib/db";
import { subscriptionServesSite } from "@/lib/expiry";
import { tenantBaseUrl } from "@/lib/site-utils";

/**
 * Per-tenant sitemap.
 *
 * `proxy.ts` serves this at the root of a connected domain, so a customer on
 * example.com gets example.com/sitemap.xml listing their own pages and nothing
 * else. Search Console expects a sitemap to live on the domain it describes and
 * to contain only URLs from it — the platform-wide sitemap satisfies neither
 * for a tenant with their own domain.
 *
 * Written by hand rather than through Next's MetadataRoute helper because that
 * helper owns the /sitemap.xml path at the app root, which the platform sitemap
 * already uses.
 */
export const dynamic = "force-dynamic";

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

type Params = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;

  const business = await db.business.findUnique({
    where: { slug: (slug || "").trim().slice(0, 120) },
    select: {
      slug: true,
      status: true,
      updatedAt: true,
      website: { select: { publishedAt: true } },
      subscription: { select: { status: true, trialEndsAt: true, renewsAt: true } },
      domains: { where: { status: "ACTIVE", primary: true }, select: { hostname: true }, take: 1 },
      blogPosts: {
        where: { published: true },
        select: { slug: true, updatedAt: true },
        orderBy: { publishedAt: "desc" },
        take: 5000,
      },
    },
  });

  // Same visibility rules as the site itself: an unpublished or lapsed tenant
  // has no sitemap, rather than one advertising pages that answer 404.
  const visible =
    business &&
    business.status === "PUBLISHED" &&
    business.website?.publishedAt &&
    subscriptionServesSite(business.subscription);

  if (!visible) return new Response("Not found", { status: 404 });

  const base = tenantBaseUrl(business.slug, business.domains[0]?.hostname ?? null);
  const entries = [
    { loc: base, lastmod: business.updatedAt, priority: "1.0" },
    ...(business.blogPosts.length
      ? [{ loc: `${base}/blog`, lastmod: business.updatedAt, priority: "0.6" }]
      : []),
    ...business.blogPosts.map((p) => ({
      loc: `${base}/blog/${p.slug}`,
      lastmod: p.updatedAt,
      priority: "0.7",
    })),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    (e) =>
      `  <url><loc>${xmlEscape(e.loc)}</loc><lastmod>${e.lastmod.toISOString()}</lastmod><priority>${e.priority}</priority></url>`,
  )
  .join("\n")}
</urlset>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}

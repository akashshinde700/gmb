import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { siteOrigin } from "@/lib/site-payload";
import { tenantBaseUrl } from "@/lib/site-utils";

/**
 * Every published tenant site now has a server-rendered URL at /s/[slug], and
 * platform blog posts at /blog/[slug], so the sitemap lists real indexable
 * pages instead of hash fragments no crawler could follow.
 *
 * Generated per request rather than cached: a prerendered sitemap is a snapshot
 * of whatever existed at build time, which for a fresh deployment is nothing —
 * newly published sites would be missing from it until the cache expired.
 * Crawlers fetch this rarely, so the query cost is irrelevant.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteOrigin();
  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/blog`, changeFrequency: "weekly", priority: 0.6 },
  ];

  try {
    const [sites, posts, tenantPosts] = await Promise.all([
      db.business.findMany({
        where: { status: "PUBLISHED", website: { publishedAt: { not: null } } },
        select: {
          slug: true,
          updatedAt: true,
          domains: { where: { status: "ACTIVE", primary: true }, select: { hostname: true }, take: 1 },
        },
        orderBy: { updatedAt: "desc" },
        take: 5000,
      }),
      db.platformPost.findMany({
        where: { published: true },
        select: { slug: true, updatedAt: true },
        orderBy: { publishedAt: "desc" },
        take: 1000,
      }),
      // Tenant articles are the SEO the product is sold on, so they belong in
      // the sitemap alongside the sites themselves. Restricted to businesses
      // that are actually published, or the sitemap would advertise 404s.
      db.blogPost.findMany({
        where: {
          published: true,
          business: { status: "PUBLISHED", website: { publishedAt: { not: null } } },
        },
        select: {
          slug: true,
          updatedAt: true,
          business: {
            select: {
              slug: true,
              domains: { where: { status: "ACTIVE", primary: true }, select: { hostname: true }, take: 1 },
            },
          },
        },
        orderBy: { publishedAt: "desc" },
        take: 20000,
      }),
    ]);

    for (const b of sites) {
      entries.push({
        // A tenant on their own domain is listed at that address: listing the
        // /s/ path as well would advertise the same page twice.
        url: tenantBaseUrl(b.slug, b.domains[0]?.hostname ?? null),
        lastModified: b.updatedAt,
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }
    for (const p of posts) {
      entries.push({
        url: `${base}/blog/${p.slug}`,
        lastModified: p.updatedAt,
        changeFrequency: "monthly",
        priority: 0.5,
      });
    }
    const blogIndexes = new Set<string>();
    for (const p of tenantPosts) {
      const site = p.business.slug;
      const siteBase = tenantBaseUrl(site, p.business.domains[0]?.hostname ?? null);
      if (!blogIndexes.has(site)) {
        blogIndexes.add(site);
        entries.push({
          url: `${siteBase}/blog`,
          changeFrequency: "weekly",
          priority: 0.5,
        });
      }
      entries.push({
        url: `${siteBase}/blog/${p.slug}`,
        lastModified: p.updatedAt,
        changeFrequency: "monthly",
        priority: 0.6,
      });
    }
  } catch (e) {
    // A sitemap must never take the site down with it.
    console.error("[sitemap] could not list published pages:", e);
  }

  return entries;
}

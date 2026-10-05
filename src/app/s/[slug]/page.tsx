import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SiteRenderer from "@/components/site/site-renderer";
import { loadPublishedSite } from "@/lib/site-payload";
import { siteOrigin, tenantBaseUrl, usableTagline } from "@/lib/site-utils";

/**
 * Server-rendered tenant website at /s/[slug].
 *
 * The dashboard renders the same site client-side behind a hash route, which no
 * crawler can index — the whole SEO promise of the product depended on a URL
 * that does not exist to search engines. This route serves the same markup with
 * real per-business metadata, a canonical URL and Open Graph tags.
 */

export const revalidate = 300;

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const payload = await loadPublishedSite(slug);
  if (!payload) return { title: "Website not found", robots: { index: false, follow: false } };

  const { business, website } = payload;
  const title = website.seoTitle || `${business.name}${business.city ? ` — ${business.category} in ${business.city}` : ""}`;
  const description =
    website.seoDescription ||
    business.description ||
    usableTagline(business.tagline) ||
    `${business.name} in ${business.city || "India"}. Call ${business.phone} for enquiries.`;
  // A connected domain is the canonical address; without one the site stays
  // canonical at its /s/<slug> path.
  const url = tenantBaseUrl(business.slug, payload.primaryDomain);
  // Their own picture when they have one; otherwise a card generated from the
  // name, tagline and palette they already chose. Never nothing: a site shared
  // on WhatsApp with no preview looks abandoned, which is the opposite of what
  // the owner is paying for.
  const uploaded = website.ogImage || business.coverUrl || business.logoUrl || "";
  const image = uploaded || `${siteOrigin()}/s/${business.slug}/og`;

  return {
    title,
    description: description.slice(0, 300),
    keywords: website.keywords || undefined,
    alternates: { canonical: url },
    // Lets a regular customer of the shop add it to their phone's home screen
    // with the shop's own name, icon and colours.
    manifest: `${url}/manifest.webmanifest`,
    openGraph: {
      title,
      description: description.slice(0, 300),
      url,
      siteName: business.name,
      type: "website",
      locale: "en_IN",
      images: [{ url: image, width: 1200, height: 630, alt: business.name }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: description.slice(0, 200),
      images: [image],
    },
  };
}

export default async function TenantSitePage({ params }: Params) {
  const { slug } = await params;
  const payload = await loadPublishedSite(slug);
  // Unpublished, suspended and expired all read as "not found" here so the URL
  // cannot be used to probe a tenant's account status.
  if (!payload) notFound();

  return <SiteRenderer payload={payload} mode="live" />;
}

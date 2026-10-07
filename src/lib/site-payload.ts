// WebSetu — server-side loader for a published tenant website.
//
// The dashboard preview fetches /api/site/[slug] from the browser. Server
// components need the same payload without an HTTP hop, so the query lives here
// and both paths stay in step.

import { db } from "@/lib/db";
import { serializeBusiness, serializeWebsite } from "@/lib/serialize";
import type { SitePayload } from "@/lib/types";
import { subscriptionServesSite } from "@/lib/expiry";
import { brandForBusiness } from "@/lib/reseller";
import { readCommerce } from "@/lib/commerce";

// Re-exported so the existing server-side callers keep their import path; the
// definition moved to site-utils, which client components can also import.
export { siteOrigin } from "@/lib/site-utils";

/**
 * Load a PUBLISHED site for server rendering. Returns null for anything a
 * public visitor may not see — unpublished, suspended or expired — so the route
 * can answer 404 without leaking which of those it was.
 */
export async function loadPublishedSite(slug: string): Promise<SitePayload | null> {
  const clean = (slug || "").trim().slice(0, 120);
  if (!clean) return null;

  const business = await db.business.findUnique({
    where: { slug: clean },
    include: {
      website: true,
      subscription: true,
      services: { orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] },
      products: { orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] },
      gallery: { orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] },
      testimonials: { orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] },
      faqs: { orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] },
      blogPosts: { where: { published: true }, orderBy: { publishedAt: "desc" }, take: 6 },
      // The canonical hostname, when this business has connected one. Fetched
      // here so every page built from the payload agrees on one address.
      domains: {
        where: { status: "ACTIVE", primary: true },
        select: { hostname: true },
        take: 1,
      },
    },
  });

  if (!business || !business.website) return null;
  if (business.status !== "PUBLISHED" || !business.website.publishedAt) return null;
  // Checks the trial/renewal dates, not just the stored status, so a site goes
  // dark on the date it was sold as going dark rather than on the next sweep.
  if (!subscriptionServesSite(business.subscription)) return null;

  return {
    // GSTIN is a compliance identifier, not site content.
    business: { ...serializeBusiness(business), gstin: "" },
    website: serializeWebsite(business.website),
    services: business.services,
    products: business.products,
    gallery: business.gallery,
    testimonials: business.testimonials,
    faqs: business.faqs,
    blogPosts: business.blogPosts.map((p) => ({
      id: p.id, title: p.title, slug: p.slug, excerpt: p.excerpt,
      cover: p.cover, publishedAt: p.publishedAt?.toISOString() ?? null,
    })),
    primaryDomain: business.domains[0]?.hostname ?? null,
    // The storefront needs the shop's rules before checkout: the delivery charge
    // has to be visible on the cart bar, not discovered at the last step.
    commerce: readCommerce(business.commerceJson),
    credit: (await brandForBusiness(business.resellerId)).name,
    subscriptionStatus: business.subscription?.status ?? "NONE",
    trialMode: business.subscription?.status === "TRIALING",
    published: true,
  } as SitePayload;
}

/** A tenant's post as its public page needs it, plus the business it belongs to. */
export interface TenantPostPayload {
  business: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string;
    phone: string;
    whatsapp: string;
    brandPrimary: string;
    brandSecondary: string;
    /** Canonical custom hostname, or null when the site lives under /s/<slug>. */
    primaryDomain: string | null;
  };
  post: {
    id: string;
    title: string;
    slug: string;
    excerpt: string;
    content: string;
    cover: string;
    author: string;
    category: string;
    tags: string[];
    publishedAt: Date | null;
    updatedAt: Date;
  };
}

/**
 * Business summary shared by the tenant blog pages. Only what the header and
 * footer of those pages render — a post page has no business showing an address
 * or a GSTIN.
 */
const BLOG_BUSINESS_SELECT = {
  id: true,
  name: true,
  slug: true,
  domains: {
    where: { status: "ACTIVE", primary: true },
    select: { hostname: true },
    take: 1,
  },
  logoUrl: true,
  phone: true,
  whatsapp: true,
  brandPrimary: true,
  brandSecondary: true,
  status: true,
  subscription: { select: { status: true, trialEndsAt: true, renewsAt: true } },
} as const;

/** Serve blog pages under exactly the conditions that serve the site itself. */
function blogVisible(business: {
  status: string;
  subscription: { status: string; trialEndsAt: Date | null; renewsAt: Date | null } | null;
}): boolean {
  if (business.status !== "PUBLISHED") return false;
  return subscriptionServesSite(business.subscription);
}

/** Load one published post of a published tenant. Null means 404. */
export async function loadTenantPost(
  slug: string,
  postSlug: string,
): Promise<TenantPostPayload | null> {
  const cleanSlug = (slug || "").trim().slice(0, 120);
  const cleanPost = (postSlug || "").trim().slice(0, 200);
  if (!cleanSlug || !cleanPost) return null;

  const business = await db.business.findUnique({
    where: { slug: cleanSlug },
    select: BLOG_BUSINESS_SELECT,
  });
  if (!business || !blogVisible(business)) return null;

  const post = await db.blogPost.findUnique({
    where: { businessId_slug: { businessId: business.id, slug: cleanPost } },
  });
  if (!post || !post.published) return null;

  // `domains` is the raw relation; the pages only ever want the one canonical
  // hostname, so it is flattened here rather than in every caller.
  const { status: _status, subscription: _subscription, domains, ...rest } = business;
  const publicBusiness = { ...rest, primaryDomain: domains[0]?.hostname ?? null };
  return {
    business: publicBusiness,
    post: {
      id: post.id,
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      content: post.content,
      cover: post.cover,
      author: post.author,
      category: post.category,
      tags: post.tags.split(",").map((t) => t.trim()).filter(Boolean),
      publishedAt: post.publishedAt,
      updatedAt: post.updatedAt,
    },
  };
}

/** Load the published post list for a tenant's blog index. Null means 404. */
export async function loadTenantPosts(slug: string, take = 50) {
  const clean = (slug || "").trim().slice(0, 120);
  if (!clean) return null;

  const business = await db.business.findUnique({
    where: { slug: clean },
    select: BLOG_BUSINESS_SELECT,
  });
  if (!business || !blogVisible(business)) return null;

  const posts = await db.blogPost.findMany({
    where: { businessId: business.id, published: true },
    orderBy: { publishedAt: "desc" },
    take,
    select: {
      id: true, title: true, slug: true, excerpt: true, cover: true,
      author: true, publishedAt: true,
    },
  });

  // `domains` is the raw relation; the pages only ever want the one canonical
  // hostname, so it is flattened here rather than in every caller.
  const { status: _status, subscription: _subscription, domains, ...rest } = business;
  const publicBusiness = { ...rest, primaryDomain: domains[0]?.hostname ?? null };
  return { business: publicBusiness, posts };
}

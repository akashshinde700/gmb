import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { serializeBusiness, serializeWebsite } from "@/lib/serialize";
import { HttpError, ok, route, str } from "@/lib/api";
import { subscriptionServesSite } from "@/lib/expiry";
import { brandForBusiness } from "@/lib/reseller";
import { readCommerce } from "@/lib/commerce";

/**
 * GET /api/site/[slug] — PUBLIC endpoint that renders a tenant website.
 * If the requester holds a valid session token of the owning user, unpublished
 * (DRAFT) sites are also returned so the dashboard can preview before publish.
 */
export const GET = route(async (req: Request, { params }: { params: Promise<{ slug: string }> }) => {
  const slug = str((await params).slug, 120);
  if (!slug) throw new HttpError("Website not found", 404);

  const business = await db.business.findUnique({
    where: { slug },
    include: {
      website: true,
      subscription: true,
      services: { orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] },
      products: { orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] },
      gallery: { orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] },
      testimonials: { orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] },
      faqs: { orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] },
      blogPosts: { where: { published: true }, orderBy: { publishedAt: "desc" }, take: 6 },
    },
  });

  if (!business) throw new HttpError("Website not found", 404);

  if (business.status === "SUSPENDED") {
    throw new HttpError("This website has been suspended by the platform administrator.", 403);
  }
  if (business.status === "EXPIRED" || !subscriptionServesSite(business.subscription)) {
    throw new HttpError("This website has expired. The owner needs to renew their subscription.", 402);
  }
  if (business.status !== "PUBLISHED" || !business.website) {
    // Owner preview: session user must own this business. Platform admins can
    // also open it, which is what the admin console's "view site" action needs.
    const session = await getSessionUser(req);
    const allowed = session && (session.id === business.userId || session.role === "ADMIN");
    if (!allowed) throw new HttpError("This website is not published yet. Please check back soon!", 404);
  }

  const published = business.status === "PUBLISHED" && !!business.website?.publishedAt;
  const serialized = serializeBusiness(business);

  // GSTIN is a compliance identifier, not site content: it is dropped from the
  // public payload and only returned to the owner/admin preview.
  const publicBusiness = published ? { ...serialized, gstin: "" } : serialized;

  return ok({
    business: publicBusiness,
    website: business.website
      ? serializeWebsite(business.website)
      : {
          seoTitle: "", seoDescription: "", keywords: "", ogImage: "",
          theme: {}, sections: [], version: 0, publishedAt: null,
        },
    services: business.services,
    products: business.products,
    gallery: business.gallery,
    testimonials: business.testimonials,
    faqs: business.faqs,
    blogPosts: business.blogPosts.map((p) => ({
      id: p.id, title: p.title, slug: p.slug, excerpt: p.excerpt,
      cover: p.cover, publishedAt: p.publishedAt?.toISOString() ?? null,
    })),
    // The footer credit: the platform's name, or the agency's when this site
    // was built through one.
    credit: (await brandForBusiness(business.resellerId)).name,
    commerce: readCommerce(business.commerceJson),
    subscriptionStatus: business.subscription?.status ?? "NONE",
    trialMode: business.subscription?.status === "TRIALING",
    published,
  });
});

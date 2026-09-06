import { db } from "@/lib/db";
import { fail, getSessionUser, ok } from "@/lib/auth";
import { serializeBusiness, serializeWebsite } from "@/lib/serialize";

/**
 * GET /api/site/[slug] — PUBLIC endpoint that renders a tenant website.
 * If the requester holds a valid session token of the owning user, unpublished
 * (DRAFT) sites are also returned so the dashboard can preview before publish.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

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

  if (!business) return fail("Website not found", 404);

  if (business.status === "SUSPENDED") {
    return fail("This website has been suspended by the platform administrator.", 403);
  }
  if (business.status === "EXPIRED" || business.subscription?.status === "EXPIRED") {
    return fail("This website has expired. The owner needs to renew their subscription.", 402);
  }
  if (business.status !== "PUBLISHED" || !business.website) {
    // Owner preview: session user must own this business
    const session = await getSessionUser(req);
    if (!session || session.id !== business.userId) {
      return fail("This website is not published yet. Please check back soon!", 404);
    }
  }

  const published = business.status === "PUBLISHED" && !!business.website?.publishedAt;

  return ok({
    business: serializeBusiness(business),
    website: business.website
      ? serializeWebsite(business.website)
      : { seoTitle: "", seoDescription: "", keywords: "", ogImage: "", theme: {}, sections: [], version: 0, publishedAt: null },
    services: business.services,
    products: business.products,
    gallery: business.gallery,
    testimonials: business.testimonials,
    faqs: business.faqs,
    blogPosts: business.blogPosts.map((p) => ({
      id: p.id, title: p.title, slug: p.slug, excerpt: p.excerpt,
      cover: p.cover, publishedAt: p.publishedAt?.toISOString() ?? null,
    })),
    subscriptionStatus: business.subscription?.status ?? "NONE",
    trialMode: business.subscription?.status === "TRIALING",
    published,
  });
}

import { db } from "@/lib/db";
import { computeHealth } from "@/lib/health";
import { serializeBusiness, serializeWebsite } from "@/lib/serialize";
import { parseJson } from "@/lib/sections";
import type { Business, SiteSection } from "@/lib/types";
import { audit, HttpError, ok, readJson, requireBusiness, requireUser, route } from "@/lib/api";
import { publishBlockers } from "@/lib/publish-rules";
import { tenantBaseUrl } from "@/lib/site-utils";

/** POST /api/website/publish — validate & publish the tenant website */
export const POST = route(async (req: Request) => {
  const session = await requireUser(req);
  const business = await requireBusiness(session);
  if (!business.website) throw new HttpError("Website not found", 404);

  const body = await readJson<{ unpublish?: boolean }>(req);

  if (body.unpublish) {
    // Both rows move together: a half-applied unpublish leaves a site marked
    // DRAFT but still advertising a publishedAt date (or the reverse).
    const [b, w] = await db.$transaction([
      db.business.update({ where: { id: business.id }, data: { status: "DRAFT" } }),
      db.website.update({ where: { businessId: business.id }, data: { publishedAt: null } }),
    ]);
    await audit({ actor: session.id, action: "WEBSITE_UNPUBLISHED", entity: "business", entityId: business.id });
    return ok({ ...serializeWebsite(w), businessStatus: b.status });
  }

  if (business.status === "SUSPENDED") {
    throw new HttpError("This website is suspended. Contact support to restore it.", 403);
  }

  // The same rules the onboarding wizard uses, so a site that the wizard says
  // is live really is, and one it cannot publish reports the same reasons here.
  const sections = parseJson<SiteSection[]>(business.website.sectionsJson, []);
  const errors = publishBlockers(business, {
    seoTitle: business.website.seoTitle,
    visibleSections: sections.filter((s) => s.visible).length,
  });

  if (errors.length) throw new HttpError(`Cannot publish: ${errors.join("; ")}`, 422);

  const [services, products, gallery, testimonials, faqs, blogPosts] = await Promise.all([
    db.service.count({ where: { businessId: business.id } }),
    db.product.count({ where: { businessId: business.id } }),
    db.galleryItem.count({ where: { businessId: business.id } }),
    db.testimonial.count({ where: { businessId: business.id } }),
    db.faq.count({ where: { businessId: business.id } }),
    db.blogPost.count({ where: { businessId: business.id } }),
  ]);

  const [b, w] = await db.$transaction([
    db.business.update({ where: { id: business.id }, data: { status: "PUBLISHED" } }),
    db.website.update({ where: { businessId: business.id }, data: { publishedAt: new Date() } }),
  ]);

  await db.notification.create({
    data: {
      userId: session.id,
      title: "Website published 🎉",
      // The real address, not `<slug>.websetu.in` — a domain this platform does
      // not serve and never has. A customer who copied that out of their own
      // notification had nowhere to send it.
      body: `${business.name} is now LIVE at ${tenantBaseUrl(business.slug, null)}. Share it with your customers!`,
    },
  });
  await audit({
    actor: session.id, action: "WEBSITE_PUBLISHED", entity: "business", entityId: business.id,
    meta: { slug: business.slug, version: w.version },
  });

  const health = computeHealth(
    serializeBusiness(b) as Business,
    serializeWebsite(w),
    { services, products, gallery, testimonials, faqs, blogPosts },
  );

  return ok({ ...serializeWebsite(w), businessStatus: b.status, health });
});

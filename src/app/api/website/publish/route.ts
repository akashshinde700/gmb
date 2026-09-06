import { db } from "@/lib/db";
import { fail, getSessionBusiness, getSessionUser, ok } from "@/lib/auth";
import { computeHealth } from "@/lib/health";
import { serializeWebsite } from "@/lib/serialize";
import { parseJson } from "@/lib/sections";
import type { SiteSection } from "@/lib/types";

/** POST /api/website/publish — validate & publish the tenant website */
export async function POST(req: Request) {
  const session = await getSessionUser(req);
  if (!session) return fail("Unauthorized", 401);
  const business = await getSessionBusiness(session.id);
  if (!business?.website) return fail("Website not found", 404);

  const body = (await req.json().catch(() => ({}))) as { unpublish?: boolean };

  if (body.unpublish) {
    const [b, w] = await Promise.all([
      db.business.update({ where: { id: business.id }, data: { status: "DRAFT" } }),
      db.website.update({ where: { businessId: business.id }, data: { publishedAt: null } }),
    ]);
    return ok({ ...serializeWebsite(w), businessStatus: b.status });
  }

  // Publish validations
  const errors: string[] = [];
  if (!business.name) errors.push("Business name is required");
  if (!business.phone) errors.push("Phone number is required for customers to contact you");
  if (!business.address || !business.city) errors.push("Business address & city are required");
  const sections = parseJson<SiteSection[]>(business.website.sectionsJson, []);
  const visible = sections.filter((s) => s.visible);
  if (visible.length < 3) errors.push("At least 3 visible sections are required");
  if (!business.website.seoTitle) errors.push("SEO title is required");

  const counts = {
    services: await db.service.count({ where: { businessId: business.id } }),
    products: await db.product.count({ where: { businessId: business.id } }),
    gallery: await db.galleryItem.count({ where: { businessId: business.id } }),
    testimonials: await db.testimonial.count({ where: { businessId: business.id } }),
    faqs: await db.faq.count({ where: { businessId: business.id } }),
    blogPosts: await db.blogPost.count({ where: { businessId: business.id } }),
  };

  if (errors.length) {
    return fail(`Cannot publish: ${errors.join("; ")}`, 422);
  }

  const [b, w] = await Promise.all([
    db.business.update({ where: { id: business.id }, data: { status: "PUBLISHED" } }),
    db.website.update({ where: { businessId: business.id }, data: { publishedAt: new Date() } }),
  ]);

  await db.notification.create({
    data: {
      userId: session.id,
      title: "Website published 🎉",
      body: `${business.name} is now LIVE at ${business.slug}.websetu.in. Share it with your customers!`,
    },
  });

  const health = computeHealth(serializeBusinessLite(b), serializeWebsite(w), counts);

  return ok({ ...serializeWebsite(w), businessStatus: b.status, health });
}

function serializeBusinessLite(b: typeof business) {
  return {
    ...b,
    hours: parseJson(b.hoursJson, {}), socials: parseJson(b.socialsJson, {}),
    createdAt: b.createdAt,
  };
}

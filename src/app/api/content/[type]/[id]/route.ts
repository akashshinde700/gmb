import { db } from "@/lib/db";
import { fail, getSessionBusiness, getSessionUser, ok } from "@/lib/auth";

const TYPES = ["services", "products", "gallery", "testimonials", "faqs", "blog"] as const;
type ContentType = (typeof TYPES)[number];

function delegate(type: ContentType) {
  const map = {
    services: db.service, products: db.product, gallery: db.galleryItem,
    testimonials: db.testimonial, faqs: db.faq, blog: db.blogPost,
  } as const;
  return map[type];
}

export async function PUT(req: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  if (!TYPES.includes(type as ContentType)) return fail("Invalid content type", 404);
  const session = await getSessionUser(req);
  if (!session) return fail("Unauthorized", 401);
  const business = await getSessionBusiness(session.id);
  if (!business) return fail("No business found", 404);

  // Tenant isolation: ensure the row belongs to the session's business
  const existing = await delegate(type as ContentType).findFirst({ where: { id, businessId: business.id } });
  if (!existing) return fail("Item not found", 404);

  const body = (await req.json()) as Record<string, unknown>;
  const { sanitize } = await import("../route");
  const data = sanitize(type as ContentType, body);

  if (type === "blog" && data.published) {
    (data as Record<string, unknown>).publishedAt = existing.publishedAt ?? new Date();
  }

  const row = await delegate(type as ContentType).update({ where: { id }, data: data as never });
  return ok(row);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  if (!TYPES.includes(type as ContentType)) return fail("Invalid content type", 404);
  const session = await getSessionUser(req);
  if (!session) return fail("Unauthorized", 401);
  const business = await getSessionBusiness(session.id);
  if (!business) return fail("No business found", 404);

  const existing = await delegate(type as ContentType).findFirst({ where: { id, businessId: business.id } });
  if (!existing) return fail("Item not found", 404);

  await delegate(type as ContentType).delete({ where: { id } });
  return ok({ deleted: id });
}

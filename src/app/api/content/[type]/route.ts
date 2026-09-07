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

export function sanitize(type: ContentType, body: Record<string, unknown>) {
  // image/url fields may hold canvas-downscaled dataURLs (~2.5MB encoded)
  const s = (k: string, max = 4000) => (body[k] === undefined ? undefined : String(body[k]).slice(0, max));
  const img = (k: string) => (body[k] === undefined ? undefined : String(body[k]).slice(0, 2_600_000));
  const n = (k: string) => (body[k] === undefined || body[k] === null || body[k] === "" ? null : Number(body[k]));
  const b = (k: string) => (body[k] === undefined ? undefined : Boolean(body[k]));

  switch (type) {
    case "services": return {
      name: s("name", 150), description: s("description", 3000), image: img("image"),
      icon: s("icon", 50), price: s("price", 60), featured: b("featured"),
      sortOrder: body.sortOrder === undefined ? undefined : Number(body.sortOrder),
    };
    case "products": return {
      name: s("name", 150), sku: s("sku", 60), category: s("category", 100),
      shortDesc: s("shortDesc", 300), description: s("description", 4000),
      price: n("price"), salePrice: n("salePrice"), image: img("image"),
      videoUrl: s("videoUrl", 1000),
      hidePrice: b("hidePrice"), featured: b("featured"),
      sortOrder: body.sortOrder === undefined ? undefined : Number(body.sortOrder),
    };
    case "gallery": return {
      url: img("url"), caption: s("caption", 200), alt: s("alt", 200),
      sortOrder: body.sortOrder === undefined ? undefined : Number(body.sortOrder),
    };
    case "testimonials": return {
      name: s("name", 100), role: s("role", 100), content: s("content", 1500),
      rating: body.rating === undefined ? undefined : Math.min(5, Math.max(1, Number(body.rating))),
      avatar: img("avatar"),
      sortOrder: body.sortOrder === undefined ? undefined : Number(body.sortOrder),
    };
    case "faqs": return {
      question: s("question", 300), answer: s("answer", 2000),
      sortOrder: body.sortOrder === undefined ? undefined : Number(body.sortOrder),
    };
    case "blog": return {
      title: s("title", 200), excerpt: s("excerpt", 400), content: s("content", 50000),
      cover: img("cover"), author: s("author", 100), category: s("category", 100),
      tags: s("tags", 300),
      published: b("published"),
      slug: body.slug === undefined ? undefined : String(body.slug).toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").slice(0, 150),
    };
  }
}

function orderFor(type: ContentType): Record<string, string>[] {
  // BlogPost has no sortOrder column
  return type === "blog"
    ? [{ publishedAt: "desc" }, { createdAt: "desc" }]
    : [{ sortOrder: "asc" }, { createdAt: "desc" }];
}

export async function GET(req: Request, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  if (!TYPES.includes(type as ContentType)) return fail("Invalid content type", 404);
  const session = await getSessionUser(req);
  if (!session) return fail("Unauthorized", 401);
  const business = await getSessionBusiness(session.id);
  if (!business) return fail("No business found", 404);

  const rows = await delegate(type as ContentType).findMany({
    where: { businessId: business.id },
    orderBy: orderFor(type as ContentType),
  });
  return ok(rows);
}

export async function POST(req: Request, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  if (!TYPES.includes(type as ContentType)) return fail("Invalid content type", 404);
  const session = await getSessionUser(req);
  if (!session) return fail("Unauthorized", 401);
  const business = await getSessionBusiness(session.id);
  if (!business) return fail("No business found", 404);

  const body = (await req.json()) as Record<string, unknown>;
  const data = sanitize(type as ContentType, body);

  if (type === "services" && !data.name) return fail("Service name is required");
  if (type === "products" && !data.name) return fail("Product name is required");
  if (type === "gallery" && !data.url) return fail("Image URL is required");
  if (type === "testimonials" && (!data.name || !data.content)) return fail("Name and review content are required");
  if (type === "faqs" && (!data.question || !data.answer)) return fail("Question and answer are required");
  if (type === "blog" && !data.title) return fail("Blog title is required");

  const createData = { ...data, businessId: business.id } as Record<string, unknown>;
  if (type === "blog") {
    createData.publishedAt = data.published ? new Date() : null;
    // unique slug per business
    let slug = (data.slug as string) || "post";
    const exists = async (s: string) => await db.blogPost.findFirst({ where: { businessId: business.id, slug: s } });
    let i = 1;
    while (await exists(slug)) { i += 1; slug = `${data.slug || "post"}-${i}`; }
    createData.slug = slug;
  }

  const row = await delegate(type as ContentType).create({ data: createData as never });
  return ok(row, 201);
}

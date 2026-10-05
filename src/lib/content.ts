// WebSetu — shared definitions for the six tenant content types.
//
// The sanitizer used to live inside the collection route and was imported by
// the item route (`import("../route")`), which pulled a whole route module —
// and its exported handlers — into another request path.

import { db } from "@/lib/db";
import { HttpError, safeUrl, str } from "@/lib/api";

export const CONTENT_TYPES = ["services", "products", "gallery", "testimonials", "faqs", "blog"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export function isContentType(value: string): value is ContentType {
  return (CONTENT_TYPES as readonly string[]).includes(value);
}

/**
 * Minimal shape shared by the six Prisma model delegates. Prisma's own types are
 * a union of six incompatible generic signatures, which TypeScript refuses to
 * call; the routes only ever use these six methods.
 */
export interface ContentDelegate {
  findMany(args: unknown): Promise<Record<string, unknown>[]>;
  findFirst(args: unknown): Promise<Record<string, unknown> | null>;
  count(args: unknown): Promise<number>;
  create(args: unknown): Promise<Record<string, unknown>>;
  update(args: unknown): Promise<Record<string, unknown>>;
  delete(args: unknown): Promise<Record<string, unknown>>;
}

export function delegate(type: ContentType): ContentDelegate {
  const map = {
    services: db.service,
    products: db.product,
    gallery: db.galleryItem,
    testimonials: db.testimonial,
    faqs: db.faq,
    blog: db.blogPost,
  } as const;
  return map[type] as unknown as ContentDelegate;
}

export function orderFor(type: ContentType): Record<string, string>[] {
  // BlogPost has no sortOrder column
  return type === "blog"
    ? [{ publishedAt: "desc" }, { createdAt: "desc" }]
    : [{ sortOrder: "asc" }, { createdAt: "desc" }];
}

/** Cap on how many rows one tenant may hold per content type. */
export const MAX_ROWS_PER_TYPE = 500;

function num(body: Record<string, unknown>, key: string): number | null | undefined {
  const raw = body[key];
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new HttpError(`${key} must be a number`);
  return value;
}

function sortOrder(body: Record<string, unknown>): number | undefined {
  if (body.sortOrder === undefined) return undefined;
  const value = Number(body.sortOrder);
  if (!Number.isFinite(value)) throw new HttpError("sortOrder must be a number");
  return Math.max(0, Math.min(9999, Math.trunc(value)));
}

/** Whitelist + clamp the fields a tenant may write for a content type. */
export function sanitize(type: ContentType, body: Record<string, unknown>) {
  const s = (k: string, max = 4000) => (body[k] === undefined ? undefined : str(body[k], max));
  // Image fields may still carry legacy data: URLs (~2.5MB encoded).
  const img = (k: string) => (body[k] === undefined ? undefined : safeUrl(body[k], 2_600_000));
  const bool = (k: string) => (body[k] === undefined ? undefined : Boolean(body[k]));

  switch (type) {
    case "services":
      return {
        name: s("name", 150), description: s("description", 3000), image: img("image"),
        icon: s("icon", 50), price: s("price", 60), featured: bool("featured"),
        sortOrder: sortOrder(body),
      };
    case "products": {
      const price = num(body, "price");
      const salePrice = num(body, "salePrice");
      if (typeof price === "number" && price < 0) throw new HttpError("Price cannot be negative");
      if (typeof salePrice === "number" && salePrice < 0) throw new HttpError("Sale price cannot be negative");
      if (typeof price === "number" && typeof salePrice === "number" && salePrice > price) {
        throw new HttpError("Sale price cannot be higher than the regular price");
      }
      return {
        name: s("name", 150), sku: s("sku", 60), category: s("category", 100),
        shortDesc: s("shortDesc", 300), description: s("description", 4000),
        price, salePrice, image: img("image"),
        videoUrl: body.videoUrl === undefined ? undefined : safeUrl(body.videoUrl, 1000),
        hidePrice: bool("hidePrice"), featured: bool("featured"),
        sortOrder: sortOrder(body),
      };
    }
    case "gallery":
      return {
        url: img("url"), caption: s("caption", 200), alt: s("alt", 200),
        sortOrder: sortOrder(body),
      };
    case "testimonials": {
      let rating: number | undefined;
      if (body.rating !== undefined) {
        const value = Number(body.rating);
        if (!Number.isFinite(value)) throw new HttpError("Rating must be a number");
        rating = Math.min(5, Math.max(1, Math.round(value)));
      }
      return {
        name: s("name", 100), role: s("role", 100), content: s("content", 1500),
        rating, avatar: img("avatar"), sortOrder: sortOrder(body),
      };
    }
    case "faqs":
      return {
        question: s("question", 300), answer: s("answer", 2000),
        sortOrder: sortOrder(body),
      };
    case "blog":
      return {
        title: s("title", 200), excerpt: s("excerpt", 400), content: s("content", 50000),
        cover: img("cover"), author: s("author", 100), category: s("category", 100),
        tags: s("tags", 300), published: bool("published"),
        slug: body.slug === undefined
          ? undefined
          : String(body.slug).toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").slice(0, 150),
      };
  }
}

/** Required-field rules applied on create. */
export function assertCreatable(type: ContentType, data: Record<string, unknown>) {
  const missing: Record<ContentType, [boolean, string]> = {
    services: [!data.name, "Service name is required"],
    products: [!data.name, "Product name is required"],
    gallery: [!data.url, "Image URL is required"],
    testimonials: [!data.name || !data.content, "Name and review content are required"],
    faqs: [!data.question || !data.answer, "Question and answer are required"],
    blog: [!data.title, "Blog title is required"],
  };
  const [failed, message] = missing[type];
  if (failed) throw new HttpError(message);
}

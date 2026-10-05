import { db } from "@/lib/db";
import { audit, HttpError, ok, pageParams, readJson, requireAdmin, route, safeUrl, str } from "@/lib/api";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 120);
}

/** GET /api/admin/posts — every post, drafts included. */
export const GET = route(async (req: Request) => {
  await requireAdmin(req);
  const { take, skip } = pageParams(req, 50, 100);
  const [posts, total] = await Promise.all([
    db.platformPost.findMany({ orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }], take, skip }),
    db.platformPost.count(),
  ]);
  return ok(
    posts.map((p) => ({
      ...p,
      publishedAt: p.publishedAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })),
    200,
    { total, take, skip },
  );
});

/** POST /api/admin/posts — write a new post. */
export const POST = route(async (req: Request) => {
  const admin = await requireAdmin(req);
  const body = await readJson<Record<string, unknown>>(req);

  const title = str(body.title, 200);
  if (title.length < 3) throw new HttpError("Give the post a title of at least 3 characters");

  const base = slugify(str(body.slug, 120) || title) || "post";
  let slug = base;
  let i = 1;
  while (await db.platformPost.findUnique({ where: { slug } })) {
    i += 1;
    slug = `${base}-${i}`;
    if (i > 50) throw new HttpError("Could not generate a unique URL — change the title");
  }

  const published = Boolean(body.published);
  const post = await db.platformPost.create({
    data: {
      title,
      slug,
      excerpt: str(body.excerpt, 400),
      content: str(body.content, 60000),
      cover: safeUrl(body.cover, 2000),
      author: str(body.author, 100) || admin.name,
      tags: str(body.tags, 300),
      published,
      publishedAt: published ? new Date() : null,
    },
  });

  await audit({ actor: admin.id, action: "POST_CREATE", entity: "post", entityId: post.id, meta: { slug } });
  return ok({ post: { ...post, publishedAt: post.publishedAt?.toISOString() ?? null } }, 201);
});

import { db } from "@/lib/db";
import { ok, pageParams, route } from "@/lib/api";

/** GET /api/posts — published platform blog posts (public). */
export const GET = route(async (req: Request) => {
  const { take, skip } = pageParams(req, 20, 50);
  const [posts, total] = await Promise.all([
    db.platformPost.findMany({
      where: { published: true },
      orderBy: { publishedAt: "desc" },
      // Post bodies are large; the list only needs the card fields.
      select: { id: true, title: true, slug: true, excerpt: true, cover: true, author: true, tags: true, publishedAt: true },
      take,
      skip,
    }),
    db.platformPost.count({ where: { published: true } }),
  ]);
  return ok(
    posts.map((p) => ({ ...p, publishedAt: p.publishedAt?.toISOString() ?? null })),
    200,
    { total, take, skip },
  );
});

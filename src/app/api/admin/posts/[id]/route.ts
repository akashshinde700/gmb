import { db } from "@/lib/db";
import { audit, HttpError, ok, readJson, requireAdmin, route, safeUrl, str } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

export const PUT = route(async (req: Request, { params }: Params) => {
  const admin = await requireAdmin(req);
  const { id } = await params;

  const existing = await db.platformPost.findUnique({ where: { id } });
  if (!existing) throw new HttpError("Post not found", 404);

  const body = await readJson<Record<string, unknown>>(req);
  const data: Record<string, unknown> = {};

  if (body.title !== undefined) {
    const title = str(body.title, 200);
    if (title.length < 3) throw new HttpError("Give the post a title of at least 3 characters");
    data.title = title;
  }
  if (body.excerpt !== undefined) data.excerpt = str(body.excerpt, 400);
  if (body.content !== undefined) data.content = str(body.content, 60000);
  if (body.cover !== undefined) data.cover = safeUrl(body.cover, 2000);
  if (body.author !== undefined) data.author = str(body.author, 100);
  if (body.tags !== undefined) data.tags = str(body.tags, 300);
  if (body.published !== undefined) {
    const published = Boolean(body.published);
    data.published = published;
    // First publish stamps the date; unpublishing clears it so the public list
    // cannot show a post that is no longer live.
    data.publishedAt = published ? existing.publishedAt ?? new Date() : null;
  }
  if (!Object.keys(data).length) throw new HttpError("Nothing to update");

  const post = await db.platformPost.update({ where: { id }, data });
  await audit({ actor: admin.id, action: "POST_UPDATE", entity: "post", entityId: id, meta: { fields: Object.keys(data) } });
  return ok({ post: { ...post, publishedAt: post.publishedAt?.toISOString() ?? null } });
});

export const DELETE = route(async (req: Request, { params }: Params) => {
  const admin = await requireAdmin(req);
  const { id } = await params;

  const existing = await db.platformPost.findUnique({ where: { id } });
  if (!existing) throw new HttpError("Post not found", 404);

  await db.platformPost.delete({ where: { id } });
  await audit({ actor: admin.id, action: "POST_DELETE", entity: "post", entityId: id, meta: { slug: existing.slug } });
  return ok({ deleted: true });
});

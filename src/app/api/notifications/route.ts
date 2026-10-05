import { db } from "@/lib/db";
import { ok, pageParams, readJson, requireUser, route, str } from "@/lib/api";

export const GET = route(async (req: Request) => {
  const session = await requireUser(req);
  const { take, skip } = pageParams(req, 30, 100);
  const [notifications, unread] = await Promise.all([
    db.notification.findMany({ where: { userId: session.id }, orderBy: { createdAt: "desc" }, take, skip }),
    db.notification.count({ where: { userId: session.id, read: false } }),
  ]);
  return ok({ notifications, unread });
});

/** PATCH /api/notifications — mark all (or one) as read */
export const PATCH = route(async (req: Request) => {
  const session = await requireUser(req);
  const body = await readJson<{ id?: string }>(req);
  const id = str(body.id, 60);

  // Scoped by userId, so passing another user's notification id marks nothing.
  const result = await db.notification.updateMany({
    where: { userId: session.id, ...(id ? { id } : {}) },
    data: { read: true },
  });
  return ok({ success: true, updated: result.count });
});

import { db } from "@/lib/db";
import { fail, getSessionUser, ok } from "@/lib/auth";

export async function GET(req: Request) {
  const session = await getSessionUser(req);
  if (!session) return fail("Unauthorized", 401);
  const [notifications, unread] = await Promise.all([
    db.notification.findMany({ where: { userId: session.id }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.notification.count({ where: { userId: session.id, read: false } }),
  ]);
  return ok({ notifications, unread });
}

/** PATCH /api/notifications — mark all (or one) as read */
export async function PATCH(req: Request) {
  const session = await getSessionUser(req);
  if (!session) return fail("Unauthorized", 401);
  const body = (await req.json().catch(() => ({}))) as { id?: string };
  await db.notification.updateMany({
    where: { userId: session.id, ...(body.id ? { id: body.id } : {}) },
    data: { read: true },
  });
  return ok({ success: true });
}

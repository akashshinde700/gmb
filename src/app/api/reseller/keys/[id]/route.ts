import { db } from "@/lib/db";
import { HttpError, ok, requireUser, route } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

/**
 * DELETE /api/reseller/keys/:id — revoke a key.
 *
 * Marks it revoked rather than deleting the row, so the audit trail keeps
 * saying a key once existed and when it stopped working. Revocation takes
 * effect on the next call: authentication reads this column every time.
 */
export const DELETE = route(async (req: Request, { params }: Params) => {
  const { id } = await params;
  const session = await requireUser(req);
  const reseller = await db.reseller.findUnique({ where: { userId: session.id } });
  if (!reseller) throw new HttpError("This account is not set up as a reseller", 403);

  const key = await db.apiKey.findFirst({ where: { id, resellerId: reseller.id }, select: { id: true } });
  if (!key) throw new HttpError("No such key", 404);

  await db.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
  return ok({ revoked: true });
});

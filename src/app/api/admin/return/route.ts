import { db } from "@/lib/db";
import {
  adminBackupToken, clearAdminBackupCookie, sessionCookie, verifyTokenPayload,
} from "@/lib/auth";
import { audit, HttpError, ok, route } from "@/lib/api";

/**
 * POST /api/admin/return — come back out of a customer account.
 *
 * Deliberately NOT behind requireAdmin: by the time this is called the browser
 * is signed in as the customer, so the admin check would refuse the very person
 * it exists to protect. The authority is the parked token itself — it is a
 * normal signed session token, verified the same way any other is, and it only
 * works if the account it names is still an ADMIN.
 *
 * Nothing about it is a shortcut into an admin account: an attacker would need
 * a valid admin token already, which is the thing they would be trying to get.
 */
export const POST = route(async (req: Request) => {
  const parked = adminBackupToken(req);
  if (!parked) throw new HttpError("No admin session to return to. Sign in again.", 400);

  const parsed = verifyTokenPayload(parked);
  if (!parsed) throw new HttpError("That admin session has expired. Sign in again.", 401);

  const admin = await db.user.findUnique({ where: { id: parsed.uid } });
  // Same revocation rule as any other session: a password change since the
  // support visit began invalidates this too.
  if (!admin || admin.tokenVersion !== parsed.v) {
    throw new HttpError("That admin session has expired. Sign in again.", 401);
  }
  if (admin.role !== "ADMIN") throw new HttpError("Not an admin session", 403);

  await audit({
    actor: admin.id, action: "CUSTOMER_IMPERSONATE_END", entity: "user", entityId: admin.id,
  });

  const response = ok({ user: { id: admin.id, email: admin.email, name: admin.name, role: admin.role } });
  response.headers.append("Set-Cookie", sessionCookie(parked));
  response.headers.append("Set-Cookie", clearAdminBackupCookie());
  return response;
});

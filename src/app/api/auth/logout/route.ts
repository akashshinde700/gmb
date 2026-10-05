import { db } from "@/lib/db";
import { clearAdminBackupCookie, clearSessionCookie, getSessionUser } from "@/lib/auth";
import { audit, ok, readJson, route } from "@/lib/api";

/**
 * POST /api/auth/logout — clear the session cookie.
 *
 * With `{ everywhere: true }`, also bumps the user's tokenVersion, which
 * invalidates every token already issued for them — other browsers, other
 * devices, and any token someone else has taken a copy of. That is the whole
 * reason tokenVersion exists: these sessions are stateless HMACs, so there is
 * otherwise nothing to delete.
 *
 * Answers 200 even without a valid session. Logging out is not an operation
 * that should be able to fail, and a client clearing a stale cookie is doing
 * exactly the right thing.
 */
export const POST = route(async (req: Request) => {
  const body = await readJson<{ everywhere?: boolean }>(req);
  const session = await getSessionUser(req);

  if (session && body.everywhere === true) {
    await db.user.update({
      where: { id: session.id },
      data: { tokenVersion: { increment: 1 } },
    });
    await audit({
      actor: session.id,
      action: "SESSIONS_REVOKED",
      entity: "user",
      entityId: session.id,
    });
  }

  const response = ok({ loggedOut: true, everywhere: Boolean(session && body.everywhere) });
  response.headers.append("Set-Cookie", clearSessionCookie());
  // Also drop any parked admin session. Logging out has to mean this browser
  // holds no credential at all — leaving the backup behind would let whoever
  // sits down next POST /api/admin/return and be an admin.
  response.headers.append("Set-Cookie", clearAdminBackupCookie());
  return response;
});

import { db } from "@/lib/db";
import { adminBackupCookie, createToken, sessionCookie } from "@/lib/auth";
import { audit, HttpError, ok, requireAdmin, route } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/customers/[id]/impersonate — issue a session token for a
 * customer so support can reproduce what they are seeing.
 *
 * Deliberately narrow: only ADMIN can call it, only CUSTOMER accounts can be
 * entered (no admin-to-admin), and every use is written to the audit log with
 * the acting admin's id. The token is an ordinary customer session, so it
 * carries no admin rights.
 */
export const POST = route(async (req: Request, { params }: Params) => {
  const admin = await requireAdmin(req);
  const { id } = await params;

  // Read alongside the customer: the parked token has to carry the admin's
  // current tokenVersion, or restoring it later resolves to nobody.
  const [user, adminRow] = await Promise.all([
    db.user.findUnique({
      where: { id },
      include: { business: { select: { name: true, slug: true } } },
    }),
    db.user.findUnique({ where: { id: admin.id }, select: { tokenVersion: true } }),
  ]);
  const adminTokenVersion = adminRow?.tokenVersion ?? 0;
  if (!user) throw new HttpError("Customer not found", 404);
  if (user.role !== "CUSTOMER") throw new HttpError("Only customer accounts can be opened this way", 403);

  await audit({
    actor: admin.id, action: "CUSTOMER_IMPERSONATE", entity: "user", entityId: id,
    meta: { email: user.email, business: user.business?.name ?? null },
  });

  // Carries the customer's current tokenVersion, so an impersonation session is
  // revoked along with theirs rather than outliving it.
  const token = createToken(user.id, user.tokenVersion);

  // Swapping the session cookie is what actually moves the browser into the
  // customer's account. A browser has one cookie jar, so this applies to every
  // tab, including the admin console the click came from — opening the customer
  // in a new tab changes where it is visible, not who the browser is.
  //
  // So the admin's own session is parked in a second cookie rather than thrown
  // away. Coming back used to mean logging out and signing in again; now it is
  // POST /api/admin/return, which puts this token back.
  const response = ok({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    business: user.business ?? null,
  });
  response.headers.append("Set-Cookie", sessionCookie(token));
  response.headers.append("Set-Cookie", adminBackupCookie(createToken(admin.id, adminTokenVersion)));
  return response;
});

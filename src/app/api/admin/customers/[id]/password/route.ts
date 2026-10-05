import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { audit, HttpError, limitSubjectOrThrow, ok, readJson, requireAdmin, route } from "@/lib/api";
import { generatePassword } from "@/lib/provisioning";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/customers/[id]/password — issue a new password for a customer
 * who cannot get in. Returned once for the admin to pass on; there is no way to
 * read an existing password, only to replace it.
 */
export const POST = route(async (req: Request, { params }: Params) => {
  const admin = await requireAdmin(req);
  const { id } = await params;

  // An admin who can reset any password is exactly the account worth stealing,
  // and this endpoint hands back a working credential. Cap it per admin so a
  // hijacked session cannot walk the customer list.
  limitSubjectOrThrow(`admin:password:${admin.id}`, 20, 60 * 60 * 1000);

  const user = await db.user.findUnique({ where: { id } });
  if (!user) throw new HttpError("Customer not found", 404);
  if (user.role === "ADMIN") throw new HttpError("Use the account settings page to change an admin password", 403);

  const body = await readJson<{ password?: string }>(req);
  const password = String(body.password || "").trim() || generatePassword();
  if (password.length < 8) throw new HttpError("Password must be at least 8 characters");

  // Bumping tokenVersion invalidates every session token already issued to this
  // customer. Without it, an attacker who had signed in kept a valid 30-day
  // token after the owner asked support to lock them out — the reset changed
  // the password and nothing else.
  await db.user.update({
    where: { id },
    data: { passwordHash: hashPassword(password), tokenVersion: { increment: 1 } },
  });
  await db.notification.create({
    data: {
      userId: id,
      title: "Your password was reset",
      body: "A WebSetu administrator issued you a new password. Change it from Settings after you log in.",
    },
  });
  await audit({ actor: admin.id, action: "CUSTOMER_PASSWORD_RESET", entity: "user", entityId: id, meta: { email: user.email } });

  return ok({ password });
});

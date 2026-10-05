import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { createToken, hashPassword, sessionCookie } from "@/lib/auth";
import { audit, HttpError, limitOrThrow, ok, readJson, route, str } from "@/lib/api";

export const runtime = "nodejs";

/**
 * POST /api/auth/reset — set a new password using the emailed link.
 *
 * The link is a bearer credential, so it is single-use, short-lived, and the
 * act of using it bumps tokenVersion: whoever forced the reset — the owner, or
 * an attacker who had got in — is signed out of every existing session. That is
 * the point of a password reset and it does not work without revocation.
 */
export const POST = route(async (req: Request) => {
  limitOrThrow(req, "reset:ip", 20, 60 * 60 * 1000);

  const body = await readJson<{ token?: string; password?: string }>(req);
  const token = str(body.token, 200);
  const password = body.password || "";

  if (!token) throw new HttpError("This reset link is not valid");
  if (password.length < 8) throw new HttpError("Password must be at least 8 characters");
  if (password.length > 200) throw new HttpError("Password is too long");
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    throw new HttpError("Password must contain at least one letter and one number");
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const record = await db.passwordReset.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  // Expired, already used and never existed all give the same answer: a
  // different message for each would say whether a guessed token was ever real.
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new HttpError("This reset link has expired or already been used. Request a new one.", 400);
  }

  const user = await db.$transaction(async (tx) => {
    // Marking the link used inside the same transaction as the password change
    // is what makes it single-use: two simultaneous submissions cannot both
    // find it unused.
    const claimed = await tx.passwordReset.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw new HttpError("This reset link has already been used. Request a new one.", 400);
    }

    return tx.user.update({
      where: { id: record.userId },
      data: { passwordHash: hashPassword(password), tokenVersion: { increment: 1 } },
    });
  });

  await audit({ actor: user.id, action: "PASSWORD_RESET", entity: "user", entityId: user.id });

  // Signed straight in on the new password, on a fresh cookie.
  const session = createToken(user.id, user.tokenVersion);
  const response = ok({
    token: session,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
  response.headers.append("Set-Cookie", sessionCookie(session));
  return response;
});

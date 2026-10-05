import { createHash, randomBytes } from "node:crypto";
import { after } from "next/server";
import { db } from "@/lib/db";
import { HttpError, isEmail, limitOrThrow, limitSubjectOrThrow, ok, readJson, route, str } from "@/lib/api";
import { sendPasswordReset } from "@/lib/emails";
import { siteOrigin } from "@/lib/site-utils";

export const runtime = "nodejs";

/** How long a reset link stays usable. Short: it is a bearer credential. */
const TTL_MS = 60 * 60 * 1000;

/**
 * POST /api/auth/forgot — send a password reset link.
 *
 * Always answers 200 with the same message, whether or not the address has an
 * account. Anything else turns this endpoint into a way to test which email
 * addresses are registered, which is how a customer list leaks.
 *
 * Until now there was no self-serve recovery at all: a customer who forgot
 * their password had to reach an administrator.
 */
export const POST = route(async (req: Request) => {
  // Per-IP and per-address, so neither a spray across addresses nor a flood at
  // one inbox gets far.
  limitOrThrow(req, "forgot:ip", 10, 60 * 60 * 1000);

  const body = await readJson<{ email?: string }>(req);
  const email = str(body.email, 200).toLowerCase();
  if (!isEmail(email)) throw new HttpError("Please enter a valid email address");
  limitSubjectOrThrow(`forgot:acct:${email}`, 5, 60 * 60 * 1000);

  const generic = ok({
    sent: true,
    message: "If that email has an account, a reset link is on its way.",
  });

  const user = await db.user.findUnique({ where: { email } });
  if (!user) return generic;

  // Only the hash is stored, so a database copy does not hand out working reset
  // links for every account with one outstanding.
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");

  // Any earlier link for this account stops working the moment a new one is
  // requested — otherwise every request would leave another live key lying in
  // an inbox.
  await db.$transaction([
    db.passwordReset.deleteMany({ where: { userId: user.id, usedAt: null } }),
    db.passwordReset.create({
      data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + TTL_MS) },
    }),
  ]);

  after(async () => {
    await sendPasswordReset({
      to: user.email,
      name: user.name,
      url: `${siteOrigin()}/?reset=${token}`,
      expiresInMinutes: Math.round(TTL_MS / 60000),
    });
  });

  return generic;
});

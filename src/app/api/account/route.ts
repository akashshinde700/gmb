import { db } from "@/lib/db";
import { createToken, hashPassword, sessionCookie, verifyPassword } from "@/lib/auth";
import { audit, HttpError, limitSubjectOrThrow, ok, readJson, requireUser, route, str } from "@/lib/api";
import { parseJson } from "@/lib/sections";

export interface NotifyPrefs {
  leadAlerts: boolean;
  /** Text-message copy of a lead alert, sent to the business phone number. */
  smsAlerts: boolean;
  weekly: boolean;
  productUpdates: boolean;
}

// SMS defaults to off: the whole platform shares one gateway phone with a
// monthly allowance, so it is opted into by the owners who want it rather than
// spent automatically on everyone.
const DEFAULT_PREFS: NotifyPrefs = {
  leadAlerts: true,
  smsAlerts: false,
  weekly: true,
  productUpdates: false,
};

function readPrefs(raw: string): NotifyPrefs {
  const stored = parseJson<Partial<NotifyPrefs>>(raw, {});
  return {
    leadAlerts: stored.leadAlerts ?? DEFAULT_PREFS.leadAlerts,
    smsAlerts: stored.smsAlerts ?? DEFAULT_PREFS.smsAlerts,
    weekly: stored.weekly ?? DEFAULT_PREFS.weekly,
    productUpdates: stored.productUpdates ?? DEFAULT_PREFS.productUpdates,
  };
}

/** GET /api/account — profile + notification preferences for the Settings tab */
export const GET = route(async (req: Request) => {
  const session = await requireUser(req);
  const user = await db.user.findUnique({ where: { id: session.id } });
  if (!user) throw new HttpError("Account not found", 404);
  return ok({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    prefs: readPrefs(user.notifyJson),
  });
});

/** PATCH /api/account — rename the account and/or save notification preferences */
export const PATCH = route(async (req: Request) => {
  const session = await requireUser(req);
  const body = await readJson<{ name?: string; prefs?: Partial<NotifyPrefs> }>(req);

  const data: { name?: string; notifyJson?: string } = {};

  if (body.name !== undefined) {
    const name = str(body.name, 120);
    if (name.length < 2) throw new HttpError("Please enter your full name");
    data.name = name;
  }

  if (body.prefs !== undefined) {
    if (typeof body.prefs !== "object" || body.prefs === null) throw new HttpError("Invalid preferences");
    const current = await db.user.findUnique({ where: { id: session.id }, select: { notifyJson: true } });
    const merged: NotifyPrefs = {
      ...readPrefs(current?.notifyJson ?? "{}"),
      ...(body.prefs.leadAlerts !== undefined ? { leadAlerts: Boolean(body.prefs.leadAlerts) } : {}),
      ...(body.prefs.smsAlerts !== undefined ? { smsAlerts: Boolean(body.prefs.smsAlerts) } : {}),
      ...(body.prefs.weekly !== undefined ? { weekly: Boolean(body.prefs.weekly) } : {}),
      ...(body.prefs.productUpdates !== undefined ? { productUpdates: Boolean(body.prefs.productUpdates) } : {}),
    };
    data.notifyJson = JSON.stringify(merged);
  }

  if (!Object.keys(data).length) throw new HttpError("Nothing to update");

  const user = await db.user.update({ where: { id: session.id }, data });
  return ok({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    prefs: readPrefs(user.notifyJson),
  });
});

/** PUT /api/account — change password (current password required) */
export const PUT = route(async (req: Request) => {
  const session = await requireUser(req);
  limitSubjectOrThrow(`password:${session.id}`, 10, 60 * 60 * 1000);

  const body = await readJson<{ currentPassword?: string; newPassword?: string }>(req);
  const currentPassword = body.currentPassword || "";
  const newPassword = body.newPassword || "";

  if (newPassword.length < 8) throw new HttpError("New password must be at least 8 characters");
  if (newPassword.length > 200) throw new HttpError("New password is too long");
  if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    throw new HttpError("New password must contain at least one letter and one number");
  }

  const user = await db.user.findUnique({ where: { id: session.id } });
  if (!user) throw new HttpError("Account not found", 404);
  if (!verifyPassword(currentPassword, user.passwordHash)) {
    throw new HttpError("Your current password is incorrect", 401);
  }
  if (verifyPassword(newPassword, user.passwordHash)) {
    throw new HttpError("The new password must be different from the current one");
  }

  // Changing a password now signs every other session out. Someone who changes
  // their password because they think an account is compromised expects exactly
  // that; leaving old sessions alive made the action nearly pointless.
  const updated = await db.user.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(newPassword), tokenVersion: { increment: 1 } },
  });
  await audit({ actor: user.id, action: "PASSWORD_CHANGED", entity: "user", entityId: user.id });

  // The caller's own session went down with the rest, so it is handed a fresh
  // token and cookie rather than being logged out mid-action.
  const token = createToken(updated.id, updated.tokenVersion);
  const response = ok({ changed: true, otherSessionsRevoked: true, token });
  response.headers.append("Set-Cookie", sessionCookie(token));
  return response;
});

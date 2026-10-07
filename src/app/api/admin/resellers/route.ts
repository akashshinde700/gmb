import { db } from "@/lib/db";
import { audit, HttpError, ok, readJson, requireAdmin, route, str } from "@/lib/api";
import { cleanBrandInput, type BrandInput } from "@/lib/reseller";

/**
 * Admin: make an account a reseller.
 *
 * A reseller is an existing customer account with the reseller record attached
 * — the same person, the same login, plus a brand and the ability to mint API
 * keys. There is no separate signup: agencies arrive through the normal funnel,
 * and turning one on is an operator decision (it is a commercial relationship,
 * not a feature flag).
 *
 * POST /api/admin/resellers { email, brandName?, hostname?, ... }
 */
export const POST = route(async (req: Request) => {
  const admin = await requireAdmin(req);
  const body = await readJson<BrandInput & { email?: string }>(req);
  const email = str(body.email, 200).trim().toLowerCase();
  if (!email) throw new HttpError("Which account should become a reseller?");

  const user = await db.user.findUnique({ where: { email }, select: { id: true, role: true, name: true } });
  if (!user) throw new HttpError("No account with that email — invite them first", 404);
  if (user.role === "ADMIN") throw new HttpError("Admin accounts cannot be resellers");

  const fields = cleanBrandInput(body);
  const hostname = fields.hostname ?? "";
  if (hostname) {
    // Excluding this account matters: an operator re-running the call (or
    // correcting the brand) must not collide with the row they are updating.
    const clash = await db.reseller.findFirst({
      where: { hostname, NOT: { userId: user.id } },
      select: { id: true },
    });
    if (clash) throw new HttpError("That domain is already in use by another reseller", 409);
  }

  const reseller = await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { role: "RESELLER" } });
    return tx.reseller.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        brandName: fields.brandName ?? "",
        logoUrl: fields.logoUrl ?? "",
        supportEmail: fields.supportEmail ?? email,
        primaryColor: fields.primaryColor ?? "",
        hostname,
      },
      update: { ...fields },
      select: { id: true, brandName: true, hostname: true, supportEmail: true },
    });
  });

  await audit({
    actor: admin.id,
    action: "RESELLER_ENABLED",
    entity: "reseller",
    entityId: reseller.id,
    meta: { account: `${user.name} <${email}>`, hostname: reseller.hostname },
  });
  return ok({ reseller }, 201);
});

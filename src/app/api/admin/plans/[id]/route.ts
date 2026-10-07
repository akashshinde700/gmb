import { db } from "@/lib/db";
import { serializePlan } from "@/lib/serialize";
import { audit, HttpError, ok, readJson, requireAdmin, route, str } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

export const PUT = route(async (req: Request, { params }: Params) => {
  const admin = await requireAdmin(req);
  const { id } = await params;

  const existing = await db.plan.findUnique({ where: { id } });
  if (!existing) throw new HttpError("Plan not found", 404);

  const body = await readJson<{
    name?: string; tagline?: string; priceMonthly?: number; priceYearly?: number;
    features?: string[]; maxPages?: number; aiCredits?: number; maxPalettes?: number;
    maxDomains?: number; maxThemeChanges?: number;
    popular?: boolean; active?: boolean;
  }>(req);

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = str(body.name, 60);
    if (name.length < 2) throw new HttpError("Plan name must be at least 2 characters");
    data.name = name;
  }
  if (body.tagline !== undefined) data.tagline = str(body.tagline, 200);
  for (const key of ["priceMonthly", "priceYearly"] as const) {
    if (body[key] === undefined) continue;
    const value = Number(body[key]);
    if (!Number.isFinite(value) || value < 0) throw new HttpError("Prices must be zero or more");
    data[key] = value;
  }
  if (body.features !== undefined) {
    if (!Array.isArray(body.features)) throw new HttpError("Features must be a list");
    data.featuresJson = JSON.stringify(body.features.filter(Boolean).slice(0, 30).map((f) => str(f, 200)));
  }
  // maxDomains and maxThemeChanges are enforced by domain-rules/appearance-rules
  // but had no way in: an admin could not set the allowance the API checks, so
  // both meters were stuck at "whatever the seed wrote".
  for (const key of ["maxPages", "aiCredits", "maxPalettes", "maxDomains", "maxThemeChanges"] as const) {
    if (body[key] === undefined) continue;
    const value = Number(body[key]);
    if (!Number.isFinite(value)) throw new HttpError(`${key} must be a number`);
    data[key] = Math.trunc(value);
  }
  if (body.popular !== undefined) data.popular = Boolean(body.popular);
  if (body.active !== undefined) data.active = Boolean(body.active);
  if (!Object.keys(data).length) throw new HttpError("Nothing to update");

  const plan = await db.plan.update({ where: { id }, data });
  await audit({ actor: admin.id, action: "PLAN_UPDATE", entity: "plan", entityId: id, meta: { fields: Object.keys(data) } });
  return ok(serializePlan(plan));
});

export const DELETE = route(async (req: Request, { params }: Params) => {
  const admin = await requireAdmin(req);
  const { id } = await params;

  const existing = await db.plan.findUnique({ where: { id } });
  if (!existing) throw new HttpError("Plan not found", 404);

  const inUse = await db.subscription.findFirst({ where: { planId: id }, select: { id: true } });
  if (inUse) {
    // Soft-disable instead of hard delete to preserve subscription history
    await db.plan.update({ where: { id }, data: { active: false } });
    await audit({ actor: admin.id, action: "PLAN_DISABLE", entity: "plan", entityId: id });
    return ok({ disabled: true, message: "Plan is in use — it was deactivated instead of deleted." });
  }

  await db.plan.delete({ where: { id } });
  await audit({ actor: admin.id, action: "PLAN_DELETE", entity: "plan", entityId: id, meta: { slug: existing.slug } });
  return ok({ deleted: true });
});

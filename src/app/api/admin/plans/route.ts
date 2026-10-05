import { db } from "@/lib/db";
import { serializePlan } from "@/lib/serialize";
import { audit, HttpError, ok, readJson, requireAdmin, route, str } from "@/lib/api";

export const GET = route(async (req: Request) => {
  await requireAdmin(req);
  const plans = await db.plan.findMany({ orderBy: { sortOrder: "asc" } });
  return ok(plans.map(serializePlan));
});

export const POST = route(async (req: Request) => {
  const admin = await requireAdmin(req);

  const body = await readJson<{
    name?: string; tagline?: string; priceMonthly?: number; priceYearly?: number;
    features?: string[]; maxPages?: number; aiCredits?: number; maxPalettes?: number; popular?: boolean;
  }>(req);

  const name = str(body.name, 60);
  if (!name) throw new HttpError("Plan name is required");

  const priceMonthly = Number(body.priceMonthly ?? 0);
  const priceYearly = Number(body.priceYearly ?? 0);
  if (!Number.isFinite(priceMonthly) || priceMonthly < 0) throw new HttpError("Monthly price must be zero or more");
  if (!Number.isFinite(priceYearly) || priceYearly < 0) throw new HttpError("Yearly price must be zero or more");

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!slug) throw new HttpError("Plan name must contain letters or numbers");
  const exists = await db.plan.findUnique({ where: { slug } });
  if (exists) throw new HttpError("A plan with this name already exists", 409);

  const maxPages = Number(body.maxPages ?? 10);
  const aiCredits = Number(body.aiCredits ?? 0);
  // -1 keeps the whole palette library available on this plan.
  const maxPalettes = Number(body.maxPalettes ?? -1);

  const plan = await db.plan.create({
    data: {
      name,
      slug,
      tagline: str(body.tagline, 200),
      priceMonthly,
      priceYearly,
      featuresJson: JSON.stringify(
        (Array.isArray(body.features) ? body.features : []).filter(Boolean).slice(0, 30).map((f) => str(f, 200)),
      ),
      maxPages: Number.isFinite(maxPages) ? Math.trunc(maxPages) : 10,
      aiCredits: Number.isFinite(aiCredits) ? Math.trunc(aiCredits) : 0,
      maxPalettes: Number.isFinite(maxPalettes) ? Math.trunc(maxPalettes) : -1,
      popular: Boolean(body.popular),
      sortOrder: (await db.plan.count()) + 1,
    },
  });

  await audit({ actor: admin.id, action: "PLAN_CREATE", entity: "plan", entityId: plan.id, meta: { slug } });
  return ok(serializePlan(plan), 201);
});

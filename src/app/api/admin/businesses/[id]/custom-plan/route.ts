import { db } from "@/lib/db";
import { serializePlan } from "@/lib/serialize";
import { audit, HttpError, ok, requireAdmin, route } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/businesses/[id]/custom-plan — give one customer a dedicated
 * plan, copied from the one they are on, so its limits and price can be tuned
 * for them without touching the public plans everyone else sees.
 *
 * Custom plans are hidden from public pricing (see /api/plans) and can only be
 * assigned to the customer they were made for.
 */
export const POST = route(async (req: Request, { params }: Params) => {
  const admin = await requireAdmin(req);
  const { id } = await params;

  const business = await db.business.findUnique({
    where: { id },
    include: { subscription: { include: { plan: true } } },
  });
  if (!business) throw new HttpError("Business not found", 404);
  if (!business.subscription) throw new HttpError("This customer has no subscription yet", 404);

  const existing = await db.plan.findFirst({ where: { customForBusinessId: id } });
  if (existing) {
    // Already has one — make sure it is the active assignment and hand it back.
    if (business.subscription.planId !== existing.id) {
      await db.subscription.update({ where: { businessId: id }, data: { planId: existing.id } });
    }
    return ok({ plan: serializePlan(existing), created: false });
  }

  const source = business.subscription.plan;
  const slugBase = `custom-${business.slug}`.slice(0, 50);
  let slug = slugBase;
  let i = 1;
  while (await db.plan.findUnique({ where: { slug } })) {
    i += 1;
    slug = `${slugBase}-${i}`;
  }

  const plan = await db.$transaction(async (tx) => {
    const created = await tx.plan.create({
      data: {
        name: `Custom — ${business.name}`.slice(0, 60),
        slug,
        tagline: `Dedicated plan for ${business.name}`.slice(0, 200),
        priceMonthly: source.priceMonthly,
        priceYearly: source.priceYearly,
        featuresJson: source.featuresJson,
        maxPages: source.maxPages,
        aiCredits: source.aiCredits,
        maxPalettes: source.maxPalettes,
        popular: false,
        active: true,
        sortOrder: 9000,
        customForBusinessId: id,
      },
    });
    await tx.subscription.update({ where: { businessId: id }, data: { planId: created.id } });
    return created;
  });

  await audit({
    actor: admin.id, action: "CUSTOM_PLAN_CREATE", entity: "plan", entityId: plan.id,
    meta: { business: business.name, copiedFrom: source.slug },
  });

  return ok({ plan: serializePlan(plan), created: true }, 201);
});

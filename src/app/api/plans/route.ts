import { db } from "@/lib/db";
import { serializePlan, serializeTemplate } from "@/lib/serialize";
import { ok, route } from "@/lib/api";

/** GET /api/plans — public pricing data (plans + templates for the template gallery) */
export const GET = route(async () => {
  const [plans, templates] = await Promise.all([
    // Custom plans belong to a single customer and never appear in public pricing.
    db.plan.findMany({ where: { active: true, customForBusinessId: null }, orderBy: { sortOrder: "asc" } }),
    db.template.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  return ok({
    plans: plans.map(serializePlan),
    templates: templates.map(serializeTemplate),
  });
});

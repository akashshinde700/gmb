import { db } from "@/lib/db";
import { ok } from "@/lib/auth";
import { serializePlan, serializeTemplate } from "@/lib/serialize";

/** GET /api/plans — public pricing data (plans + templates for template gallery) */
export async function GET() {
  const [plans, templates] = await Promise.all([
    db.plan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.template.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  return ok({
    plans: plans.map(serializePlan),
    templates: templates.map(serializeTemplate),
  });
}

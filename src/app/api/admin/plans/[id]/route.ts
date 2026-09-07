import { db } from "@/lib/db";
import { fail, getSessionUser, ok } from "@/lib/auth";
import { serializePlan } from "@/lib/serialize";

async function requireAdmin(req: Request) {
  const session = await getSessionUser(req);
  if (!session) return { error: fail("Unauthorized", 401) as Response };
  if (session.role !== "ADMIN") return { error: fail("Admin access required", 403) as Response };
  return { session };
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  const { id } = await params;

  const body = (await req.json()) as {
    name?: string; tagline?: string; priceMonthly?: number; priceYearly?: number;
    features?: string[]; maxPages?: number; aiCredits?: number; popular?: boolean; active?: boolean;
  };

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.tagline !== undefined) data.tagline = body.tagline;
  if (body.priceMonthly !== undefined) data.priceMonthly = Number(body.priceMonthly);
  if (body.priceYearly !== undefined) data.priceYearly = Number(body.priceYearly);
  if (body.features !== undefined) data.featuresJson = JSON.stringify(body.features.filter(Boolean));
  if (body.maxPages !== undefined) data.maxPages = Number(body.maxPages);
  if (body.aiCredits !== undefined) data.aiCredits = Number(body.aiCredits);
  if (body.popular !== undefined) data.popular = Boolean(body.popular);
  if (body.active !== undefined) data.active = Boolean(body.active);

  const plan = await db.plan.update({ where: { id }, data });
  return ok(serializePlan(plan));
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  const { id } = await params;

  const inUse = await db.subscription.findFirst({ where: { planId: id } });
  if (inUse) {
    // Soft-disable instead of hard delete to preserve subscription history
    await db.plan.update({ where: { id }, data: { active: false } });
    return ok({ disabled: true, message: "Plan is in use — it was deactivated instead of deleted." });
  }
  await db.plan.delete({ where: { id } });
  return ok({ deleted: true });
}

import { db } from "@/lib/db";
import { fail, getSessionUser, ok } from "@/lib/auth";
import { serializePlan } from "@/lib/serialize";

async function requireAdmin(req: Request) {
  const session = await getSessionUser(req);
  if (!session) return { error: fail("Unauthorized", 401) as Response };
  if (session.role !== "ADMIN") return { error: fail("Admin access required", 403) as Response };
  return { session };
}

export async function GET(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  const plans = await db.plan.findMany({ orderBy: { sortOrder: "asc" } });
  return ok(plans.map(serializePlan));
}

export async function POST(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const body = (await req.json()) as {
    name?: string; tagline?: string; priceMonthly?: number; priceYearly?: number;
    features?: string[]; maxPages?: number; aiCredits?: number; popular?: boolean;
  };
  if (!body.name) return fail("Plan name is required");

  const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const exists = await db.plan.findUnique({ where: { slug } });
  if (exists) return fail("A plan with this name already exists");

  const plan = await db.plan.create({
    data: {
      name: body.name, slug, tagline: body.tagline || "",
      priceMonthly: Number(body.priceMonthly || 0),
      priceYearly: Number(body.priceYearly || 0),
      featuresJson: JSON.stringify((body.features || []).filter(Boolean)),
      maxPages: Number(body.maxPages ?? 10),
      aiCredits: Number(body.aiCredits ?? 0),
      popular: Boolean(body.popular),
      sortOrder: (await db.plan.count()) + 1,
    },
  });
  return ok(serializePlan(plan), 201);
}

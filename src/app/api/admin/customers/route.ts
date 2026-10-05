import { db } from "@/lib/db";
import { containsInsensitive } from "@/lib/db-portable";
import { TRIAL_DAYS } from "@/lib/trial";
import { serializeBusiness, serializeSub } from "@/lib/serialize";
import { audit, HttpError, isEmail, ok, pageParams, readJson, requireAdmin, route, str } from "@/lib/api";
import { provisionCustomer } from "@/lib/provisioning";

/** GET /api/admin/customers — all customers with business + subscription */
export const GET = route(async (req: Request) => {
  await requireAdmin(req);
  const { take, skip, searchParams } = pageParams(req, 100, 200);
  const q = str(searchParams.get("q"), 100);

  // Search runs in SQL. Filtering the first 200 rows in JS meant a customer
  // outside that window could not be found at all.
  const where = q
    ? {
        role: "CUSTOMER",
        OR: [
          { name: containsInsensitive(q) },
          { email: containsInsensitive(q) },
          { business: { name: containsInsensitive(q) } },
          { business: { slug: containsInsensitive(q) } },
        ],
      }
    : { role: "CUSTOMER" };

  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      include: {
        business: {
          include: {
            subscription: { include: { plan: true } },
            // Counts come from the database rather than N queries per row, so
            // the admin can see who is close to their plan limits at a glance.
            _count: { select: { services: true, products: true, gallery: true, leads: true, domains: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take,
      skip,
    }),
    db.user.count({ where }),
  ]);

  const rows = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    createdAt: u.createdAt.toISOString(),
    business: u.business ? serializeBusiness(u.business) : null,
    subscription: u.business?.subscription ? serializeSub(u.business.subscription) : null,
    usage: u.business
      ? {
          services: u.business._count.services,
          products: u.business._count.products,
          gallery: u.business._count.gallery,
          leads: u.business._count.leads,
          aiUsed: u.business.aiUsedCount,
          // Domains are a paid add-on, so the admin needs to see both what the
          // customer bought and what they have actually connected.
          domains: u.business._count.domains,
          domainCredits: u.business.domainCredits,
        }
      : null,
  }));

  return ok(rows, 200, { total, take, skip });
});

/**
 * POST /api/admin/customers — create a customer account on their behalf.
 *
 * With `business` supplied the tenant is provisioned end to end (business,
 * generated website, subscription) exactly as the signup wizard would, so the
 * customer can log in and start editing instead of repeating onboarding.
 * The generated password is returned once and never stored in readable form.
 */
export const POST = route(async (req: Request) => {
  const admin = await requireAdmin(req);
  const body = await readJson<{
    name?: string; email?: string; password?: string;
    businessName?: string; category?: string; phone?: string; city?: string; address?: string;
    planId?: string; cycle?: string; trialDays?: number;
  }>(req);

  const name = str(body.name, 120);
  const email = str(body.email, 200).toLowerCase();
  if (name.length < 2) throw new HttpError("Enter the customer's full name");
  if (!isEmail(email)) throw new HttpError("Enter a valid email address");

  const businessName = str(body.businessName, 150);
  const category = str(body.category, 100);
  if (businessName && !category) throw new HttpError("Choose a business category");

  const trialDaysRaw = Number(body.trialDays ?? TRIAL_DAYS);
  const trialDays = Number.isFinite(trialDaysRaw)
    ? Math.max(0, Math.min(365, Math.trunc(trialDaysRaw)))
    : TRIAL_DAYS;

  const result = await provisionCustomer({
    name,
    email,
    password: body.password ? String(body.password) : undefined,
    business: businessName
      ? {
          name: businessName,
          category,
          phone: str(body.phone, 20),
          city: str(body.city, 100),
          address: str(body.address, 300),
          planId: str(body.planId, 60) || undefined,
          cycle: body.cycle === "YEARLY" ? "YEARLY" : "MONTHLY",
          trialDays,
        }
      : undefined,
  });

  await audit({
    actor: admin.id, action: "CUSTOMER_CREATE", entity: "user", entityId: result.userId,
    meta: { email, withBusiness: !!businessName, slug: result.slug },
  });

  // `password` is shown to the admin once; it is not persisted anywhere.
  return ok(
    { id: result.userId, businessId: result.businessId, email: result.email, slug: result.slug, password: result.password },
    201,
  );
});

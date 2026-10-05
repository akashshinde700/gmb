import { db } from "@/lib/db";
import { audit, HttpError, ok, readJson, requireAdmin, route } from "@/lib/api";

const BUSINESS_STATUSES = ["DRAFT", "PUBLISHED", "SUSPENDED", "EXPIRED", "ARCHIVED"];

type Params = { params: Promise<{ id: string }> };

/** PATCH /api/admin/businesses/[id] — suspend / activate / change status */
export const PATCH = route(async (req: Request, { params }: Params) => {
  const admin = await requireAdmin(req);
  const { id } = await params;

  const body = await readJson<{ status?: string; domainCredits?: number }>(req);

  const business = await db.business.findUnique({ where: { id } });
  if (!business) throw new HttpError("Business not found", 404);

  // Granting paid-for custom domains. Domains are sold as an add-on rather than
  // bundled into a plan, so this is how a customer who has paid actually gets
  // one — and it is deliberately a separate branch from a status change, which
  // is a different action with different consequences.
  if (body.domainCredits !== undefined) {
    const credits = Number(body.domainCredits);
    if (!Number.isInteger(credits) || credits < -1 || credits > 100) {
      throw new HttpError("Domain credits must be a whole number from -1 (unlimited) to 100");
    }

    // Taking credits away below what is already connected would leave domains
    // routing that the customer is no longer entitled to. Those have to be
    // disconnected first, deliberately, so nobody's live site disappears as a
    // side effect of an edit here.
    if (credits !== -1) {
      const connected = await db.domain.count({ where: { businessId: id } });
      if (credits < connected) {
        throw new HttpError(
          `${business.name} already has ${connected} domain${connected === 1 ? "" : "s"} connected. Disconnect some first.`,
        );
      }
    }

    const row = await db.business.update({ where: { id }, data: { domainCredits: credits } });

    if (credits > business.domainCredits || credits === -1) {
      await db.notification.create({
        data: {
          userId: business.userId,
          title: "Custom domain unlocked 🌐",
          body: "You can now connect your own domain from Dashboard → Settings → Your own domain.",
        },
      });
    }

    await audit({
      actor: admin.id,
      action: "BUSINESS_DOMAIN_CREDITS",
      entity: "business",
      entityId: id,
      meta: { name: business.name, from: business.domainCredits, to: credits },
    });

    return ok({ id: row.id, domainCredits: row.domainCredits });
  }

  const status = String(body.status || "");
  if (!BUSINESS_STATUSES.includes(status)) throw new HttpError("Invalid status");

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.business.update({ where: { id }, data: { status } });
    // Publishing state and the site's publishedAt marker must agree, otherwise
    // a suspended site still reports itself as published.
    if (status !== "PUBLISHED") {
      await tx.website.updateMany({ where: { businessId: id }, data: { publishedAt: null } });
    }
    await tx.notification.create({
      data: {
        userId: business.userId,
        title: status === "SUSPENDED" ? "Website suspended" : `Website status: ${status}`,
        body: `Your website ${business.name} status was changed to ${status} by the platform team.`,
      },
    });
    return row;
  });

  // The audit actor is the acting admin's id, not the literal string "admin" —
  // otherwise the trail cannot answer who did it.
  await audit({
    actor: admin.id,
    action: `BUSINESS_${status}`,
    entity: "business",
    entityId: id,
    meta: { name: business.name, previousStatus: business.status },
  });

  return ok({ id: updated.id, status: updated.status });
});

/** DELETE /api/admin/businesses/[id] — remove business + data (audit-logged) */
export const DELETE = route(async (req: Request, { params }: Params) => {
  const admin = await requireAdmin(req);
  const { id } = await params;

  const business = await db.business.findUnique({
    where: { id },
    include: { subscription: true, _count: { select: { leads: true, payments: true } } },
  });
  if (!business) throw new HttpError("Business not found", 404);

  // Payments detach instead of cascading (schema onDelete: SetNull), so revenue
  // history survives the deletion of the tenant that generated it.
  await db.business.delete({ where: { id } });
  await audit({
    actor: admin.id,
    action: "BUSINESS_DELETE",
    entity: "business",
    entityId: id,
    meta: {
      name: business.name,
      slug: business.slug,
      userId: business.userId,
      leads: business._count.leads,
      payments: business._count.payments,
    },
  });
  return ok({ deleted: id });
});

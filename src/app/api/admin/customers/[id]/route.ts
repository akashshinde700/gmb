import { db } from "@/lib/db";
import { audit, HttpError, limitSubjectOrThrow, ok, requireAdmin, route } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

/**
 * DELETE /api/admin/customers/[id] — remove a customer account and everything
 * under it.
 *
 * This did not exist. The admin console could delete a customer's BUSINESS
 * ("Delete website"), which left the person's account behind with no way to
 * remove it — a row reading "No website yet" that nothing in the product could
 * clear. Four of them accumulated on the live system and had to be deleted by
 * hand from the database.
 *
 * What goes: the user, their business, website, services, products, gallery,
 * testimonials, FAQs, blog posts, leads, analytics, domains and notifications —
 * all by the schema's cascades.
 *
 * What stays: payments. `Payment.businessId` is `onDelete: SetNull` on purpose,
 * so invoices and revenue history outlive the account that generated them. The
 * `billToJson` snapshot on each payment records who it was billed to, so a
 * deleted customer's receipt is still a complete document.
 *
 * Irreversible. The audit row is written BEFORE the delete, so the record of who
 * removed what survives the thing it describes.
 */
export const DELETE = route(async (req: Request, { params }: Params) => {
  const admin = await requireAdmin(req);
  const { id } = await params;

  // An admin session that has been taken over should not be able to empty the
  // customer table in a loop.
  limitSubjectOrThrow(`admin:customer-delete:${admin.id}`, 20, 60 * 60 * 1000);

  const user = await db.user.findUnique({
    where: { id },
    include: {
      business: {
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          _count: { select: { leads: true, payments: true } },
        },
      },
    },
  });
  if (!user) throw new HttpError("Customer not found", 404);

  // Deleting yourself locks you out of the console you are standing in.
  if (user.id === admin.id) {
    throw new HttpError("You cannot delete your own account from here", 400);
  }
  // Admins are removed deliberately, at the database, by someone who has
  // thought about who is left holding the keys — not from a row menu.
  if (user.role === "ADMIN") {
    throw new HttpError("Admin accounts cannot be deleted from the customer list", 403);
  }

  await audit({
    actor: admin.id,
    action: "CUSTOMER_DELETE",
    entity: "user",
    entityId: id,
    meta: {
      email: user.email,
      name: user.name,
      business: user.business?.name ?? null,
      slug: user.business?.slug ?? null,
      status: user.business?.status ?? null,
      leads: user.business?._count.leads ?? 0,
      payments: user.business?._count.payments ?? 0,
    },
  });

  await db.user.delete({ where: { id } });

  return ok({
    deleted: id,
    email: user.email,
    business: user.business?.name ?? null,
    // What the caller should tell the admin was kept.
    paymentsKept: user.business?._count.payments ?? 0,
  });
});

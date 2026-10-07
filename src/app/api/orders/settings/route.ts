import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { HttpError, ok, readJson, requireBusiness, requireUser, route } from "@/lib/api";
import { readCommerce } from "@/lib/commerce";
import { recordVersion } from "@/lib/site-history";
import { parseJson } from "@/lib/sections";
import type { SiteSection } from "@/lib/types";

/**
 * The shop's rules.
 *
 *   GET /api/orders/settings — what the shop is set to today
 *   PUT /api/orders/settings — change it
 *
 * A shop that has never touched this reads as "not selling online", which is the
 * only honest default: a business that takes orders on the phone should not
 * sprout a checkout because somebody shipped one.
 *
 * Every field goes through readCommerce, the same reader the storefront uses, so
 * a range the API accepts is a range the cart can render. A negative delivery
 * charge is not "an odd number to fix later" — it is money the shop would owe.
 */
export const GET = route(async (req: Request) => {
  const session = await requireUser(req);
  const business = await requireBusiness(session);
  return ok({ settings: readCommerce(business.commerceJson) });
});

export const PUT = route(async (req: Request) => {
  const session = await requireUser(req);
  const business = await requireBusiness(session);
  const body = await readJson<Record<string, unknown>>(req);

  // Validate with the same reader the storefront uses, but reject rather than
  // silently clamp: an owner who typed -50 must be told, not quietly given 0.
  for (const key of ["deliveryCharge", "freeDeliveryAbove", "minOrder"] as const) {
    const value = body[key];
    if (value === undefined || value === "") continue;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) throw new HttpError(`${key} must be a number of rupees, 0 or more`);
    if (n > 100_000) throw new HttpError(`${key} looks too large — is that in rupees?`);
  }
  for (const key of ["enabled", "pickup", "cod"] as const) {
    const value = body[key];
    if (value !== undefined && typeof value !== "boolean") throw new HttpError(`${key} must be true or false`);
  }

  const settings = readCommerce(JSON.stringify(body));

  // Turning the shop on without a single priced product would publish a cart
  // that can never be filled. Say so now rather than let the owner find out from
  // a customer.
  if (settings.enabled) {
    const priced = await db.product.count({
      where: { businessId: business.id, hidePrice: false, OR: [{ price: { gt: 0 } }, { salePrice: { gt: 0 } }] },
    });
    if (!priced) {
      throw new HttpError(
        "Add at least one product with a price before switching online orders on — the cart only sells priced products",
        409,
      );
    }
  }

  /**
   * A shop with nothing to buy is not a shop.
   *
   * Every generated site does not carry a products section — the director only
   * adds one when the business looked like it sells goods. Turning online orders
   * on for a site without one would publish a cart that can never be filled, so
   * the section is added here, once, and the response says so. It is the same
   * section the manual editor would add; the owner can move or hide it.
   */
  let addedProductsSection = false;
  if (settings.enabled) {
    const sections = parseJson<SiteSection[]>(business.website?.sectionsJson ?? "[]", []);
    const hasVisibleProducts = sections.some((section) => section.type === "products" && section.visible !== false);
    if (!hasVisibleProducts) {
      const next: SiteSection[] = [
        ...sections,
        {
          id: `s_${Math.random().toString(36).slice(2, 10)}`,
          type: "products",
          visible: true,
          content: {
            title: "Our Products",
            subtitle: "Order online and we will deliver — or collect from the shop.",
          },
        },
      ];
      const json = JSON.stringify(next);
      const website = await db.website.update({
        where: { businessId: business.id },
        data: { sectionsJson: json, version: { increment: 1 } },
      });
      await recordVersion({ website, label: "Added the products section for online orders", actor: business.ownerName || "Owner" });
      addedProductsSection = true;
    }
  }

  const updated = await db.business.update({
    where: { id: business.id },
    data: { commerceJson: JSON.stringify(settings) },
    select: { commerceJson: true },
  });

  // The published page is cached for a few minutes. Turning the shop on and then
  // seeing no cart is the kind of thing an owner reads as "it did not work", so
  // the tenant's page is re-rendered now — the storefront is a single page, and
  // invalidating it costs one render.
  revalidatePath(`/s/${business.slug}`);

  return ok({ settings: readCommerce(updated.commerceJson), addedProductsSection });
});

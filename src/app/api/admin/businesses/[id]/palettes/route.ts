import { db } from "@/lib/db";
import { audit, HttpError, ok, readJson, requireAdmin, route } from "@/lib/api";
import { listPalettes, palettesForBusiness, parseIds } from "@/lib/palette-store";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/businesses/[id]/palettes — what this customer can currently
 * pick from, plus the whole library so an admin can tailor the list.
 */
export const GET = route(async (req: Request, { params }: Params) => {
  await requireAdmin(req);
  const { id } = await params;

  const business = await db.business.findUnique({
    where: { id },
    select: {
      id: true, name: true, allowedPalettesJson: true,
      subscription: { select: { plan: { select: { name: true, maxPalettes: true } } } },
    },
  });
  if (!business) throw new HttpError("Business not found", 404);

  const [library, effective] = await Promise.all([
    listPalettes({ scope: "BUSINESS" }),
    palettesForBusiness(business.id),
  ]);

  return ok({
    business: { id: business.id, name: business.name },
    plan: business.subscription?.plan
      ? { name: business.subscription.plan.name, maxPalettes: business.subscription.plan.maxPalettes }
      : null,
    override: parseIds(business.allowedPalettesJson),
    effective: effective.palettes.map((p) => p.id),
    source: effective.source,
    library,
  });
});

/**
 * PUT /api/admin/businesses/[id]/palettes — set or clear the per-customer list.
 * Body: { paletteIds: string[] } — an empty array clears the override and the
 * customer falls back to their plan's allowance.
 */
export const PUT = route(async (req: Request, { params }: Params) => {
  const admin = await requireAdmin(req);
  const { id } = await params;

  const business = await db.business.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!business) throw new HttpError("Business not found", 404);

  const body = await readJson<{ paletteIds?: unknown }>(req);
  if (!Array.isArray(body.paletteIds)) throw new HttpError("paletteIds must be a list");

  const requested = body.paletteIds.filter((v): v is string => typeof v === "string").slice(0, 200);

  // Only ids that exist and are offered to businesses are stored, so a stale or
  // mistyped id cannot silently shrink the customer's picker to nothing.
  const library = await listPalettes({ scope: "BUSINESS" });
  const known = new Set(library.map((p) => p.id));
  const valid = requested.filter((pid) => known.has(pid));
  if (requested.length && !valid.length) throw new HttpError("None of those palettes exist");

  await db.business.update({
    where: { id },
    data: { allowedPalettesJson: valid.length ? JSON.stringify(valid) : "" },
  });

  await audit({
    actor: admin.id,
    action: valid.length ? "BUSINESS_PALETTES_SET" : "BUSINESS_PALETTES_CLEARED",
    entity: "business",
    entityId: id,
    meta: { name: business.name, count: valid.length },
  });

  const effective = await palettesForBusiness(id);
  return ok({ override: valid, effective: effective.palettes.map((p) => p.id), source: effective.source });
});

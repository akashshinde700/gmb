import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, route } from "@/lib/api";
import { listPalettes, palettesForBusiness } from "@/lib/palette-store";

/**
 * GET /api/palettes?scope=business|platform — palettes offered in the pickers.
 *
 * Public, because the onboarding wizard needs them before a business exists.
 * For a signed-in customer the list is narrowed to what their plan (or an
 * admin's per-customer override) allows, and the same rule is what the write
 * endpoints ultimately rely on.
 */
export const GET = route(async (req: Request) => {
  const raw = (new URL(req.url).searchParams.get("scope") || "").toUpperCase();

  if (raw === "PLATFORM") {
    return ok({ palettes: await listPalettes({ scope: "PLATFORM" }) });
  }

  const session = await getSessionUser(req);
  const business = session
    ? await db.business.findUnique({ where: { userId: session.id }, select: { id: true } })
    : null;

  const result = await palettesForBusiness(business?.id);
  return ok({
    palettes: result.palettes,
    // The picker uses these to explain why some palettes are missing.
    total: result.total,
    limit: result.limit,
    source: result.source,
  });
});

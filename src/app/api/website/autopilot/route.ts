import { db } from "@/lib/db";
import { parseJson } from "@/lib/sections";
import { serializeWebsite } from "@/lib/serialize";
import { runAutopilotFor } from "@/lib/autopilot";
import type { SiteTheme } from "@/lib/types";
import { HttpError, ok, readJson, requireBusiness, requireUser, route } from "@/lib/api";

/**
 * GET  /api/website/autopilot — is it on, when it last ran, what it did.
 * POST /api/website/autopilot — switch it off/on, or run a pass now.
 *
 * Autopilot is the platform maintaining a published site on its own: re-checking
 * the quality score, applying the structural fixes (a switched-off section, a
 * missing About or contact block, the page title and description) and leaving a
 * short report. It never touches the owner's copy, photos or colours, and it
 * never runs on a draft — a site the owner has not published is a site they are
 * still working on.
 */
export const GET = route(async (req: Request) => {
  const session = await requireUser(req);
  const business = await requireBusiness(session);
  const website = business.website;
  if (!website) throw new HttpError("Website not found", 404);
  const theme = parseJson<Partial<SiteTheme>>(website.themeJson, {});
  return ok({
    enabled: theme.autopilot?.enabled !== false,
    lastRunAt: theme.autopilot?.lastRunAt ?? null,
    lastChanged: theme.autopilot?.lastChanged ?? [],
    lastScore: theme.autopilot?.lastScore ?? theme.quality?.score ?? null,
    published: business.status === "PUBLISHED",
  });
});

export const POST = route(async (req: Request) => {
  const session = await requireUser(req);
  const business = await requireBusiness(session);
  const website = business.website;
  if (!website) throw new HttpError("Website not found", 404);

  const body = await readJson<{ enabled?: boolean; run?: boolean }>(req);
  const theme = parseJson<Partial<SiteTheme>>(website.themeJson, {});

  if (typeof body.enabled === "boolean" && body.run !== true) {
    const updated = await db.website.update({
      where: { id: website.id },
      data: {
        themeJson: JSON.stringify({
          ...theme,
          autopilot: { ...(theme.autopilot ?? {}), enabled: body.enabled },
        }),
      },
    });
    return ok({ enabled: body.enabled, website: serializeWebsite(updated) });
  }

  // A pass on demand. The sweep in lib/autopilot.ts is the same code the
  // scheduler runs, so a manual run cannot behave differently from an automatic
  // one — which is the only way "run now" is worth trusting.
  const result = await runAutopilotFor(business.id);
  if (!result) throw new HttpError("Website not found", 404);
  const fresh = await db.website.findUnique({ where: { id: website.id } });
  return ok({
    result,
    website: fresh ? serializeWebsite(fresh) : null,
  });
});

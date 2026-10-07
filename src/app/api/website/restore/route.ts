import { db } from "@/lib/db";
import { serializeWebsite } from "@/lib/serialize";
import { recordVersion, versionState } from "@/lib/site-history";
import { HttpError, ok, readJson, requireBusiness, requireUser, route, str } from "@/lib/api";

/**
 * POST /api/website/restore — put the site back to one of its versions.
 *
 * Append-only: restoring writes the old state as a *new* version, so going back
 * is itself undoable and the history stays a record of what actually happened
 * rather than a stack that can be popped twice by accident.
 */
export const POST = route(async (req: Request) => {
  const session = await requireUser(req);
  const business = await requireBusiness(session);
  const website = business.website;
  if (!website) throw new HttpError("Website not found", 404);

  const body = await readJson<{ versionId?: string }>(req);
  const versionId = str(body.versionId, 60);
  if (!versionId) throw new HttpError("Which version should we restore?");

  const state = await versionState(website.id, versionId);
  if (!state) throw new HttpError("That version is no longer available", 404);

  const updated = await db.website.update({
    where: { id: website.id },
    data: {
      themeJson: state.themeJson,
      sectionsJson: state.sectionsJson,
      seoTitle: state.seoTitle,
      seoDescription: state.seoDescription,
      keywords: state.keywords,
      version: { increment: 1 },
    },
  });

  await recordVersion({
    website: updated,
    label: `Restored to “${state.label}”`,
    actor: business.ownerName || "Owner",
  });

  return ok({ restored: state.label, website: serializeWebsite(updated) });
});

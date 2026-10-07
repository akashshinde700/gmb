import { listVersions } from "@/lib/site-history";
import { HttpError, ok, requireBusiness, requireUser, route } from "@/lib/api";

/**
 * GET /api/website/history — every version of this site, newest first.
 *
 * The states themselves are not sent: the list is for the owner to read, and a
 * version is restored by id (see /api/website/restore). Eight snapshots of a
 * full page would make this response bigger than the site.
 */
export const GET = route(async (req: Request) => {
  const session = await requireUser(req);
  const business = await requireBusiness(session);
  if (!business.website) throw new HttpError("Website not found", 404);

  const versions = await listVersions(business.website.id);
  return ok({ versions, currentVersion: business.website.version });
});

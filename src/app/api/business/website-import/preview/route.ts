import { extractWebsiteImport, fetchSite, parseSiteUrl, websiteImportSummary } from "@/lib/site-import";
import { HttpError, ok, readJson, requireUser, route, str } from "@/lib/api";

/**
 * POST /api/business/website-import/preview — read a page for the signup wizard.
 *
 * The wizard runs before any business exists, so there is nothing to apply to
 * yet and nothing is written: this returns what the page says, and the wizard
 * puts it in the form the owner is already filling in. Same reader, same rules —
 * only facts that are actually on the page, and a list of what was not found.
 */
export const POST = route(async (req: Request) => {
  await requireUser(req);
  const body = await readJson<{ url?: string }>(req);
  const input = str(body.url, 600).trim();
  if (!input) throw new HttpError("Paste the address of your current website");

  let parsed;
  try {
    parsed = parseSiteUrl(input);
  } catch (error) {
    throw new HttpError((error as Error).message || "That does not look like a website address", 422);
  }

  let page;
  try {
    page = await fetchSite(parsed.url);
  } catch (error) {
    throw new HttpError((error as Error).message || "That website could not be read", 502);
  }

  const imported = extractWebsiteImport(page.html, page.url);
  return ok({
    url: page.url,
    followed: page.hops.length,
    title: imported.title,
    summary: websiteImportSummary(imported),
    missing: imported.missing,
    via: imported.via,
    found: {
      name: imported.name,
      tagline: imported.tagline,
      description: imported.description,
      phone: imported.phone,
      whatsapp: imported.whatsapp,
      email: imported.email,
      address: imported.address,
      city: imported.city,
      state: imported.state,
      pincode: imported.pincode,
      logoUrl: imported.logoUrl,
      hours: imported.hours,
    },
    services: imported.services,
    faqs: imported.faqs.length,
    photos: imported.images.length,
  });
});

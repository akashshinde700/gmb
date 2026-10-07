import { db } from "@/lib/db";
import { HttpError, limitSubjectOrThrow, ok, requireBusiness, requireUser, route } from "@/lib/api";
import { parseJson } from "@/lib/sections";
import { resolveIndustry } from "@/lib/industries";
import { variantsFor } from "@/lib/variants";
import { fetchStockPhotos, searchesFor, stockImagesConfigured } from "@/lib/stock-images";
import type { SiteSection, SiteTheme } from "@/lib/types";

export const runtime = "nodejs";

/**
 * POST /api/gallery/stock — add six photos of this business's trade to the
 * gallery. If the site has no cover yet, the first photo becomes the cover
 * and fills the hero and About images that are still empty.
 */
export const POST = route(async (req: Request) => {
  const session = await requireUser(req);
  const business = await requireBusiness(session);
  if (!stockImagesConfigured()) throw new HttpError("The photo library is switched off. Please upload your own photos.", 503);
  limitSubjectOrThrow(`stock:${business.id}`, 3, 60 * 60 * 1000);

  const theme = parseJson<Partial<SiteTheme>>(business.website?.themeJson, {});
  const preset = resolveIndustry(business.category, theme.industry);
  // What this shop actually sells, not what its trade group is called: asking
  // for the preset's "shop" handed a jeweller photographs of other people's
  // shops. Their own description narrows it further.
  const searches = searchesFor({
    category: business.category,
    description: business.description,
    curated: [...variantsFor(preset.key).imageQueries, preset.imageQuery],
  });
  // Each press moves one page further so it never re-adds the same photos.
  const existing = await db.galleryItem.count({ where: { businessId: business.id } });
  const photos = await fetchStockPhotos(
    searches[0],
    6,
    Math.floor(existing / 6) + 2,
    searches.slice(1),
    `${business.slug}:${existing}`,
  );
  if (!photos.length) throw new HttpError("Could not fetch photos right now — please try again in a minute.", 502);

  const last = await db.galleryItem.findFirst({ where: { businessId: business.id }, orderBy: { sortOrder: "desc" } });
  const base = last?.sortOrder ?? 0;
  await db.galleryItem.createMany({
    data: photos.map((p, i) => ({ businessId: business.id, url: p.url, alt: p.alt, caption: "", sortOrder: base + i + 1 })),
  });

  let coverSet = false;
  if (!business.coverUrl) {
    const cover = photos[0].url;
    await db.business.update({ where: { id: business.id }, data: { coverUrl: cover } });
    coverSet = true;
    if (business.website) {
      const sections = parseJson<SiteSection[]>(business.website.sectionsJson, []).map((s) =>
        (s.type === "hero" || s.type === "about") && !String(s.content?.image ?? "").trim()
          ? { ...s, content: { ...s.content, image: s.type === "about" ? photos[1]?.url ?? cover : cover } }
          : s,
      );
      await db.website.update({
        where: { businessId: business.id },
        data: { sectionsJson: JSON.stringify(sections), version: { increment: 1 } },
      });
    }
  }

  return ok({ added: photos.length, coverSet }, 201);
});

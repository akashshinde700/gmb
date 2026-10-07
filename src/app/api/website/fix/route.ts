import { db } from "@/lib/db";
import { parseJson } from "@/lib/sections";
import { serializeWebsite } from "@/lib/serialize";
import { checkSite, type QualityReport } from "@/lib/site-quality";
import { applyFixes } from "@/lib/site-fixes";
import type { SiteSection, SiteTheme } from "@/lib/types";
import { HttpError, ok, requireBusiness, requireUser, route } from "@/lib/api";

/**
 * POST /api/website/fix — apply every issue the quality checker can fix itself.
 *
 * The checker is what makes the generator trustworthy, but a score with no way
 * to act on it is just nagging. This runs the same checks on the stored site,
 * applies the structural fixes (a missing section, a hidden one, the page title
 * and search description built from the owner's own details), re-checks, and
 * returns both reports so the dashboard can show what changed and what is left
 * for the owner to answer.
 *
 * Safe to press twice: the second press finds nothing to do. Nothing about the
 * business's own facts is ever invented — see lib/site-fixes.ts for the split.
 */
export const POST = route(async (req: Request) => {
  const session = await requireUser(req);
  const business = await requireBusiness(session);
  const website = business.website;
  if (!website) throw new HttpError("Website not found", 404);

  const theme = parseJson<Partial<SiteTheme>>(website.themeJson, {});
  const sections = parseJson<SiteSection[]>(website.sectionsJson, []);
  const services = await db.service.findMany({
    where: { businessId: business.id },
    select: { name: true, description: true },
  });
  const [galleryCount, faqCount, testimonialCount] = await Promise.all([
    db.galleryItem.count({ where: { businessId: business.id } }),
    db.faq.count({ where: { businessId: business.id } }),
    db.testimonial.count({ where: { businessId: business.id } }),
  ]);

  const shared = {
    sections,
    theme,
    colors: {
      primary: business.brandPrimary,
      secondary: business.brandSecondary,
      accent: business.brandAccent,
    },
    business: {
      name: business.name,
      phone: business.phone,
      whatsapp: business.whatsapp,
      email: business.email,
      city: business.city,
      address: business.address,
      description: business.description,
      hours: business.hoursJson,
    },
    services,
    galleryCount,
    faqCount,
    testimonialCount,
    uniqueness: theme.uniqueness,
  };

  const before = checkSite({ ...shared, seoTitle: website.seoTitle, seoDescription: website.seoDescription });

  const goal = theme.dna?.goal
    ? {
        primary: theme.dna.goal.primary,
        secondary: theme.dna.goal.secondary,
        action: theme.dna.goal.action,
      }
    : null;

  const fixed = applyFixes(
    {
      sections,
      seoTitle: website.seoTitle,
      seoDescription: website.seoDescription,
      business: {
        name: business.name,
        category: business.category,
        city: business.city,
        phone: business.phone,
        services: services.map((s) => s.name),
        mapsUrl: business.mapsUrl,
      },
      goal,
    },
    before,
  );

  const after: QualityReport = checkSite({
    ...shared,
    sections: fixed.sections,
    seoTitle: fixed.seoTitle,
    seoDescription: fixed.seoDescription,
  });

  // One write: sections, SEO copy and the fresh report. Nothing else is touched,
  // so an owner's own edits are never undone by pressing the button.
  const updated = await db.website.update({
    where: { id: website.id },
    data: {
      sectionsJson: JSON.stringify(fixed.sections),
      seoTitle: fixed.seoTitle,
      seoDescription: fixed.seoDescription,
      themeJson: JSON.stringify({ ...theme, quality: after }),
      version: { increment: 1 },
    },
  });

  return ok({
    changed: fixed.changed,
    before,
    after,
    website: serializeWebsite(updated),
  });
});

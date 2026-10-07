// WebSetu — Autopilot.
//
// A website that is published and then forgotten is the normal outcome for a
// small business: the owner is busy running the shop. Autopilot is the platform
// doing the maintenance itself — re-checking every live site on a schedule,
// fixing what can be fixed without asking anybody anything, and leaving a
// short report of what it did. The owner's own words, photos and colours are
// never touched.
//
// Everything it applies is one of the four structural fixes the quality checker
// already marks as fixable, so this file decides *when* to act, not *what* is
// safe: that judgement lives in lib/site-quality.ts and lib/site-fixes.ts.

import { db } from "@/lib/db";
import { parseJson } from "@/lib/sections";
import { checkSite } from "@/lib/site-quality";
import { applyFixes } from "@/lib/site-fixes";
import { recordVersion } from "@/lib/site-history";
import type { SiteSection, SiteTheme } from "@/lib/types";

export interface AutopilotResult {
  slug: string;
  name: string;
  /** What the site scored before and after this run. */
  before: number;
  after: number;
  changed: string[];
  /** True when the site was already clean, or nothing it can fix was found. */
  skipped: boolean;
}

/**
 * One pass over one site.
 *
 * Reads everything the checker needs straight from the database — the site, its
 * services, gallery, FAQs, reviews — so a scheduled run needs no session and no
 * request context.
 */
export async function runAutopilotFor(businessId: string): Promise<AutopilotResult | null> {
  const business = await db.business.findUnique({
    where: { id: businessId },
    include: {
      website: true,
      services: { select: { name: true, description: true } },
    },
  });
  if (!business?.website) return null;

  const website = business.website;
  const theme = parseJson<Partial<SiteTheme>>(website.themeJson, {});
  const sections = parseJson<SiteSection[]>(website.sectionsJson, []);
  const [galleryCount, faqCount, testimonialCount] = await Promise.all([
    db.galleryItem.count({ where: { businessId } }),
    db.faq.count({ where: { businessId } }),
    db.testimonial.count({ where: { businessId } }),
  ]);

  const input = {
    sections,
    theme,
    colors: { primary: business.brandPrimary, secondary: business.brandSecondary, accent: business.brandAccent },
    business: {
      name: business.name, phone: business.phone, whatsapp: business.whatsapp, email: business.email,
      city: business.city, address: business.address, description: business.description, hours: business.hoursJson,
    },
    services: business.services,
    galleryCount,
    faqCount,
    testimonialCount,
    uniqueness: theme.uniqueness,
  };

  const report = checkSite({ ...input, seoTitle: website.seoTitle, seoDescription: website.seoDescription });
  const fixable = report.issues.filter((i) => i.fix);
  const result: AutopilotResult = {
    slug: business.slug,
    name: business.name,
    before: report.score,
    after: report.score,
    changed: [],
    skipped: true,
  };
  if (!fixable.length) return result;

  const fixed = applyFixes(
    {
      sections,
      seoTitle: website.seoTitle,
      seoDescription: website.seoDescription,
      business: {
        name: business.name, category: business.category, city: business.city,
        phone: business.phone, services: business.services.map((s) => s.name), mapsUrl: business.mapsUrl,
      },
      goal: theme.dna?.goal
        ? { primary: theme.dna.goal.primary, secondary: theme.dna.goal.secondary, action: theme.dna.goal.action }
        : null,
    },
    report,
  );
  if (!fixed.changed.length) return result;

  const after = checkSite({
    ...input,
    sections: fixed.sections,
    seoTitle: fixed.seoTitle,
    seoDescription: fixed.seoDescription,
  });

  const updated = await db.website.update({
    where: { id: website.id },
    data: {
      sectionsJson: JSON.stringify(fixed.sections),
      seoTitle: fixed.seoTitle,
      seoDescription: fixed.seoDescription,
      themeJson: JSON.stringify({
        ...theme,
        quality: after,
        autopilot: {
          ...(theme.autopilot ?? {}),
          enabled: theme.autopilot?.enabled !== false,
          lastRunAt: new Date().toISOString(),
          lastChanged: fixed.changed,
          lastScore: after.score,
        },
      }),
      version: { increment: 1 },
    },
  });

  // A version before reporting, so the owner can undo anything Autopilot did.
  await recordVersion({ website: updated, label: `Autopilot: ${fixed.changed[0]}`, actor: "Autopilot" });

  result.after = after.score;
  result.changed = fixed.changed;
  result.skipped = false;
  return result;
}

/**
 * A pass over every published site that has Autopilot switched on.
 *
 * Drafts are skipped: a site the owner has not published is a site they are
 * still working on, and changing it under them would be the opposite of help.
 */
export async function runAutopilotSweep(limit = 50): Promise<{ ran: number; results: AutopilotResult[] }> {
  const businesses = await db.business.findMany({
    where: { status: "PUBLISHED", website: { isNot: null } },
    select: { id: true, website: { select: { themeJson: true } } },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });

  const results: AutopilotResult[] = [];
  for (const business of businesses) {
    const theme = parseJson<{ autopilot?: { enabled?: boolean } }>(business.website?.themeJson ?? "{}", {});
    if (theme.autopilot?.enabled === false) continue;
    try {
      const result = await runAutopilotFor(business.id);
      if (result) results.push(result);
    } catch (e) {
      // One broken site must not stop the sweep for everybody else.
      console.error(`[autopilot] ${business.id} failed:`, e instanceof Error ? e.message : e);
    }
  }
  return { ran: businesses.length, results };
}

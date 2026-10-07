import { db } from "@/lib/db";
import { recordVersion } from "@/lib/site-history";
import { parseJson } from "@/lib/sections";
import { serializeWebsite } from "@/lib/serialize";
import { checkSite } from "@/lib/site-quality";
import { interpretRestyle, restyledPlan, restyledTokens, restyleSummary, RESTYLES } from "@/lib/restyle";
import { motionLabel } from "@/lib/design-dna";
import { consumeThemeChange } from "@/lib/appearance";
import type { SiteSection, SiteTheme } from "@/lib/types";
import { HttpError, ok, readJson, requireBusiness, requireUser, route, str } from "@/lib/api";

/**
 * POST /api/website/restyle — "make my website more premium".
 *
 * Changes the design language, not the content: type, corners, shadows,
 * buttons, spacing, header, footer, image treatment, the motion pack and which
 * arrangement each section uses. The owner's own words, photos and colours are
 * untouched — they chose the colours in the wizard, and a design request is not
 * a request to have them changed.
 *
 * Deterministic on purpose (see lib/restyle.ts): the same sentence on the same
 * site always produces the same design, so a customer can repeat a request and
 * understand the answer.
 */
export const POST = route(async (req: Request) => {
  const session = await requireUser(req);
  const business = await requireBusiness(session);
  const website = business.website;
  if (!website) throw new HttpError("Website not found", 404);

  const body = await readJson<{ text?: string }>(req);
  const said = str(body.text, 160).trim();
  if (!said) throw new HttpError("Tell us what to change, for example \"make it more premium\"");

  const intent = interpretRestyle(said);
  if (!intent) {
    throw new HttpError(
      `We do not know that one yet. Try: ${RESTYLES.slice(0, 4).map((r) => `"${r.label.toLowerCase()}"`).join(", ")}.`,
      422,
    );
  }

  // A restyle is a design change, so it spends the same allowance as one made by
  // hand in the Theme panel — the plan is what the customer is paying for.
  await consumeThemeChange(business.id);

  const theme = parseJson<Partial<SiteTheme>>(website.themeJson, {});
  const sections = parseJson<SiteSection[]>(website.sectionsJson, []);
  const dna = theme.dna;
  if (!dna || !theme.motion) {
    throw new HttpError("This site has no design genome yet — regenerate it and try again.", 409);
  }

  const before = {
    font: theme.font ?? "modern",
    radius: theme.radius ?? "rounded",
    cardStyle: theme.cardStyle ?? "shadow",
    shadow: theme.shadow ?? "soft",
    button: theme.button ?? "solid",
    spacing: theme.spacing ?? "normal",
    header: theme.header ?? "sticky",
    footer: theme.footer ?? "columned",
    imageTreatment: theme.imageTreatment ?? "plain",
    styleName: dna.styleName,
  };
  const after = restyledTokens(before, intent);
  const beforePlan = dna.sectionPlan ?? [];
  const types = sections.map((s) => s.type);
  const afterPlan = restyledPlan(dna.seed ?? business.slug, types, intent);
  const motion = intent.motion;

  // Section arrangements are the one part of the page the generator owns inside
  // the content, so they are rewritten here; every other key is left alone.
  const planByType = new Map(afterPlan.map((c) => [c.type, c.variant]));
  const nextSections = sections.map((s) =>
    planByType.has(s.type) ? { ...s, content: { ...s.content, variant: planByType.get(s.type) } } : s,
  );

  const nextTheme: Partial<SiteTheme> = {
    ...theme,
    font: after.font,
    radius: after.radius,
    cardStyle: after.cardStyle,
    shadow: after.shadow,
    button: after.button,
    spacing: after.spacing,
    header: after.header,
    footer: after.footer,
    imageTreatment: after.imageTreatment,
    motion,
    // The tokens themselves live on the theme (that is what the renderer reads);
    // the genome keeps the name, the motion and the new arrangement.
    dna: { ...dna, styleName: after.styleName, motionLabel: motionLabel(motion.pack), sectionPlan: afterPlan },
    // The theme the rest of the page reads (CSS variables, image filters) comes
    // from these keys, so a restyle is visible immediately, before any rebuild.
  };

  const quality = checkSite({
    sections: nextSections,
    theme: nextTheme,
    colors: { primary: business.brandPrimary, secondary: business.brandSecondary, accent: business.brandAccent },
    seoTitle: website.seoTitle,
    seoDescription: website.seoDescription,
    business: {
      name: business.name, phone: business.phone, whatsapp: business.whatsapp, email: business.email,
      city: business.city, address: business.address, description: business.description, hours: business.hoursJson,
    },
    services: await db.service.findMany({ where: { businessId: business.id }, select: { name: true, description: true } }),
    galleryCount: await db.galleryItem.count({ where: { businessId: business.id } }),
    faqCount: await db.faq.count({ where: { businessId: business.id } }),
    testimonialCount: await db.testimonial.count({ where: { businessId: business.id } }),
    uniqueness: theme.uniqueness,
  });

  const updated = await db.website.update({
    where: { id: website.id },
    data: {
      themeJson: JSON.stringify({ ...nextTheme, quality }),
      sectionsJson: JSON.stringify(nextSections),
      version: { increment: 1 },
    },
  });

  await recordVersion({ website: updated, label: `Made it ${intent.label.toLowerCase()}`, actor: business.ownerName || "Owner" });

  return ok({
    intent: { id: intent.id, label: intent.label, note: intent.note },
    changed: restyleSummary(before, after, beforePlan, afterPlan),
    quality,
    website: serializeWebsite(updated),
  });
});

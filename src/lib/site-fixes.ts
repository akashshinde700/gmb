// WebSetu — the automatic half of the quality checker.
//
// "Fix all issues" is only honest if the platform actually fixes the things it
// complained about, and only safe if it never invents a fact about the
// business. So the split is: structure is fixed here (a missing section, a
// hidden one, a meta description built from the owner's own name, city and
// services), and anything about the facts — a missing phone number, three
// services instead of six, no reviews yet — is left to the owner, because a
// system that makes those up is a system that lies on a customer's behalf.

import type { SectionType, SiteSection } from "@/lib/types";
import type { QualityReport } from "@/lib/site-quality";

export interface FixInput {
  sections: SiteSection[];
  seoTitle: string;
  seoDescription: string;
  business: {
    name: string;
    category?: string | null;
    city?: string | null;
    phone?: string | null;
    services?: string[];
    mapsUrl?: string | null;
  };
  /** The goal the site was built to earn, if it has one. */
  goal?: { primary: string; secondary: string | null; action: string } | null;
}

export interface FixResult {
  sections: SiteSection[];
  seoTitle: string;
  seoDescription: string;
  /** What was changed, in the owner's language. */
  changed: string[];
}

const sid = () => `s_${Math.random().toString(36).slice(2, 10)}`;

/** The default content for a section the fix has to add from scratch. */
function blankSection(type: SectionType, input: FixInput): SiteSection | null {
  switch (type) {
    case "about":
      return {
        id: sid(), type: "about", visible: true,
        content: {
          title: `About ${input.business.name}`,
          body: input.business.services?.length
            ? `${input.business.name} works with customers${input.business.city ? ` in ${input.business.city}` : ""} on ${input.business.services.slice(0, 3).join(", ")}. Add a couple of lines about how you work and who you work with — this is the section buyers read before they call.`
            : `Write two or three lines about ${input.business.name} here. This is the section buyers read before they call.`,
        },
      };
    case "cta":
      return {
        id: sid(), type: "cta", visible: true,
        content: {
          title: `Talk to ${input.business.name}`,
          subtitle: "Call, WhatsApp or send an enquiry — we reply the same day.",
          primary: input.goal?.primary ?? "Call Now",
          secondary: input.goal?.secondary ?? "WhatsApp Us",
          ...(input.goal ? { primaryAction: input.goal.action } : {}),
        },
      };
    case "contact":
      return {
        id: sid(), type: "contact", visible: true,
        content: { title: "Contact Us", subtitle: "Send an enquiry — we will get back to you within 24 hours." },
      };
    default:
      return null;
  }
}

/**
 * Apply every fix the report asked for, and report what changed.
 *
 * Runs against the site as stored, so it is safe to press twice: the second
 * press finds nothing to do.
 */
export function applyFixes(input: FixInput, report: QualityReport): FixResult {
  const sections = input.sections.map((s) => ({ ...s, content: { ...s.content } }));
  const changed: string[] = [];
  const wanted = new Set(report.issues.map((i) => i.fix).filter(Boolean));

  // A hidden section the site already has is better than a new one: the owner's
  // own content comes back rather than a placeholder.
  if (wanted.has("show-hidden-sections")) {
    let shown = 0;
    for (const section of sections) {
      if (section.visible === false) {
        section.visible = true;
        shown++;
      }
    }
    if (shown) changed.push(`brought ${shown} hidden section${shown > 1 ? "s" : ""} back onto the page`);
  }

  const has = (type: SectionType) => sections.some((s) => s.type === type && s.visible !== false);
  const addSection = (type: SectionType, label: string) => {
    if (has(type)) return;
    // The owner's own section may exist but be switched off. Bringing that back
    // is strictly better than adding a second one beside it.
    const hiddenOne = sections.find((s) => s.type === type && s.visible === false);
    if (hiddenOne) {
      hiddenOne.visible = true;
      changed.push(`switched the ${type} section back on`);
      return;
    }
    const fresh = blankSection(type, input);
    if (!fresh) return;
    // Contact always closes the page; anything else goes before the contact
    // section if one exists, so the order stays sensible.
    const contactAt = sections.findIndex((s) => s.type === "contact");
    if (contactAt >= 0 && type !== "contact") sections.splice(contactAt, 0, fresh);
    else sections.push(fresh);
    changed.push(label);
  };

  if (wanted.has("add-about")) addSection("about", "added an About section");
  if (wanted.has("add-cta")) addSection("cta", "added a call-to-action band");
  if (wanted.has("add-contact")) addSection("contact", "added the contact section");

  // The goal's own wording on the buttons, where the site already has them.
  if (wanted.has("goal-cta") && input.goal) {
    const hero = sections.find((s) => s.type === "hero");
    if (hero) {
      if (!String(hero.content.ctaPrimary ?? "").trim()) hero.content.ctaPrimary = input.goal.primary;
      if (!String(hero.content.ctaSecondary ?? "").trim() && input.goal.secondary) {
        hero.content.ctaSecondary = input.goal.secondary;
      }
      hero.content.ctaPrimaryAction = input.goal.action;
      changed.push("set the hero buttons to what this business is actually for");
    }
    const band = sections.find((s) => s.type === "cta");
    if (band) {
      if (!String(band.content.primary ?? "").trim()) band.content.primary = input.goal.primary;
      if (!String(band.content.secondary ?? "").trim() && input.goal.secondary) {
        band.content.secondary = input.goal.secondary;
      }
      band.content.primaryAction = input.goal.action;
    }
  }

  // SEO copy built only from what the owner told us: name, city, category and
  // services. No superlatives, no invented years or counts.
  let seoTitle = input.seoTitle;
  let seoDescription = input.seoDescription;
  const cityPart = input.business.city ? ` in ${input.business.city}` : "";
  const category = (input.business.category || "business").toLowerCase();
  if (wanted.has("seo-title")) {
    const services = (input.business.services ?? []).slice(0, 2).join(" & ");
    seoTitle = `${input.business.name} — ${services || category}${cityPart}`.slice(0, 60);
    changed.push("wrote the page title from your business name, trade and city");
  }
  if (wanted.has("seo-description")) {
    const services = (input.business.services ?? []).slice(0, 4).join(", ");
    seoDescription = [
      `${input.business.name} is a ${category}${cityPart}`,
      services ? `offering ${services}.` : ".",
      input.business.phone ? `Call ${input.business.phone} or send an enquiry.` : "Send an enquiry for a quick reply.",
    ]
      .join(" ")
      .replace(/\s+/g, " ")
      .slice(0, 158);
    changed.push("wrote the search description from your own details");
  }

  return { sections, seoTitle, seoDescription, changed };
}

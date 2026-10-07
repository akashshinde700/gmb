// WebSetu — the quality checker.
//
// A generator that never checks its own output ships sites with unreadable
// gold-on-white headings, three service cards where the trade has six, and a
// heading that repeats the business name four times. Every one of those is
// cheap to detect without a model, and detecting them is what makes it safe to
// let the generator choose layouts freely instead of hand-holding it with a
// handful of pre-approved templates.
//
// This runs on the site that was actually written, not on the inputs, so it
// catches mistakes from any source — the genome, the owner's own text, or the
// model's copy. A model is never asked whether its own output is good; that is
// the whole point.
//
// The result is stored on the theme (`quality`) and shown to the owner as a
// score broken down by dimension, with the issues spelled out. Anything the
// platform can fix without inventing a fact about the business carries a `fix`
// id and is applied by "Fix all issues" (see lib/site-fixes.ts) — the rest is
// left to the person who actually knows the answer.

import type { SiteSection, SiteTheme } from "@/lib/types";

/**
 * The eight scores the dashboard shows. Split this way because that is how a
 * non-technical owner thinks about a website: is it well designed, does it work
 * on a phone, will it be found, can someone use it, is it fast, does it say
 * enough, does it bring enquiries, and is it unlike everyone else's.
 */
export type QualityDimension =
  | "design"
  | "mobile"
  | "seo"
  | "accessibility"
  | "performance"
  | "content"
  | "conversion"
  | "uniqueness";

export type FixId =
  | "add-about"
  | "add-cta"
  | "add-contact"
  | "goal-cta"
  | "seo-title"
  | "seo-description"
  | "show-hidden-sections";

export interface QualityIssue {
  /** Which part of the site it is about. */
  area: "colour" | "content" | "seo" | "structure" | "conversion";
  /** Which score it comes off. */
  dimension: QualityDimension;
  /** What is wrong, in the owner's language, with the fix they can make. */
  message: string;
  /** Points deducted. */
  penalty: number;
  /**
   * Set when the platform can apply this fix itself. Issues about the facts of
   * the business (a missing phone number, an unwritten service) never carry one.
   */
  fix?: FixId;
}

export interface QualityReport {
  score: number;
  /** Per-dimension scores, 0–100. */
  dimensions: Record<QualityDimension, number>;
  issues: QualityIssue[];
  checkedAt: string;
}

/* -------------------------------------------------------------- contrast */

function rgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex: string): number | null {
  const c = rgb(hex);
  if (!c) return null;
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colours; null when either is unparseable. */
export function contrastRatio(a: string, b: string): number | null {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/* ---------------------------------------------------------------- checks */

export interface QualityInput {
  sections: readonly SiteSection[];
  theme: Partial<SiteTheme>;
  colors: { primary: string; secondary: string; accent: string };
  seoTitle?: string;
  seoDescription?: string;
  business: {
    name?: string; phone?: string; whatsapp?: string; email?: string;
    city?: string; address?: string; description?: string; hours?: unknown;
  };
  services: readonly { name: string; description?: string }[];
  galleryCount?: number;
  faqCount?: number;
  testimonialCount?: number;
  /** Measured against the same-trade sites; absent when it has not been run. */
  uniqueness?: number;
}

/**
 * Score a generated site out of 100 and list what is wrong with it.
 *
 * The overall score is 100 minus what the issues cost, and each dimension is
 * 100 minus what *its* issues cost — so a site can be "web-ready" overall and
 * still show its owner that the SEO is the weak part. Penalties are weighted by
 * what costs a real customer money: an unreadable headline or a page with no way
 * to make contact is worth far more than a short meta description.
 */
export function checkSite(input: QualityInput): QualityReport {
  const issues: QualityIssue[] = [];
  const add = (
    area: QualityIssue["area"],
    dimension: QualityDimension,
    message: string,
    penalty: number,
    fix?: FixId,
  ) => issues.push({ area, dimension, message, penalty, ...(fix ? { fix } : {}) });

  const visible = input.sections.filter((s) => s.visible !== false);
  const types = new Set(visible.map((s) => s.type));
  const hero = input.sections.find((s) => s.type === "hero");
  const heading = String(hero?.content?.heading ?? "").trim();
  const subheading = String(hero?.content?.subheading ?? "").trim();
  const genome = input.theme.dna;

  /* --- accessibility: can everyone read this? ---------------------------- */
  const onWhite = contrastRatio(input.colors.secondary, "#ffffff");
  if (onWhite !== null && onWhite < 3) {
    add("colour", "accessibility", "The dark brand colour is too light for text — headings will be hard to read.", 10);
  }
  const primaryOnWhite = contrastRatio(input.colors.primary, "#ffffff");
  if (primaryOnWhite !== null && primaryOnWhite < 2.5) {
    add("colour", "accessibility", "The main brand colour is very light; buttons and links may not stand out on white.", 6);
  }
  const accentText = contrastRatio(input.colors.accent, "#1c1917");
  if (accentText !== null && accentText < 2) {
    add("colour", "accessibility", "Accent buttons will be hard to read — the accent is too close to the text colour.", 5);
  }
  if (!heading) add("content", "accessibility", "The hero has no headline, so the page opens with nothing to read.", 15);
  // Only the sections a reader expects to be introduced: a stats strip or a
  // payment block is content in its own right and carries no heading by design.
  const NEEDS_HEADING = ["about", "whyUs", "faq", "contact", "cta"];
  const untitled = visible.filter((s) => {
    const c = s.content ?? {};
    return NEEDS_HEADING.includes(s.type) && !(c.title || c.heading || c.question || c.body);
  });
  if (untitled.length) {
    add("content", "accessibility", `${untitled.length} section(s) have no heading — a screen reader announces them as nothing.`, 4);
  }

  /* --- content: enough to be worth visiting, not so much it is untrue ---- */
  if (!subheading) {
    add("content", "content", "The hero has no sentence under the headline explaining what you offer.", 6, "goal-cta");
  }
  if (input.services.length < 3) {
    add("content", "content", "Fewer than three services listed — customers cannot tell what you actually do.", 12);
  }
  const described = input.services.filter((s) => (s.description || "").trim().length > 12).length;
  if (input.services.length && described < Math.ceil(input.services.length / 2)) {
    add("content", "content", "Most services have no description — one line each makes them much easier to choose between.", 6);
  }
  if ((input.testimonialCount ?? 0) === 0) {
    add("content", "content", "No customer reviews yet — even two or three make a page far more believable.", 6);
  }
  if ((input.faqCount ?? 0) < 4) {
    add("content", "content", "Fewer than four FAQs. These are what answer engines quote from.", 6);
  }

  /* --- design: is there a design at all? -------------------------------- */
  if (!genome) {
    add("structure", "design", "This site was built before the design engine and has no genome — regenerating it will give it its own palette, type and layout.", 10);
  } else {
    const plan = (genome.sectionPlan ?? []).length;
    if (plan < Math.min(8, visible.length)) {
      add("structure", "design", "Only part of this site follows a planned layout — regenerate to rebuild it from the genome.", 5);
    }
    if (!input.theme.motion) {
      add("structure", "design", "The animation pack is missing, so the page falls back to the default motion.", 3);
    }
  }
  if (visible.length < 6) add("structure", "design", "The page has very few sections — it will look unfinished.", 10, "show-hidden-sections");
  // A section that is switched off still counts as missing to a visitor, and it
  // is the cheapest thing in the whole report to put right.
  const hidden = input.sections.filter((s) => s.visible === false).map((s) => s.type);
  if (hidden.length) {
    add(
      "structure",
      "design",
      `${hidden.length} section(s) are switched off: ${hidden.join(", ")} — the page is showing less than it has.`,
      3 * Math.min(3, hidden.length),
      "show-hidden-sections",
    );
  }
  if (!types.has("about")) add("structure", "design", "There is no About section.", 8, "add-about");
  if ((input.galleryCount ?? 0) < 3) {
    add("structure", "design", "Fewer than three photos in the gallery — photos are what customers look at first.", 5);
  }

  /* --- mobile: what breaks in a hand ------------------------------------ */
  if (heading.length > 70 && heading.length <= 90) {
    add("content", "mobile", "The headline is long — on a phone it will take four or five lines before the button.", 4);
  }
  if (heading.length > 90) add("content", "mobile", "The hero headline is long enough to be cut off on a phone.", 5);
  const longTitles = visible.filter((s) => String((s.content ?? {}).title ?? "").length > 60);
  if (longTitles.length) add("content", "mobile", `${longTitles.length} section heading(s) are long enough to wrap awkwardly on a phone.`, 4);
  if (visible.length > 18) add("structure", "mobile", "The page is very long on a phone — consider hiding a section or two.", 5, "show-hidden-sections");
  if ((input.galleryCount ?? 0) > 12) add("structure", "mobile", "More than twelve gallery photos is a lot to load and scroll on a phone.", 4);

  /* --- performance: what the visitor's phone has to do ------------------ */
  if (visible.length > 16) add("structure", "performance", "Sixteen-plus sections means a heavy first load; the middle of the page could be trimmed.", 5);
  if ((input.galleryCount ?? 0) > 10) add("structure", "performance", "A large gallery is the heaviest part of this page.", 3);
  const motionLevel = input.theme.motion?.level ?? 0;
  if (motionLevel >= 3) add("structure", "performance", "The animation is set to its most expressive setting; phones will drop frames on older devices.", 3);

  /* --- conversion: can a visitor actually reach this business? ---------- */
  const reachable = Boolean(input.business.phone || input.business.whatsapp || input.business.email);
  if (!reachable) {
    add("conversion", "conversion", "No phone number, WhatsApp or email — there is no way to contact you.", 20);
  }
  if (!input.business.whatsapp && input.business.phone) {
    add("conversion", "conversion", "The phone number is there but no WhatsApp — most buyers in this market message first.", 4);
  }
  if (!types.has("contact")) add("conversion", "conversion", "There is no contact form on the page.", 8, "add-contact");
  const heroCta = Boolean(String(hero?.content?.ctaPrimary ?? "").trim());
  if (!types.has("cta") && !heroCta) {
    add("conversion", "conversion", "No call to action anywhere — visitors are not asked to do anything.", 12, "add-cta");
  }
  if (!input.business.city) add("conversion", "conversion", "No city set — local search results will be weaker.", 5);
  if (!types.has("hours") && input.business.hours) {
    add("structure", "conversion", "Opening hours were filled in but no hours section is shown.", 4, "show-hidden-sections");
  }

  /* --- SEO: what shows up in a search result ---------------------------- */
  const title = (input.seoTitle || "").trim();
  if (title.length < 20) {
    add("seo", "seo", "The page title is too short to describe the business in search results.", 6, "seo-title");
  }
  if (title.length > 65) add("seo", "seo", "The page title is long enough to be cut off in Google.", 3, "seo-title");
  const desc = (input.seoDescription || "").trim();
  if (desc.length < 70) {
    add("seo", "seo", "The search description is short — aim for 120–160 characters.", 5, "seo-description");
  }
  if (desc.length > 170) add("seo", "seo", "The search description is long enough to be cut off.", 2, "seo-description");
  const bodyText = visible
    .flatMap((s) => Object.values(s.content ?? {}).filter((v): v is string => typeof v === "string"))
    .join(" ")
    .trim();
  if (bodyText.length < 400) {
    add("seo", "seo", "There is very little text on the page for search engines to read.", 8);
  }

  /* --- uniqueness: is it like every other site in the trade? ------------ */
  if (typeof input.uniqueness === "number" && input.uniqueness < 55) {
    add("content", "uniqueness", "This site is close to another one in the same trade — a regenerate will draw a different design.", 8);
  }

  const dimensions: Record<QualityDimension, number> = {
    design: 100, mobile: 100, seo: 100, accessibility: 100,
    performance: 100, content: 100, conversion: 100, uniqueness: 100,
  };
  for (const issue of issues) {
    dimensions[issue.dimension] = Math.max(0, dimensions[issue.dimension] - issue.penalty);
  }

  const score = Math.max(0, Math.min(100, 100 - issues.reduce((n, i) => n + i.penalty, 0)));
  return { score, dimensions, issues, checkedAt: new Date().toISOString() };
}

/** One-line summary for the dashboard card. */
export function qualityLabel(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 60) return "Needs a little work";
  return "Needs attention";
}

/** The eight dimension labels, in the order the dashboard shows them. */
export const QUALITY_DIMENSIONS: { key: QualityDimension; label: string }[] = [
  { key: "design", label: "Design" },
  { key: "mobile", label: "Mobile" },
  { key: "seo", label: "SEO" },
  { key: "accessibility", label: "Accessibility" },
  { key: "performance", label: "Performance" },
  { key: "content", label: "Content" },
  { key: "conversion", label: "Conversion" },
  { key: "uniqueness", label: "Uniqueness" },
];

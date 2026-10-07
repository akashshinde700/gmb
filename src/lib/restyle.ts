// WebSetu — "make my website better".
//
// An owner should not have to learn a design tool to say that their site feels
// cheap. They say it in words — "make it more premium", "simple, my customers
// are older" — and the design language changes: type, corners, shadows,
// spacing, buttons, headers, how the images are treated, how much the page
// moves, and which arrangement each section uses.
//
// Two rules make this safe:
//
//   1. It never touches the owner's own words, photos or colours. The copy is
//      theirs, the palette was their choice in the wizard, and both survive a
//      restyle untouched. Only the design decisions the generator owns move.
//   2. It is deterministic, so the same request on the same site always produces
//      the same result and a restyle can be explained afterwards ("type is now
//      elegant, corners rounded, spacing airy…").

import type { SectionType } from "@/lib/types";
import { sectionPlanFor, type DesignTokens, type MotionDna, type SectionChoice } from "@/lib/design-dna";

export interface RestyleIntent {
  id: string;
  /** What the dashboard calls this change. */
  label: string;
  /** How the owner asks for it. */
  keywords: string[];
  design: Partial<Omit<DesignTokens, "styleName">>;
  motion: MotionDna;
  /** Arrangements this direction prefers, per section. */
  variantBias: Partial<Record<SectionType, string[]>>;
  /** One line explaining what changed and why. */
  note: string;
}

/**
 * The directions the product supports.
 *
 * Ordered: the first intent whose keywords appear in the request wins, so the
 * more specific asks ("premium") sit above the broad ones ("better").
 */
export const RESTYLES: RestyleIntent[] = [
  {
    id: "premium",
    label: "More premium",
    keywords: ["premium", "luxury", "luxurious", "expensive", "high end", "high-end", "upscale", "rich", "5 lakh", "five lakh", "classy", "elegant", "sophisticated", "exclusive"],
    design: { font: "elegant", radius: "rounded", shadow: "lifted", button: "solid", spacing: "airy", imageTreatment: "soft-focus", header: "centred", footer: "statement" },
    motion: { pack: "premium", level: 3 },
    variantBias: { hero: ["editorial", "centred"], gallery: ["masonry"], testimonials: ["spotlight"], stats: ["band"], about: ["timeline"], cta: ["split"] },
    note: "Elegant type, more air around every block, softer shadows and a slower, more deliberate animation — the same content, presented as a considered brand rather than a leaflet.",
  },
  {
    id: "simple",
    label: "Simpler and cleaner",
    keywords: ["simple", "simpler", "clean", "cleaner", "minimal", "minimalist", "less busy", "declutter", "plain", "quiet", "calm", "softer", "subtle"],
    design: { font: "modern", radius: "sharp", shadow: "none", button: "outline", spacing: "airy", imageTreatment: "plain", header: "minimal", footer: "compact" },
    motion: { pack: "minimal", level: 1 },
    variantBias: { hero: ["centred"], gallery: ["grid"], testimonials: ["cards"], stats: ["row"], about: ["split"], cta: ["band"], faq: ["list"] },
    note: "Flat surfaces, no shadows, one clear column and almost no movement — nothing competes with the content.",
  },
  {
    id: "professional",
    label: "More professional",
    keywords: ["professional", "corporate", "trust", "trustworthy", "credible", "formal", "serious", "business like", "business-like", "enterprise", "official"],
    design: { font: "modern", radius: "rounded", shadow: "soft", button: "solid", spacing: "normal", imageTreatment: "plain", header: "topbar", footer: "columned" },
    motion: { pack: "corporate", level: 2 },
    variantBias: { hero: ["split", "banner"], whyUs: ["numbered"], about: ["timeline"], testimonials: ["wall"], stats: ["band"], cta: ["split"] },
    note: "A top bar with the business name, numbered reasons to choose you, and a review wall — the shape of a company that has done this before, without inventing anything about it.",
  },
  {
    id: "friendly",
    label: "Warmer and friendlier",
    keywords: ["friendly", "warm", "welcoming", "approachable", "personal", "family", "homely", "cheerful", "happy"],
    design: { radius: "pill", shadow: "soft", button: "soft", spacing: "normal", imageTreatment: "framed", header: "sticky", footer: "compact" },
    motion: { pack: "playful", level: 3 },
    variantBias: { hero: ["split", "centred"], testimonials: ["cards"], gallery: ["filmstrip"], stats: ["cards"], whyUs: ["cards"] },
    note: "Rounder corners, softer buttons and warmer imagery — the page feels like people rather than a template.",
  },
  {
    id: "bold",
    label: "Bolder and more dramatic",
    keywords: ["bold", "dramatic", "striking", "strong", "powerful", "impact", "loud", "stand out", "eye catching", "eye-catching", "modern"],
    design: { font: "modern", radius: "sharp", shadow: "dramatic", button: "gradient", spacing: "normal", imageTreatment: "duotone", header: "sticky", footer: "statement" },
    motion: { pack: "modern", level: 3 },
    variantBias: { hero: ["editorial", "banner"], stats: ["cards"], gallery: ["filmstrip"], cta: ["band"], whyUs: ["bento"] },
    note: "Heavier headline type, deep shadows and duotone artwork — the page makes an entrance instead of waiting to be read.",
  },
  {
    id: "easy",
    label: "Easier to read",
    keywords: ["older", "senior", "elderly", "easy to read", "readable", "simple for", "accessible", "clear text", "bigger text", "large text", "grandparents", "age"],
    design: { font: "classic", radius: "rounded", shadow: "soft", button: "solid", spacing: "airy", imageTreatment: "plain", header: "sticky", footer: "compact" },
    motion: { pack: "minimal", level: 0 },
    variantBias: { hero: ["centred"], services: ["list"], gallery: ["grid"], testimonials: ["cards"], faq: ["list"], contact: ["form-below"] },
    note: "Classic type, everything full width and in one column, no movement at all — built for someone reading it on a phone with glasses on.",
  },
  {
    id: "youthful",
    label: "Younger and more colourful",
    keywords: ["young", "younger", "playful", "fun", "colourful", "colorful", "vibrant", "energetic", "trendy", "gen z", "students", "kids", "children"],
    design: { font: "modern", radius: "pill", shadow: "lifted", button: "soft", spacing: "normal", imageTreatment: "duotone", header: "sticky", footer: "statement" },
    motion: { pack: "playful", level: 4 },
    variantBias: { hero: ["split"], stats: ["cards"], gallery: ["filmstrip"], testimonials: ["cards"], whyUs: ["bento"], cta: ["band"] },
    note: "Rounder, brighter and quicker — the page moves a little more and reads a little lighter.",
  },
];

/**
 * What the owner asked for.
 *
 * Deliberately not an LLM call: this runs in a request that must always
 * succeed, it costs nothing, and a design change the owner cannot reproduce by
 * asking again would be worse than no feature at all. Free text the catalogue
 * does not cover returns null and the dashboard says so, rather than applying a
 * change the owner did not ask for.
 */
export function interpretRestyle(text: string): RestyleIntent | null {
  const said = (text || "").toLowerCase();
  if (!said.trim()) return null;
  for (const intent of RESTYLES) {
    if (intent.keywords.some((k) => said.includes(k))) return intent;
  }
  return null;
}

/** The design tokens after a restyle: the intent's choices over the current ones. */
export function restyledTokens(current: DesignTokens, intent: RestyleIntent): DesignTokens {
  return {
    ...current,
    ...intent.design,
    // The name carries the direction the owner asked for, because "More
    // premium" is easier to recognise three months later than an adjective a
    // stranger chose. The original direction stays as the tail, and older
    // labels are dropped: three restyles must not leave a paragraph of history
    // in the one field that names the design.
    styleName: styleNameAfter(current.styleName, intent),
  };
}

/** The section plan after a restyle: the preferred arrangement where one exists. */
export function restyledPlan(seed: string, types: readonly SectionType[], intent: RestyleIntent): SectionChoice[] {
  const drawn = sectionPlanFor(seed, types);
  return drawn.map((choice) => {
    const preferred = intent.variantBias[choice.type];
    if (!preferred?.length) return choice;
    // Keep the drawn arrangement when it already matches the direction, so a
    // restyle does not shuffle sections it was not asked to change.
    return preferred.includes(choice.variant) ? choice : { type: choice.type, variant: preferred[0] };
  });
}

/**
 * The name of the design after this restyle: the requested direction, then the
 * original style it was applied to. Asking for "premium" twice keeps one label.
 */
function styleNameAfter(current: string, intent: RestyleIntent): string {
  const base = current.split(" · ").pop()?.trim() || current;
  if (base === intent.label) return base;
  return `${intent.label} · ${base}`.slice(0, 60);
}

/**
 * The lines the dashboard shows under "what changed" — the specific decisions
 * that moved, so a restyle is a report rather than a mystery.
 */
export function restyleSummary(
  before: DesignTokens,
  after: DesignTokens,
  beforePlan: SectionChoice[],
  afterPlan: SectionChoice[],
): string[] {
  const changed: string[] = [];
  const say = (label: string, from: string, to: string) => {
    if (from !== to) changed.push(`${label}: ${from} → ${to}`);
  };
  say("Type", before.font, after.font);
  say("Corners", before.radius, after.radius);
  say("Shadows", before.shadow, after.shadow);
  say("Buttons", before.button, after.button);
  say("Spacing", before.spacing, after.spacing);
  say("Header", before.header, after.header);
  say("Footer", before.footer, after.footer);
  say("Images", before.imageTreatment, after.imageTreatment);
  const rearranged = afterPlan.filter((c) => beforePlan.find((b) => b.type === c.type)?.variant !== c.variant).length;
  if (rearranged) changed.push(`${rearranged} section${rearranged > 1 ? "s" : ""} laid out differently`);
  return changed;
}

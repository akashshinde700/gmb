// WebSetu — the Design DNA.
//
// The question this answers is not "which template?" but "what is this
// business, and therefore what should its website be?". A category is far too
// coarse an input: two dentists are not the same business — one is a family
// clinic two streets from a school, the other is an implant practice in a
// business district, and their sites should not be interchangeable.
//
// So the input is a small profile (business type, audience, personality,
// positioning) and the output is a genome:
//
//   Business DNA   → sub-type, audience, personality, positioning, tone
//   Design DNA     → colours, typography, corners, shadows, buttons, cards,
//                    spacing, header, footer, image treatment
//   Motion DNA     → an animation pack and an intensity level 0–4
//   Section DNA    → the running order AND which variant of each section
//
// Everything is derived from one seed with independent streams, so:
//   - two businesses in one trade get different genomes (the seed differs)
//   - one business never reshuffles (the seed is stable, no randomness)
//   - the same genome reproduces the same site on server and client
//
// Nothing here calls a model. The AI, when a key is configured, is what fills
// the *content*; the design is planned deterministically from what the owner
// typed, which keeps signup fast, free, and impossible to fail on a bad
// network. A model may later choose the profile (see `profileHints`), and the
// plan below will simply take those values as its input.

import type { SectionType } from "@/lib/types";
import { rng, seedFrom } from "@/lib/variants";

/* ------------------------------------------------------------------ types */

export type FontChoice = "modern" | "classic" | "elegant";
export type RadiusChoice = "sharp" | "rounded" | "pill";
export type CardChoice = "flat" | "shadow" | "outline";
export type ShadowChoice = "none" | "soft" | "lifted" | "dramatic";
export type ButtonChoice = "solid" | "outline" | "soft" | "gradient" | "square";
export type SpacingChoice = "tight" | "normal" | "airy";
export type HeaderChoice = "sticky" | "minimal" | "topbar" | "centred";
export type FooterChoice = "columned" | "compact" | "statement";
export type ImageTreatment = "plain" | "duotone" | "framed" | "soft-focus";
export type MotionPack = "minimal" | "corporate" | "modern" | "premium" | "playful";
export type MotionLevel = 0 | 1 | 2 | 3 | 4;

export interface BusinessDna {
  industry: string;
  /** Business type within the trade — a clinic vs a hospital, a café vs a dhaba. */
  subType: string;
  audience: string;
  personality: string;
  positioning: string;
  tone: string;
}

export interface DesignTokens {
  /** Human-readable direction, shown to the owner ("Premium editorial"). */
  styleName: string;
  font: FontChoice;
  radius: RadiusChoice;
  cardStyle: CardChoice;
  shadow: ShadowChoice;
  button: ButtonChoice;
  spacing: SpacingChoice;
  header: HeaderChoice;
  footer: FooterChoice;
  imageTreatment: ImageTreatment;
}

export interface MotionDna {
  pack: MotionPack;
  /** 0 = almost still, 4 = expressive. Rendered as `data-anim`. */
  level: MotionLevel;
}

export interface SectionChoice {
  type: SectionType;
  /** Which arrangement of that section — see SECTION_VARIANTS. */
  variant: string;
}

export interface DesignDna {
  seed: string;
  business: BusinessDna;
  design: DesignTokens;
  motion: MotionDna;
  sectionPlan: SectionChoice[];
}

/* -------------------------------------------------------------- profiles */

interface ProfileOption {
  key: string;
  label: string;
  audience: string;
  personality: string;
  positioning: string;
  tone: string;
}

/**
 * Business types per trade, with the audience and positioning each implies.
 *
 * Three per trade is deliberate: it is the smallest number that guarantees a
 * real choice (family clinic / cosmetic clinic / multi-speciality hospital)
 * without pretending to know a business better than its owner does. Everything
 * here seeds *defaults* — the owner's own description overrides the profile
 * when it clearly matches a different sub-type (see `profileHints`).
 */
const SUB_TYPES: Record<string, ProfileOption[]> = {
  "real-estate": [
    { key: "agency", label: "Estate agency", audience: "families buying their first home", personality: "trusted", positioning: "value", tone: "reassuring" },
    { key: "developer", label: "Builder & developer", audience: "investors and home buyers", personality: "expert", positioning: "mid-premium", tone: "confident" },
    { key: "rentals", label: "Rentals & PG", audience: "students and working professionals", personality: "helpful", positioning: "budget", tone: "friendly" },
  ],
  healthcare: [
    { key: "clinic", label: "Family clinic", audience: "local families", personality: "trusted", positioning: "value", tone: "reassuring" },
    { key: "cosmetic", label: "Cosmetic & skin clinic", audience: "patients choosing a specialist", personality: "expert", positioning: "premium", tone: "precise" },
    { key: "hospital", label: "Multi-speciality hospital", audience: "patients and referring doctors", personality: "expert", positioning: "mid-premium", tone: "authoritative" },
  ],
  dental: [
    { key: "family", label: "Family dental clinic", audience: "families with children", personality: "warm", positioning: "value", tone: "friendly" },
    { key: "implant", label: "Implant & cosmetic dentistry", audience: "adults comparing specialists", personality: "expert", positioning: "premium", tone: "precise" },
    { key: "ortho", label: "Orthodontics & braces", audience: "teenagers and their parents", personality: "playful", positioning: "mid-premium", tone: "encouraging" },
  ],
  restaurant: [
    { key: "family", label: "Family restaurant", audience: "families eating out", personality: "warm", positioning: "value", tone: "welcoming" },
    { key: "cafe", label: "Café & bakery", audience: "young regulars and students", personality: "playful", positioning: "mid-premium", tone: "casual" },
    { key: "fine", label: "Fine dining", audience: "diners marking an occasion", personality: "serene", positioning: "luxury", tone: "elegant" },
  ],
  hotel: [
    { key: "budget", label: "Budget stay & lodge", audience: "travellers passing through", personality: "helpful", positioning: "budget", tone: "plain" },
    { key: "business", label: "Business hotel", audience: "working travellers", personality: "expert", positioning: "mid-premium", tone: "professional" },
    { key: "resort", label: "Resort & homestay", audience: "families and couples on holiday", personality: "serene", positioning: "premium", tone: "warm" },
  ],
  fitness: [
    { key: "gym", label: "Neighbourhood gym", audience: "locals starting out", personality: "bold", positioning: "value", tone: "motivating" },
    { key: "strength", label: "Strength & CrossFit box", audience: "serious lifters", personality: "bold", positioning: "mid-premium", tone: "direct" },
    { key: "studio", label: "Yoga & pilates studio", audience: "people managing stress and posture", personality: "serene", positioning: "mid-premium", tone: "calm" },
  ],
  beauty: [
    { key: "salon", label: "Unisex salon", audience: "walk-in neighbourhood clients", personality: "warm", positioning: "value", tone: "friendly" },
    { key: "bridal", label: "Bridal & makeup studio", audience: "brides and their families", personality: "expert", positioning: "premium", tone: "aspirational" },
    { key: "spa", label: "Spa & wellness", audience: "clients booking a treatment", personality: "serene", positioning: "luxury", tone: "calm" },
  ],
  transport: [
    { key: "packers", label: "Packers & movers", audience: "families relocating", personality: "trusted", positioning: "value", tone: "reassuring" },
    { key: "freight", label: "Freight & full-truck load", audience: "factories and traders", personality: "expert", positioning: "mid-premium", tone: "precise" },
    { key: "courier", label: "Courier & last-mile delivery", audience: "online sellers", personality: "helpful", positioning: "budget", tone: "plain" },
  ],
  "building-materials": [
    { key: "retail", label: "Retail counter", audience: "home builders and contractors", personality: "trusted", positioning: "value", tone: "plain" },
    { key: "wholesale", label: "Wholesale dealer", audience: "contractors buying in bulk", personality: "expert", positioning: "mid-premium", tone: "direct" },
    { key: "brand", label: "Brand showroom", audience: "architects and premium projects", personality: "expert", positioning: "premium", tone: "confident" },
  ],
  construction: [
    { key: "contractor", label: "Building contractor", audience: "owners building a house", personality: "trusted", positioning: "value", tone: "plain" },
    { key: "interiors", label: "Turnkey interiors", audience: "homeowners renovating", personality: "expert", positioning: "premium", tone: "aspirational" },
    { key: "infra", label: "Civil & infrastructure", audience: "commercial clients", personality: "expert", positioning: "mid-premium", tone: "authoritative" },
  ],
  manufacturing: [
    { key: "workshop", label: "Workshop & fabrication", audience: "local buyers", personality: "trusted", positioning: "value", tone: "plain" },
    { key: "factory", label: "Factory & bulk supply", audience: "procurement teams", personality: "expert", positioning: "mid-premium", tone: "precise" },
    { key: "export", label: "Export house", audience: "overseas buyers", personality: "expert", positioning: "premium", tone: "professional" },
  ],
  education: [
    { key: "tuition", label: "Tuition classes", audience: "school students and parents", personality: "warm", positioning: "value", tone: "encouraging" },
    { key: "coaching", label: "Competitive coaching", audience: "exam aspirants", personality: "bold", positioning: "mid-premium", tone: "motivating" },
    { key: "institute", label: "Institute & college", audience: "students and their parents", personality: "expert", positioning: "premium", tone: "authoritative" },
  ],
  professional: [
    { key: "ca", label: "CA & tax practice", audience: "small business owners", personality: "expert", positioning: "value", tone: "precise" },
    { key: "law", label: "Law practice", audience: "individuals and companies", personality: "trusted", positioning: "mid-premium", tone: "authoritative" },
    { key: "consulting", label: "Business consulting", audience: "growing companies", personality: "expert", positioning: "premium", tone: "confident" },
  ],
  tech: [
    { key: "services", label: "Software services", audience: "startups and SMEs", personality: "expert", positioning: "mid-premium", tone: "plain" },
    { key: "product", label: "Product & SaaS", audience: "business teams", personality: "bold", positioning: "premium", tone: "confident" },
    { key: "agency", label: "Digital agency", audience: "brands marketing online", personality: "playful", positioning: "mid-premium", tone: "casual" },
  ],
  automotive: [
    { key: "garage", label: "Garage & repair", audience: "car owners nearby", personality: "trusted", positioning: "value", tone: "plain" },
    { key: "detailing", label: "Detailing & car care", audience: "owners of premium cars", personality: "expert", positioning: "premium", tone: "confident" },
    { key: "dealer", label: "Used-car dealer", audience: "first-time and upgrade buyers", personality: "helpful", positioning: "mid-premium", tone: "friendly" },
  ],
  events: [
    { key: "photography", label: "Photography & films", audience: "couples and families", personality: "warm", positioning: "mid-premium", tone: "aspirational" },
    { key: "planning", label: "Wedding planning", audience: "families planning a wedding", personality: "expert", positioning: "premium", tone: "confident" },
    { key: "decor", label: "Decor & rentals", audience: "event hosts", personality: "playful", positioning: "value", tone: "friendly" },
  ],
  interior: [
    { key: "residential", label: "Home interiors", audience: "homeowners renovating", personality: "expert", positioning: "mid-premium", tone: "aspirational" },
    { key: "commercial", label: "Commercial fit-outs", audience: "offices and retail brands", personality: "expert", positioning: "premium", tone: "professional" },
    { key: "modular", label: "Modular kitchen & furniture", audience: "families upgrading a kitchen", personality: "warm", positioning: "value", tone: "friendly" },
  ],
  "home-services": [
    { key: "electrician", label: "Electrician", audience: "households with a fault", personality: "trusted", positioning: "value", tone: "plain" },
    { key: "plumbing", label: "Plumbing & water", audience: "homes and small offices", personality: "trusted", positioning: "value", tone: "plain" },
    { key: "amc", label: "AMC & maintenance", audience: "societies and offices", personality: "expert", positioning: "mid-premium", tone: "professional" },
  ],
  agriculture: [
    { key: "seeds", label: "Seeds & fertiliser", audience: "local farmers", personality: "trusted", positioning: "value", tone: "plain" },
    { key: "equipment", label: "Farm equipment", audience: "farmers and contractors", personality: "expert", positioning: "mid-premium", tone: "direct" },
    { key: "produce", label: "Produce trading", audience: "mandis and exporters", personality: "expert", positioning: "mid-premium", tone: "plain" },
  ],
  retail: [
    { key: "kirana", label: "Kirana & general store", audience: "the neighbourhood", personality: "warm", positioning: "value", tone: "friendly" },
    { key: "boutique", label: "Boutique & fashion", audience: "shoppers looking for something different", personality: "playful", positioning: "mid-premium", tone: "casual" },
    { key: "showroom", label: "Showroom & electronics", audience: "buyers comparing models", personality: "expert", positioning: "mid-premium", tone: "confident" },
  ],
  beverage: [
    { key: "water", label: "Packaged water plant", audience: "homes, offices and events", personality: "trusted", positioning: "value", tone: "plain" },
    { key: "brand", label: "Beverage brand", audience: "retail buyers", personality: "bold", positioning: "mid-premium", tone: "energetic" },
    { key: "supply", label: "Bulk supply", audience: "institutions and distributors", personality: "expert", positioning: "mid-premium", tone: "professional" },
  ],
  general: [
    { key: "service", label: "Local service", audience: "customers nearby", personality: "trusted", positioning: "value", tone: "plain" },
    { key: "specialist", label: "Specialist business", audience: "customers comparing options", personality: "expert", positioning: "mid-premium", tone: "confident" },
    { key: "premium", label: "Premium brand", audience: "customers choosing on quality", personality: "serene", positioning: "premium", tone: "elegant" },
  ],
};

/** Words that point to a specific sub-type, so the owner's own text decides. */
const SUB_TYPE_HINTS: Record<string, { match: RegExp; key: string }[]> = {
  "*": [
    { match: /\b(premium|luxury|boutique|exclusive|high[- ]end)\b/i, key: "••premium" },
    { match: /\b(budget|cheap|affordable|low[- ]cost)\b/i, key: "••value" },
  ],
};

/**
 * Pick the business profile.
 *
 * The sub-type is chosen deterministically, but a strong signal in the owner's
 * own description wins over the draw — someone who writes "we are a family
 * clinic" should not be shown a cosmetic-clinic design.
 */
export function profileFor(input: {
  seed: string;
  industryKey: string;
  description?: string;
}): BusinessDna {
  const options = SUB_TYPES[input.industryKey] ?? SUB_TYPES.general;
  const draw = rng(seedFrom(`${input.seed}::profile`));
  let picked = options[Math.floor(draw() * options.length) % options.length];

  const text = (input.description || "").toLowerCase();
  const wanted = new Set<string>();
  const hints = [...(SUB_TYPE_HINTS[input.industryKey] ?? []), ...SUB_TYPE_HINTS["*"]];
  for (const h of hints) if (h.match.test(text)) wanted.add(h.key);

  // A hint like "••premium" narrows to the most premium option of the trade.
  const levels = ["budget", "value", "mid-premium", "premium", "luxury"];
  if (wanted.has("••premium")) {
    picked = [...options].sort((a, b) => levels.indexOf(b.positioning) - levels.indexOf(a.positioning))[0];
  } else if (wanted.has("••value")) {
    picked = [...options].sort((a, b) => levels.indexOf(a.positioning) - levels.indexOf(b.positioning))[0];
  } else {
    // A direct mention of one of the trade's own types wins.
    const mentioned = options.find((o) => {
      const words = o.label.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3);
      return words.some((w) => text.includes(w));
    });
    if (mentioned) picked = mentioned;
  }

  return {
    industry: input.industryKey,
    subType: picked.label,
    audience: picked.audience,
    personality: picked.personality,
    positioning: picked.positioning,
    tone: picked.tone,
  };
}

/* ---------------------------------------------------------------- tokens */

const FONT_FOR_PERSONALITY: Record<string, FontChoice[]> = {
  trusted: ["modern", "classic", "elegant"],
  warm: ["classic", "modern", "elegant"],
  expert: ["modern", "classic", "elegant"],
  bold: ["modern", "elegant", "classic"],
  playful: ["modern", "classic", "elegant"],
  serene: ["elegant", "classic", "modern"],
  helpful: ["modern", "classic", "elegant"],
};

const SHADOWS: Record<ShadowChoice, string> = {
  none: "none",
  soft: "0 1px 2px rgba(15,23,42,.06), 0 1px 3px rgba(15,23,42,.08)",
  lifted: "0 8px 24px -12px rgba(15,23,42,.28)",
  dramatic: "0 24px 60px -20px rgba(15,23,42,.45)",
};

const RADIUS: Record<RadiusChoice, { sm: string; lg: string }> = {
  sharp: { sm: "2px", lg: "4px" },
  rounded: { sm: "10px", lg: "16px" },
  pill: { sm: "999px", lg: "24px" },
};

/** Section padding scale — "airy" is a real premium signal on Indian sites. */
const SPACING: Record<SpacingChoice, { section: string; gap: string }> = {
  tight: { section: "py-12 md:py-14", gap: "gap-4 md:gap-5" },
  normal: { section: "py-16 md:py-20", gap: "gap-6" },
  airy: { section: "py-20 md:py-28", gap: "gap-7 md:gap-9" },
};

const MOTION_PACKS: Record<MotionPack, { range: [MotionLevel, MotionLevel]; label: string }> = {
  minimal: { range: [0, 2], label: "Calm and almost still" },
  corporate: { range: [1, 3], label: "Clean, steady reveals" },
  modern: { range: [1, 4], label: "Moving gradients and reveals" },
  premium: { range: [2, 4], label: "Slow parallax and cinematic reveals" },
  playful: { range: [1, 4], label: "Bouncy, colourful movement" },
};

/**
 * The animation packs that suit one business, best first.
 *
 * This used to return a single pack per personality, which quietly made motion
 * the least personal dimension in the genome: every electrician and plumber in
 * the country carries the "trusted" personality, so every one of them got the
 * same pack at nearly the same intensity, and motion — a tenth of the
 * similarity score — was a constant. A personality sets the range of what is
 * acceptable, not one point in it. A trusted trade can be steady or it can be
 * brisk and modern; an expert can be corporate, modern, or quiet.
 */
function motionPacksFor(personality: string, positioning: string): MotionPack[] {
  if (personality === "playful") return ["playful", "modern", "corporate"];
  if (personality === "serene") return ["minimal", "premium", "corporate"];
  if (positioning === "luxury" || positioning === "premium") return ["premium", "minimal", "modern"];
  if (personality === "expert") return ["corporate", "modern", "minimal"];
  if (personality === "bold") return ["modern", "playful", "premium"];
  if (personality === "warm") return ["modern", "corporate", "playful"];
  return ["modern", "corporate", "minimal"];
}

/* ------------------------------------------------------- section variants */

/**
 * The arrangements each section can take. The renderer implements every name
 * listed here; `sectionPlan` picks one per business, so two sites in a trade do
 * not merely reorder the same blocks — the blocks themselves differ.
 */
/**
 * Plain-English names for the arrangements, used where the owner sees them
 * (the dashboard's design panel). The keys are `type:variant`, so a label
 * exists for every combination the generator can produce and none of the
 * renderer's internal names leak into the product.
 */
export const VARIANT_LABELS: Record<string, string> = {
  "hero:banner": "Banner — headline over a full-width photo",
  "hero:split": "Split — headline beside the photo",
  "hero:editorial": "Editorial — big type, quiet layout",
  "hero:centred": "Centred — everything on the centre line",
  "stats:row": "Row — figures across one line",
  "stats:cards": "Cards — each figure in its own card",
  "stats:band": "Band — figures on a coloured strip",
  "about:split": "Split — story beside a photo",
  "about:timeline": "Timeline — the story year by year",
  "about:bento": "Bento — story and facts in a grid",
  "services:cards": "Cards — services in a grid",
  "services:process": "Process — numbered steps",
  "services:list": "List — one service per row",
  "whyUs:cards": "Cards — reasons side by side",
  "whyUs:numbered": "Numbered — reasons in order",
  "whyUs:bento": "Bento — reasons in a mixed grid",
  "gallery:grid": "Grid — even photo grid",
  "gallery:masonry": "Masonry — staggered photo grid",
  "gallery:filmstrip": "Filmstrip — a scrollable strip of photos",
  "testimonials:cards": "Cards — reviews in a grid",
  "testimonials:wall": "Wall — reviews packed together",
  "testimonials:spotlight": "Spotlight — one review at a time",
  "faq:list": "List — questions stacked",
  "faq:two-col": "Two columns — questions side by side",
  "cta:band": "Band — a call to action across the page",
  "cta:split": "Split — the ask beside the buttons",
  "blog:cards": "Cards — latest articles in a grid",
  "blog:list": "List — articles one per row",
  "contact:form-side": "Form beside the details",
  "contact:form-below": "Details above, form below",
  "hours:cards": "Opening hours in cards",
  "payment:qr": "Payment QR and UPI",
  "products:cards": "Product catalogue in cards",
};

export const SECTION_VARIANTS: Partial<Record<SectionType, readonly string[]>> = {
  hero: ["banner", "split", "editorial", "centred"],
  stats: ["row", "cards", "band"],
  about: ["split", "timeline", "bento"],
  services: ["cards", "process", "list"],
  whyUs: ["cards", "numbered", "bento"],
  gallery: ["grid", "masonry", "filmstrip"],
  testimonials: ["cards", "wall", "spotlight"],
  faq: ["list", "two-col"],
  cta: ["band", "split"],
  blog: ["cards", "list"],
  // Single-arrangement sections stay out of the table on purpose: inventing a
  // second way to draw a payment QR would only make the page worse.
  contact: ["form-side", "form-below"],
  hours: ["cards"],
  payment: ["qr"],
  products: ["cards"],
};

/** Streams are independent so colours, order and motion never correlate. */
export function sectionPlanFor(seed: string, types: readonly SectionType[]): SectionChoice[] {
  const draw = rng(seedFrom(`${seed}::plan`));
  return types.map((type) => {
    const options = SECTION_VARIANTS[type];
    if (!options || options.length <= 1) return { type, variant: options?.[0] ?? "default" };
    return { type, variant: options[Math.floor(draw() * options.length) % options.length] };
  });
}

/* ------------------------------------------------------------------- DNA */

export interface DnaInput {
  name: string;
  city?: string;
  category: string;
  industryKey: string;
  description?: string;
  /** Sections this site will actually have, in the order the builder draws them. */
  sectionTypes: readonly SectionType[];
  /**
   * Changes which of several equally-good genomes a business gets. Used by the
   * uniqueness engine: the same business, asked for a different direction,
   * produces a different genome rather than a different copy.
   */
  attempt?: number;
}

export function designDnaFor(input: DnaInput): DesignDna {
  const attempt = input.attempt ?? 0;
  const seed = `${input.name.trim().toLowerCase()}|${(input.city || "").trim().toLowerCase()}|${input.category.trim().toLowerCase()}`;
  const variant = attempt ? `${seed}::alt${attempt}` : seed;

  const business = profileFor({ seed: variant, industryKey: input.industryKey, description: input.description });
  const draw = rng(seedFrom(`${variant}::design`));
  const drawMotion = rng(seedFrom(`${variant}::motion`));

  const positioning = business.positioning;
  const personality = business.personality;

  // Typography follows the personality; the second choice exists so two
  // business of the same personality and positioning still differ.
  const fonts = FONT_FOR_PERSONALITY[personality] ?? ["modern", "classic"];
  const font = fonts[Math.floor(draw() * fonts.length) % fonts.length];

  // Corners, shadows and spacing all restate the positioning rather than
  // fighting it: a budget counter gets sharp corners and no shadow, a luxury
  // studio gets the opposite. The draw only chooses within what fits.
  // The positioning sets the flavours a business draws from — everything in
  // these lists is a defensible choice for that tier, so the tier is never
  // contradicted, and the draw decides which of the defensible choices it is.
  // Two options per tier (what this was) meant half the trade matched on every
  // one of these tokens; three and four keep the tier and lose the uniformity.
  const premium = positioning === "premium" || positioning === "luxury";
  const budget = positioning === "budget" || positioning === "value";
  const drawFrom = <T,>(options: readonly T[]): T =>
    options[Math.floor(draw() * options.length) % options.length];
  const radius: RadiusChoice = drawFrom<RadiusChoice>(
    premium ? ["pill", "rounded", "sharp"] : budget ? ["sharp", "rounded", "pill"] : ["rounded", "pill", "sharp"],
  );
  const shadow: ShadowChoice = drawFrom<ShadowChoice>(
    premium ? ["dramatic", "lifted", "soft"] : budget ? ["none", "soft", "lifted"] : ["soft", "lifted", "dramatic"],
  );
  const cardStyle: CardChoice =
    shadow === "none" ? drawFrom<CardChoice>(["outline", "flat"]) : drawFrom<CardChoice>(["shadow", "outline", "flat"]);
  const spacing: SpacingChoice = drawFrom<SpacingChoice>(
    premium ? ["airy", "normal", "tight"] : budget ? ["tight", "normal", "airy"] : ["normal", "airy", "tight"],
  );
  const button: ButtonChoice = drawFrom<ButtonChoice>(
    premium
      ? ["outline", "soft", "solid", "square"]
      : ["solid", "gradient", "square", "outline"],
  );
  const header: HeaderChoice = drawFrom<HeaderChoice>(["sticky", "minimal", "topbar", "centred"]);
  const footer: FooterChoice = drawFrom<FooterChoice>(["columned", "compact", "statement"]);
  const imageTreatment: ImageTreatment = drawFrom<ImageTreatment>(
    premium ? ["framed", "soft-focus", "plain", "duotone"] : ["plain", "duotone", "framed", "soft-focus"],
  );

  const packs = motionPacksFor(personality, positioning);
  const pack = packs[Math.floor(drawMotion() * packs.length) % packs.length];
  const [lo, hi] = MOTION_PACKS[pack].range;
  const level = (lo + Math.floor(drawMotion() * (hi - lo + 1))) as MotionLevel;

  const styleName = styleNameFor(business, { font, radius, shadow, spacing });

  return {
    seed,
    business,
    design: {
      styleName,
      font,
      radius,
      cardStyle,
      shadow,
      button,
      spacing,
      header,
      footer,
      imageTreatment,
    },
    motion: { pack, level },
    sectionPlan: sectionPlanFor(variant, input.sectionTypes),
  };
}

/** A direction the owner can recognise in a list ("Premium editorial"). */
function styleNameFor(business: BusinessDna, tokens: Pick<DesignTokens, "font" | "radius" | "shadow" | "spacing">): string {
  const mood =
    business.positioning === "luxury" ? "Luxury" :
    business.positioning === "premium" ? "Premium" :
    business.positioning === "mid-premium" ? "Refined" :
    business.positioning === "budget" ? "Everyday" : "Trusted";
  const shape =
    tokens.font === "elegant" ? "editorial" :
    tokens.font === "classic" ? "classic" :
    tokens.radius === "sharp" ? "grid" :
    tokens.radius === "pill" ? "rounded" : "modern";
  return `${mood} ${shape}`;
}

/* -------------------------------------------------------------- rendering */

/** CSS values the renderer turns into `--brand-*` variables. */
export function motionLabel(pack: MotionPack): string {
  return MOTION_PACKS[pack].label;
}

export function cssFromDna(dna: DesignDna): Record<string, string> {
  const radius = RADIUS[dna.design.radius];
  const spacing = SPACING[dna.design.spacing];
  return {
    "--brand-radius": radius.sm,
    "--brand-radius-lg": radius.lg,
    "--brand-shadow": SHADOWS[dna.design.shadow],
    "--brand-section-pad": spacing.section,
    "--brand-gap": spacing.gap,
  };
}

export const DNA_TABLES = { SHADOWS, RADIUS, SPACING, MOTION_PACKS, SUB_TYPES };

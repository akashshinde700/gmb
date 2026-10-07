// WebSetu — the per-business design blueprint.
//
// One function answers "what does THIS business's website look like?", and both
// the wizard (for the live preview and the colours the customer sees) and the
// server (for the site it actually writes) call it. That single call site is the
// point of this file.
//
// It previously was two call sites that disagreed. The wizard set the brand
// colours to `preset.palette[0]` — one fixed palette per trade — and sent them
// to the API, where the server's own per-business palette was read *after* the
// client's values and therefore never used. Every real-estate customer in the
// country got the same charcoal-and-gold site, and the per-business variation
// that already existed in variants.ts could not be reached from the product.
//
// Everything here is derived from one seed built out of the business's name and
// city, so:
//   - two businesses in the same trade differ (seed differs)
//   - one business never reshuffles (seed is stable; no randomness)
//   - the wizard preview and the published site agree (same function, same seed)

import type { SectionType } from "@/lib/types";
import { industryFor, resolveIndustry, type IndustryPreset } from "@/lib/industries";
import { pick, rng, seedFrom, shuffle, variantsFor, type Palette } from "@/lib/variants";
import { designDnaFor, type DesignDna } from "@/lib/design-dna";
import { paletteSimilarity } from "@/lib/uniqueness";
import { directPageOrder, directorBrief, goalFor, type DirectorBrief, type GoalPlan } from "@/lib/director";

export interface BlueprintService {
  name: string;
  description: string;
  icon?: string;
}

export interface SiteBlueprint {
  /** The seed every choice below is drawn from. Stable for one business. */
  seed: string;
  industryKey: string;
  preset: IndustryPreset;
  /** The colours this business starts with. */
  palette: Palette;
  /**
   * Every palette that suits this trade — the rotation pool used to keep two
   * businesses in one trade off the same colours. Bigger than `paletteChoices`
   * on purpose: the picker stays a short, tidy row while the rotation can run
   * for a long time before it has to reuse anything.
   */
  palettePool: readonly Palette[];
  /**
   * Every palette that suits this trade, the business's own first. The colour
   * picker in the wizard shows exactly this list, so "change the colours"
   * offers trade-appropriate options rather than the whole rainbow.
   */
  paletteChoices: Palette[];
  /** Font/radius/card treatment — the "look", chosen per business. */
  look: { font: "modern" | "classic" | "elegant"; radius: "sharp" | "rounded" | "pill"; cardStyle: "flat" | "shadow" | "outline" };
  /** Index into the hero-scene variant list, so animations differ too. */
  heroVariant: number;
  /** The value promise the headline is built around. */
  promise: string;
  /** Services this business's site starts with, in its own order. */
  services: BlueprintService[];
  /** The whole trade list, offered in the wizard as pick-from suggestions. */
  suggestedServices: BlueprintService[];
  /** Stock-photo searches, most specific first. */
  imageQueries: string[];
  /** Running order for the middle of the page. */
  sectionOrder: readonly SectionType[];
  /**
   * What this site is for — the action it is built to earn — and the order of
   * the page that follows from it. A clinic and a manufacturer get different
   * goalseven when the layouts are drawn from the same library.
   */
  goal: GoalPlan;
  /**
   * The director's brief: the finished, readable plan behind the site, from the
   * business it understood to the animation it will use. Stored with the site
   * and shown to the owner.
   */
  brief: DirectorBrief;
  /**
   * The full genome behind this site — design tokens, motion, and which
   * arrangement of each section. `look`, `palette` and `sectionOrder` above are
   * the parts of it the older callers read; new callers should take the DNA.
   */
  dna: DesignDna;
}

/**
 * The seed for one business.
 *
 * Name + city, not the slug: the wizard has to be able to compute it before the
 * row exists (the slug is uniquified on the server and may gain a suffix), and
 * the server has to compute the same value. Name and city are the two things
 * both sides always have.
 */
export function designSeed(name: string, city = ""): string {
  return `${name.trim().toLowerCase()}|${city.trim().toLowerCase()}`;
}

/**
 * Order the trade's services by how much the owner's own description mentions
 * them.
 *
 * "We do bridal and temple jewellery, plus repairs" should open with Bridal
 * Collection, not with whatever order the preset happens to list. Matching is
 * plain word overlap — no model call, works offline — and it only reorders: a
 * service the description never mentions is still offered, because these are
 * suggestions the customer can delete, not a prediction.
 */
function scoreByDescription(services: BlueprintService[], description: string): BlueprintService[] {
  const words = new Set(
    description
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
  if (!words.size) return services;

  const score = (s: BlueprintService) => {
    const text = `${s.name} ${s.description}`.toLowerCase();
    let hits = 0;
    for (const w of words) if (text.includes(w)) hits++;
    return hits;
  };
  // Stable sort: equal scores keep their preset order.
  return [...services].sort((a, b) => score(b) - score(a));
}

const SECTION_ORDERS: readonly (readonly SectionType[])[] = [
  ["stats", "about", "services", "whyUs", "gallery", "testimonials", "faq", "blog", "cta", "payment", "hours"],
  ["about", "services", "stats", "gallery", "whyUs", "testimonials", "cta", "faq", "blog", "hours", "payment"],
  ["services", "about", "whyUs", "stats", "testimonials", "gallery", "cta", "blog", "faq", "payment", "hours"],
  ["about", "stats", "services", "testimonials", "whyUs", "cta", "gallery", "faq", "hours", "blog", "payment"],
  ["services", "stats", "whyUs", "about", "gallery", "cta", "testimonials", "faq", "payment", "blog", "hours"],
  ["about", "whyUs", "services", "gallery", "stats", "cta", "testimonials", "blog", "faq", "hours", "payment"],
  ["stats", "services", "about", "testimonials", "gallery", "whyUs", "faq", "cta", "blog", "payment", "hours"],
];

export interface BlueprintInput {
  /**
   * Palettes already taken by other businesses in this trade, as
   * `"primary,secondary,accent"` strings. Supplying them makes the drawn
   * palette step aside for a free one, so customers in a trade do not end up
   * on identical colours (which is exactly what was reported: two real-estate
   * sign-ups that looked the same). The customer's own choice always wins over
   * this — it only decides what we start them on.
   */
  taken?: readonly string[];
  name: string;
  city?: string;
  category: string;
  /** Preset key chosen explicitly (a trade the presets do not know). */
  industryKey?: string | null;
  /** The owner's own description — used to order the services. */
  description?: string;
  /** Services the customer picked or wrote in the wizard. */
  services?: BlueprintService[];
  /** Explicit seed, for callers that want a different axis (tests). */
  seed?: string;
  /**
   * Which of several equally-good genomes to use. The uniqueness engine asks
   * for a second or third direction when the first came out too close to a
   * site that already exists in the same trade.
   */
  attempt?: number;
}

/**
 * The section types a generated site is made of, in the order the builder
 * creates them. The DNA plans an arrangement for each; the builder then reads
 * the plan back by type, so a section added or removed later cannot shift the
 * variant every other section got.
 */
const DNA_SECTION_TYPES: readonly SectionType[] = [
  "hero", "stats", "about", "services", "products", "whyUs", "gallery",
  "testimonials", "faq", "blog", "cta", "payment", "hours", "contact",
];

/** Build the design blueprint for one business. Deterministic. */
export function blueprintFor(input: BlueprintInput): SiteBlueprint {
  const preset = resolveIndustry(input.category, input.industryKey);
  const variants = variantsFor(preset.key);
  const seed = input.seed || designSeed(input.name, input.city || "");

  // Independent streams: colours, layout, copy and order must not correlate.
  const drawPalette = rng(seedFrom(`${seed}::palette`));
  const drawOrder = rng(seedFrom(`${seed}::order`));
  const drawServices = rng(seedFrom(`${seed}::services`));

  // Everything visual comes from the genome: typography, corners, shadows,
  // buttons, spacing, header/footer, image treatment, motion, and which
  // arrangement each section takes. The blueprint adds what is specific to
  // *this* signup on top: the colours (which must dodge the trade's existing
  // sites) and the services (ranked by what the owner wrote).
  const dna = designDnaFor({
    name: input.name,
    city: input.city,
    category: input.category,
    industryKey: input.industryKey ?? preset.key,
    description: input.description,
    sectionTypes: DNA_SECTION_TYPES,
    attempt: input.attempt,
  });

  // The business's own palette first, then the rest of what suits the trade —
  // so the picker opens on this business's colours and every alternative beside
  // it is still appropriate for the trade.
  // The picker shows a short, trade-appropriate row rather than every palette
  // that exists: the trade's own colours first, then any Stitch-designed ones.
  const paletteChoices = [...variants.palettes].slice(0, 8);
  // The rotation pool is the whole trade list, so "this colour is taken" can be
  // answered for years of sign-ups before anything has to repeat.
  const palettePool = [...variants.palettes];
  const drawn = Math.floor(drawPalette() * paletteChoices.length) % paletteChoices.length;
  // Which palettes the trade is already using. "Already used" has to mean
  // "looks the same", not "is the same three hex codes": most palettes in the
  // shared list carry the same amber accent and a near-black secondary, so
  // exact matching let two businesses end up on pages that felt identical.
  const taken = (input.taken ?? []).map((t) => t.split(","));
  // A shortlist of six drawn from the business's own starting point, then the
  // least-similar one wins. Deterministic for a given database state, so a
  // re-generate does not shuffle a live site, and a business whose palette is
  // not close to anything keeps the palette it was drawn.
  const shortlist = Array.from(
    { length: Math.min(6, palettePool.length || 1) },
    (_, k) => palettePool[(drawn + k) % palettePool.length] ?? paletteChoices[drawn],
  );
  const closestTaken = (candidate: Palette) =>
    taken.reduce((worst, t) => Math.max(worst, paletteSimilarity(candidate, t)), 0);
  const palette = shortlist.reduce(
    (best, candidate) => (closestTaken(candidate) < closestTaken(best) - 0.001 ? candidate : best),
    shortlist[0],
  );

  // The whole trade list, ranked by what the owner actually wrote.
  const tradeServices: BlueprintService[] = preset.services.map((s) => ({
    name: s.name,
    description: s.description,
    icon: s.icon,
  }));
  const ranked = scoreByDescription(tradeServices, input.description || "");

  // Two businesses in one trade get different lists, not merely a different
  // order. The two services that best match what the owner wrote stay at the
  // top (that is what makes the list feel written for them); below that, one or
  // two of the trade's remaining services are dropped and the rest are shuffled,
  // so the list itself — not just its order — differs between customers.
  const keep = Math.min(6, ranked.length);
  const anchorCount = Math.min(2, ranked.length);
  const rest = ranked.slice(anchorCount);
  const dropCount = rest.length > 3 ? 1 + Math.floor(drawServices() * 2) : 0;
  const dropAt = new Set<number>();
  while (dropAt.size < Math.min(dropCount, rest.length - 1)) {
    dropAt.add(Math.floor(drawServices() * rest.length) % rest.length);
  }
  const chosen = [...ranked.slice(0, anchorCount), ...shuffle(drawServices, rest.filter((_, i) => !dropAt.has(i)))]
    .slice(0, keep);

  const services = (input.services?.length ? input.services : chosen).map((s) => ({
    ...s,
    icon: s.icon || preset.motif.icons[0] || "sparkles",
  }));

  // The director runs last, because its goal depends on the trade and on the
  // owner's own words, and its page order depends on the sections that were
  // drawn. Nothing here adds or removes a section: it decides what the page is
  // for and moves what matters for that goal nearer the top.
  const goal = goalFor({
    industryKey: preset.key,
    category: input.category ?? preset.label,
    description: input.description,
    services: services.map((sv) => sv.name),
  });
  const sectionOrder = directPageOrder(pick(drawOrder, SECTION_ORDERS), goal);
  const brief = directorBrief({
    name: input.name,
    city: input.city,
    business: dna.business,
    design: dna.design,
    motion: dna.motion,
    goal,
    plan: dna.sectionPlan,
    description: input.description,
  });

  return {
    seed,
    industryKey: preset.key,
    preset,
    palette,
    paletteChoices,
    palettePool,
    look: { font: dna.design.font, radius: dna.design.radius, cardStyle: dna.design.cardStyle },
    heroVariant: dna.motion.level * 13 + dna.sectionPlan.length,
    promise: pick(rng(seedFrom(`${seed}::promise`)), variants.promises),
    services,
    suggestedServices: tradeServices,
    imageQueries: [...variants.imageQueries],
    sectionOrder,
    goal,
    brief,
    dna,
  };
}

/** Hex-colour guard shared by every caller that accepts colours from a client. */
export function isHexColor(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
}

/**
 * The colours to persist for a business: what the customer chose, else what the
 * blueprint drew. Kept here so the API route and any future caller cannot
 * reintroduce the "client-supplied preset palette wins over per-business
 * variation" ordering that made same-trade sites identical.
 */
export function resolveColors(
  chosen: { primary?: unknown; secondary?: unknown; accent?: unknown },
  blueprint: SiteBlueprint,
): { primary: string; secondary: string; accent: string } {
  return {
    primary: isHexColor(chosen.primary) ? chosen.primary : blueprint.palette[0],
    secondary: isHexColor(chosen.secondary) ? chosen.secondary : blueprint.palette[1],
    accent: isHexColor(chosen.accent) ? chosen.accent : blueprint.palette[2],
  };
}

export { industryFor };

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
import { expandPaletteFamily } from "@/lib/palette-family";
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
   * Sections this business's page leaves off altogether. The builder drops
   * them before it arranges the rest, so two sites in one trade differ in what
   * is on the page, not only in the order it is in.
   */
  omit: readonly SectionType[];
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

/**
 * Sections a business may leave off its page entirely.
 *
 * A page is not a fixed list of blocks that everybody gets a copy of: a
 * two-helper electrician does not publish a blog, a shop that takes orders on
 * WhatsApp does not need a payment QR, and a chemist's opening hours are worth
 * a band on the homepage while a plumber's are not. What must stay is the spine
 * — what the business does, who it is, why it can be trusted, the ask and the
 * form — so the omissions below are drawn from the sections that add to a page
 * without being the reason someone came to it.
 *
 * `products` is deliberately absent: a shop's catalogue is its page.
 */
const OPTIONAL_SECTIONS: readonly SectionType[] = [
  "blog", "faq", "hours", "payment", "testimonials", "gallery", "stats",
];

/**
 * What this business's page is made of, and in what order.
 *
 * The order is a shuffle of this business's own seed rather than one of a
 * handful of canned orders. Seven canned orders meant a thousand businesses
 * shared seven pages: whichever one they drew, the middle of every site ran
 * through the same blocks in one of seven sequences, and two plumbers were
 * always a near-miss of each other. A shuffle of the business's own stream
 * gives every signup its own sequence, and dropping one to three optional
 * sections gives it its own composition — which is the part a visitor actually
 * notices, because the first thing they do is scroll.
 *
 * The hero still opens the page and the contact form still closes it (see
 * `arrangeSections`), and the director still pulls this goal's two most
 * important sections to the front (see `directPageOrder`).
 */
function pageComposition(seed: string): { order: SectionType[]; omit: SectionType[] } {
  const draw = rng(seedFrom(`${seed}::layout`));
  const candidates = shuffle(draw, [...OPTIONAL_SECTIONS]);
  const omitted = 1 + Math.floor(draw() * 3);
  const omit = candidates.slice(0, Math.min(omitted, candidates.length - 3));
  const middle = DNA_SECTION_TYPES.filter(
    (type) => type !== "hero" && type !== "contact" && !omit.includes(type),
  );
  return { order: shuffle(draw, middle), omit };
}

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
  //
  // The palette stream carries the attempt number, so the three genomes drawn
  // for one business differ in colour as well as in type and layout — which is
  // the whole point of offering three concepts to choose between. Attempt 0
  // keeps the original stream, so nothing already built changes.
  const attemptTag = input.attempt ? `:${input.attempt}` : "";
  const drawPalette = rng(seedFrom(`${seed}::palette${attemptTag}`));
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
  // The rotation pool is the trade's whole family — its curated palettes plus
  // the deterministic rotations of them (see lib/palette-family.ts). A curated
  // list is deliberately short, and a short list is how a thousand businesses
  // in one trade end up on the same blue: expanding it is what lets "this
  // colour is taken" be answered honestly at scale.
  const palettePool = expandPaletteFamily([...variants.palettes]);
  // Drawn from the family, not from the eight the picker shows: the picker is a
  // short, tidy row for the owner, and using its length here was what pinned
  // the whole trade to eight starting points no matter how big the family was.
  const drawn = Math.floor(drawPalette() * palettePool.length) % palettePool.length;
  // Which palettes the trade is already using. "Already used" has to mean
  // "looks the same", not "is the same three hex codes": most palettes in the
  // shared list carry the same amber accent and a near-black secondary, so
  // exact matching let two businesses end up on pages that felt identical.
  const taken = (input.taken ?? []).map((t) => t.split(","));
  // The shortlist is spread across the whole family rather than walking it from
  // one place: the pool is ordered base-by-base, so six consecutive entries are
  // six rotations of the *same* colour, and the "least similar" of six
  // near-identical blues is still that blue. Stepping by a stride coprime with
  // the pool's length samples the family instead — deterministic, so the same
  // business always considers the same six.
  const poolSize = palettePool.length || 1;
  const stride = (() => {
    for (const candidate of [7, 11, 13, 17, 19, 23, 29, 31]) {
      if (poolSize % candidate !== 0 && candidate < poolSize) return candidate;
    }
    return 1;
  })();
  const shortlist = Array.from(
    { length: Math.min(8, poolSize) },
    (_, k) => palettePool[(drawn * stride + k * stride) % poolSize] ?? paletteChoices[drawn % paletteChoices.length],
  );
  const closestTaken = (candidate: Palette) =>
    taken.reduce((worst, t) => Math.max(worst, paletteSimilarity(candidate, t)), 0);
  // A shortlist of six drawn from the business's own starting point, then the
  // least-similar one wins. Deterministic for a given database state, so a
  // re-generate does not shuffle a live site, and a business whose palette is
  // not close to anything keeps the palette it was drawn.
  //
  // (Three concepts for one business are kept different from each other by
  // candidateBlueprints below, which is the batch that can act on it: what one
  // business draws on its own must not depend on who else is being drawn.)
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
  // Each of the three concepts offered to one business also composes its page
  // differently, so "pick a direction" is a choice between three layouts rather
  // than three colourways of one.
  const composition = pageComposition(attemptTag ? `${seed}${attemptTag}` : seed);
  const sectionOrder = directPageOrder(composition.order, goal);
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
    omit: composition.omit,
    goal,
    brief,
    dna,
  };
}

/**
 * When two palettes look like the same colours used twice.
 *
 * The primary paints every button, heading and the moving band, so a shared
 * primary is the one thing that makes two concepts read as one website twice;
 * sharing only the near-black secondary or the accent is normal inside a trade
 * (most palettes carry the same amber). 0.5 is exactly "the primary is
 * identical and nothing else is", so anything above it is closer than that.
 */
const SIBLING_SAME = 0.5;

/** Hex-colour guard shared by every caller that accepts colours from a client. */
/**
 * The three genomes offered for one business (see lib/concepts.ts).
 *
 * Drawn in sequence, with each chosen palette added to the "already taken"
 * list before the next one is drawn — otherwise one business's three concepts
 * can share colours, and a choice between three websites that look the same is
 * not a choice. Both the concept preview and the signup that rebuilds the
 * chosen one call this, so "they picked concept 2" always means the same
 * genome.
 *
 * A trade's palette list is finite and a busy trade has all of it in use, so
 * after the "already taken" hint the later concepts are also checked against
 * their siblings — and moved to the pool entry furthest from them, but only
 * when that is actually further than what was drawn.
 */
export function candidateBlueprints(
  input: Omit<BlueprintInput, "attempt" | "taken"> & { taken?: readonly string[] },
  count = 3,
): SiteBlueprint[] {
  const taken: string[] = [...(input.taken ?? [])];
  const out: SiteBlueprint[] = [];
  for (let attempt = 0; attempt < count; attempt++) {
    const blueprint = blueprintFor({ ...input, taken, attempt });
    const closestSibling = (candidate: readonly string[]) =>
      out.reduce((worst, other) => Math.max(worst, paletteSimilarity(candidate, other.palette)), 0);
    if (out.length && closestSibling(blueprint.palette) >= SIBLING_SAME) {
      // The best of a finite list, not the first acceptable one: with two or
      // three siblings already chosen, the first acceptable entry can be much
      // closer than another one sitting further along the pool.
      const best = blueprint.palettePool.reduce(
        (winner, candidate) => (closestSibling(candidate) < closestSibling(winner) ? candidate : winner),
        blueprint.palette,
      );
      if (closestSibling(best) < closestSibling(blueprint.palette)) blueprint.palette = [...best];
    }
    taken.push(blueprint.palette.join(","));
    out.push(blueprint);
  }
  return out;
}

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

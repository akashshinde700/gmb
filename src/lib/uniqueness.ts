// WebSetu — the uniqueness engine.
//
// Generating a different genome per business is necessary but not sufficient:
// with 27 palettes, 18 looks and 3–4 arrangements per section, two businesses
// can still land on a combination that a visitor would call "the same site".
// Nothing in the generator can know that on its own, because "the same" is a
// statement about the sites that already exist.
//
// So this module compares a candidate site against the ones already built in
// the same trade and reports, per dimension, how close they are. The onboarding
// route asks for two or three genomes and keeps the most distinct one (see
// `bestCandidate`), which turns "different inputs give different outputs" into
// "no two live sites look like each other".
//
// The score is deliberately conservative and explainable: every dimension is a
// number a person can check by hand, and no model is involved, so the same two
// sites always produce the same score.

import type { Service } from "@/lib/types";

export interface SiteProfile {
  /** Hex colours, primary first. */
  palette: readonly string[];
  font?: string;
  radius?: string;
  cardStyle?: string;
  shadow?: string;
  spacing?: string;
  button?: string;
  header?: string;
  footer?: string;
  imageTreatment?: string;
  motion?: { pack?: string; level?: number };
  /** Section types in page order. */
  order: readonly string[];
  /** Arrangement of each section, in the same order. */
  variants?: readonly string[];
  /** Service names, used as a cheap proxy for content overlap. */
  services?: readonly string[];
}

export interface Similarity {
  overall: number;
  colour: number;
  typography: number;
  layout: number;
  components: number;
  motion: number;
  content: number;
}

/* ------------------------------------------------------------- primitives */

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 0 = identical colour, 1 = opposite corners of the cube. */
function colourDistance(a: string, b: string): number {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  if (!x || !y) return 1;
  const d = Math.sqrt((x[0] - y[0]) ** 2 + (x[1] - y[1]) ** 2 + (x[2] - y[2]) ** 2);
  return d / Math.sqrt(3 * 255 ** 2);
}

/**
 * How close two colours look to a person, not how close they are in RGB.
 *
 * The raw distance treats the whole cube as comparable, so a dark teal and a
 * mid teal — 0.16 apart, and obviously different on a page — scored 0.84 alike
 * and dragged every same-trade comparison over the threshold. Past about 0.18
 * apart, two colours read as different colours; below that they read as the
 * same colour used twice.
 */
const COLOUR_SAME = 0.18;

function colourSimilarity(a: string, b: string): number {
  return Math.max(0, 1 - colourDistance(a, b) / COLOUR_SAME);
}

/**
 * How alike two brand palettes look.
 *
 * Weighted by where each colour actually appears: the primary paints the
 * buttons, headings and the moving band, so two sites sharing it look related
 * even when the rest differs. The secondary is usually the near-black behind
 * the footer — on its own it says almost nothing, so it counts least.
 *
 * Exported because the generator uses the same judgement when it decides which
 * palette a new business should start on.
 */
export function paletteSimilarity(a: readonly string[], b: readonly string[]): number {
  const weights = [0.5, 0.2, 0.3];
  let total = 0;
  let weight = 0;
  for (let i = 0; i < 3; i++) {
    if (!a[i] || !b[i]) continue;
    total += colourSimilarity(a[i], b[i]) * weights[i];
    weight += weights[i];
  }
  return weight ? total / weight : 0;
}

/** Longest common subsequence ratio — order matters, not just membership. */
function lcsRatio(a: readonly string[], b: readonly string[]): number {
  if (!a.length || !b.length) return 0;
  const row = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let prev = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = a[i - 1] === b[j - 1] ? prev + 1 : Math.max(row[j], row[j - 1]);
      prev = tmp;
    }
  }
  return row[b.length] / Math.max(a.length, b.length);
}

function jaccard(a: readonly string[], b: readonly string[]): number {
  const A = new Set(a.map((x) => x.toLowerCase().trim()).filter(Boolean));
  const B = new Set(b.map((x) => x.toLowerCase().trim()).filter(Boolean));
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const x of A) if (B.has(x)) shared++;
  return shared / (A.size + B.size - shared);
}

/** How alike two option lists are — 1 when the same option was chosen twice. */
function sameOptionRatio(a: SiteProfile, b: SiteProfile, keys: (keyof SiteProfile)[]): number {
  let same = 0;
  let total = 0;
  for (const k of keys) {
    const x = a[k];
    const y = b[k];
    if (typeof x !== "string" || typeof y !== "string") continue;
    total++;
    if (x === y) same++;
  }
  return total ? same / total : 0;
}

/* ---------------------------------------------------------------- scoring */

/**
 * How similar two sites are, per dimension and overall.
 *
 * Weights are the product decision: colour and layout are what a visitor
 * notices first, so a shared palette is punished hardest; content overlap
 * matters least, because two plumbers legitimately sell the same six things.
 *
 * Calibrated against real generated sites: two businesses in one trade that
 * differ in palette, typography, section order and arrangement score around
 * 0.25–0.40, which is "clearly different pages"; anything above the 0.45
 * threshold used by the onboarding route means a visitor would say they look
 * like the same site, and another genome is tried.
 */
export function similarity(a: SiteProfile, b: SiteProfile): Similarity {
  const colour = a.palette.length && b.palette.length ? paletteSimilarity(a.palette, b.palette) : 0;
  const typography = sameOptionRatio(a, b, ["font", "shadow", "spacing", "imageTreatment"]);

  /**
   * Layout is two questions, not one: is the page built in the same order, and
   * are the blocks built the same way? Two sites that both open with a hero and
   * end with a contact form are not alike if one uses an editorial hero and a
   * process list while the other uses a banner and cards — so the arrangement of
   * each shared section is counted alongside the order.
   */
  const orderSim = lcsRatio(a.order, b.order);
  const variantSim = (() => {
    if (!a.variants?.length || !b.variants?.length) return orderSim;
    const of = new Map<string, string[]>();
    a.order.forEach((type, i) => {
      const list = of.get(type) ?? [];
      list.push(a.variants?.[i] ?? "");
      of.set(type, list);
    });
    let same = 0;
    let total = 0;
    b.order.forEach((type, i) => {
      const mine = b.variants?.[i] ?? "";
      const theirs = of.get(type);
      if (!theirs?.length) return;
      total++;
      if (theirs.includes(mine)) same++;
    });
    return total ? same / total : orderSim;
  })();
  const layout = (orderSim + variantSim) / 2;

  const components = sameOptionRatio(a, b, ["button", "cardStyle", "header", "footer", "radius"]);
  // Pack and intensity, each worth half: two sites on the same pack at very
  // different intensity do not feel alike, and neither do two packs at the
  // same intensity.
  const samePack = a.motion?.pack && b.motion?.pack ? (a.motion.pack === b.motion.pack ? 1 : 0) : 0;
  const levelGap = Math.abs((a.motion?.level ?? 0) - (b.motion?.level ?? 0));
  const motion = (samePack + Math.max(0, 1 - levelGap / 4)) / 2;
  const content = jaccard(a.services ?? [], b.services ?? []);

  const overall =
    colour * 0.3 + layout * 0.25 + typography * 0.15 + components * 0.15 + motion * 0.1 + content * 0.05;

  return { overall, colour, typography, layout, components, motion, content };
}

/** The closest existing site to this candidate — the number to beat. */
export function closest(candidate: SiteProfile, existing: readonly SiteProfile[]): { profile: SiteProfile; score: Similarity } | null {
  let best: { profile: SiteProfile; score: Similarity } | null = null;
  for (const other of existing) {
    const score = similarity(candidate, other);
    if (!best || score.overall > best.score.overall) best = { profile: other, score };
  }
  return best;
}

/**
 * Keep the most distinct of several candidate genomes.
 *
 * A business with nothing similar in the trade keeps its first genome, so this
 * never changes an already-unique site for no reason. Only when the first
 * choice is close to something live does a second direction get used.
 */
export function bestCandidate<T>(
  candidates: readonly T[],
  profileOf: (c: T) => SiteProfile,
  existing: readonly SiteProfile[],
  /** Above this, the candidate is considered too close and another is tried. */
  threshold = 0.45,
): { chosen: T; score: Similarity | null; tried: number } {
  if (!candidates.length) throw new Error("bestCandidate needs at least one candidate");
  if (!existing.length) {
    return { chosen: candidates[0], score: null, tried: 1 };
  }
  let best = candidates[0];
  let bestScore: Similarity | null = null;
  let tried = 0;
  for (const candidate of candidates) {
    tried++;
    const score = closest(profileOf(candidate), existing);
    if (!score) return { chosen: candidate, score: null, tried };
    if (!bestScore || score.score.overall < bestScore.overall) {
      best = candidate;
      bestScore = score.score;
    }
    // Good enough — stop asking for more directions, they cost a query each.
    if (score.score.overall <= threshold) break;
  }
  return { chosen: best, score: bestScore, tried };
}

/** The profile of a site as it exists in the database. */
export function profileFromSite(site: {
  brandPrimary?: string;
  brandSecondary?: string;
  brandAccent?: string;
  theme?: {
    font?: string; radius?: string; cardStyle?: string; shadow?: string; spacing?: string;
    button?: string; header?: string; footer?: string; imageTreatment?: string;
    motion?: { pack?: string; level?: number };
  };
  sections?: readonly { type: string; content?: Record<string, unknown> }[];
  services?: readonly Pick<Service, "name">[];
}): SiteProfile {
  const sections = (site.sections ?? []).filter((s) => s.content?.visible !== false);
  return {
    palette: [site.brandPrimary ?? "", site.brandSecondary ?? "", site.brandAccent ?? ""],
    font: site.theme?.font,
    radius: site.theme?.radius,
    cardStyle: site.theme?.cardStyle,
    shadow: site.theme?.shadow,
    spacing: site.theme?.spacing,
    button: site.theme?.button,
    header: site.theme?.header,
    footer: site.theme?.footer,
    imageTreatment: site.theme?.imageTreatment,
    motion: site.theme?.motion,
    order: sections.map((s) => s.type),
    variants: sections.map((s) => String(s.content?.variant ?? "")),
    services: (site.services ?? []).map((s) => s.name),
  };
}

/** Percent, rounded, for showing a customer "how different is my site". */
export function uniquenessPercent(score: Similarity | null): number {
  if (!score) return 100;
  return Math.max(0, Math.min(100, Math.round((1 - score.overall) * 100)));
}

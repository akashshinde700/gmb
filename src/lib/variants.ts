// WebSetu — per-business variation.
//
// Two shops in the same trade must not get the same website. Everything here is
// driven by a seed derived from the business itself, so the result is:
//   - different for every customer (colours, layout, copy, services, photos)
//   - stable for one customer (a rebuild never shuffles their site)
//   - reproducible on server and client, with no randomness
//
// The industry preset still decides what is *appropriate* for the trade; this
// decides which of several appropriate options that business gets.

export type Palette = readonly [string, string, string];

/**
 * FNV-1a plus a murmur3 finalizer. Stable across runs and machines.
 *
 * The finalizer matters: plain FNV-1a leaves near-identical short strings with
 * near-identical seeds, and two gyms whose slugs differed by a few characters
 * drew the same palette. Mixing the bits properly decorrelates them.
 */
export function seedFrom(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * mulberry32 — a tiny deterministic PRNG.
 *
 * The first value straight after seeding is weakly distributed for seeds that
 * are close together, which made similar business names land on the same
 * palette. Discarding a few values first fixes that, and costs nothing.
 */
export function rng(seed: number): () => number {
  let a = seed || 1;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next();
  next();
  next();
  return next;
}

/**
 * An independent generator per dimension.
 *
 * Drawing colours, layout and copy from one stream makes them correlate: two
 * businesses whose seeds land close together end up looking alike in several
 * ways at once. A separate stream per label keeps each choice independent.
 */
export function stream(seed: string, label: string): () => number {
  return rng(seedFrom(`${seed}::${label}`));
}

export function pick<T>(r: () => number, items: readonly T[]): T {
  return items[Math.floor(r() * items.length) % items.length];
}

/** Fisher-Yates, so the order itself differs between businesses. */
export function shuffle<T>(r: () => number, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Keep `n`, chosen and ordered by the seed. */
export function pickN<T>(r: () => number, items: readonly T[], n: number): T[] {
  return shuffle(r, items).slice(0, n);
}

/* ------------------------------------------------------------------ shared */

/** Headline shapes. {name} {promise} {city} {category} are filled in after. */
export const HEADINGS: readonly string[] = [
  "{name} — {promise}",
  "{promise}, Right Here in {city}",
  "{name}: {promise}",
  "{promise} — Trusted Across {city}",
  "{name} — {promise} You Can Count On",
  "{promise}. That is {name}.",
  "{city} Trusts {name} for {promise}",
  "{name} — Where {promise} Comes Standard",
  "{promise}, Every Single Day",
  "Looking for {promise}? Start With {name}",
  "{name}: {promise} Without the Runaround",
];

export const SUBHEADINGS: readonly string[] = [
  "{services} in {city}. {closing}",
  "Serving {city} and nearby areas with {services}. {closing}",
  "{services} — handled properly, start to finish. {closing}",
  "From {services} and more, across {city}. {closing}",
  "{services}, done by a team that turns up. {closing}",
  "Your local choice in {city} for {services}. {closing}",
  "{services} — clear pricing, no surprises. {closing}",
];

export const CLOSINGS: readonly string[] = [
  "Call us for a free quote today.",
  "Talk to us and we will walk you through it.",
  "Get in touch — we reply quickly.",
  "One call is all it takes to get started.",
  "Message us and we will come back the same day.",
  "Ask us anything — no obligation.",
  "Tell us what you need and we will handle it.",
  "Drop us a line and we will take it from there.",
  "We are a phone call away.",
];

export const SECONDARY_CTAS: readonly string[] = [
  "Call Now",
  "Talk to Us",
  "WhatsApp Us",
  "Call Our Team",
  "Speak to Us",
  "Message Us",
  "Ask a Question",
  "Get in Touch",
  "Book a Visit",
  "Enquire Now",
];

/** Layout personalities. The industry still fixes heroStyle. */
export const LOOKS: readonly { font: "modern" | "classic" | "elegant"; radius: "sharp" | "rounded" | "pill"; cardStyle: "flat" | "shadow" | "outline" }[] =
  (["modern", "classic", "elegant"] as const).flatMap((font) =>
    (["sharp", "rounded", "pill"] as const).flatMap((radius) =>
      (["flat", "shadow", "outline"] as const).map((cardStyle) => ({ font, radius, cardStyle })),
    ),
  );

export interface IndustryVariants {
  /** Palettes that all suit the trade; one is chosen per business. */
  palettes: readonly Palette[];
  /** Short value promises used to build the headline. */
  promises: readonly string[];
  /** Stock-photo searches — different wording finds different photos. */
  imageQueries: readonly string[];
}

/**
 * Per-industry options. The first palette of each list is the one the trade
 * started with, so existing sites keep the look they already had.
 */
export const VARIANTS: Record<string, IndustryVariants> = {
  transport: {
    palettes: [["#1d4ed8", "#0f172a", "#f59e0b"], ["#0f766e", "#042f2e", "#fbbf24"], ["#b45309", "#1c1917", "#fde047"], ["#334155", "#020617", "#38bdf8"]],
    promises: ["Safe, On-Time Delivery", "Every Load Delivered On Time", "Freight You Can Track", "Goods Moved With Care", "Reliable Transport, Fair Rates"],
    imageQueries: ["truck", "cargo", "warehouse", "shipping container", "logistics"],
  },
  travel: {
    palettes: [["#0284c7", "#0c4a6e", "#f97316"], ["#0d9488", "#134e4a", "#fbbf24"], ["#7c3aed", "#2e1065", "#f59e0b"], ["#e11d48", "#4c0519", "#fbbf24"]],
    promises: ["Holidays Planned Properly", "Trips Made Simple", "Journeys Worth Remembering", "Your Trip, Fully Arranged", "Travel Without The Stress"],
    imageQueries: ["travel", "mountains", "landscape", "beach", "tourism"],
  },
  "building-materials": {
    palettes: [["#b45309", "#292524", "#facc15"], ["#0369a1", "#082f49", "#eab308"], ["#57534e", "#1c1917", "#f59e0b"], ["#15803d", "#14532d", "#fbbf24"]],
    promises: ["Everything You Need to Build", "Genuine Materials, Fair Rates", "One Supplier for the Whole Site", "Quality Materials, Delivered", "Build With Materials You Trust"],
    imageQueries: ["bricks", "steel", "tiles", "construction", "cement"],
  },
  construction: {
    palettes: [["#ea580c", "#1c1917", "#facc15"], ["#b45309", "#292524", "#fde047"], ["#0369a1", "#082f49", "#f59e0b"], ["#3f3f46", "#18181b", "#fbbf24"]],
    promises: ["Quality Construction, On Time", "Built Right, Built To Last", "From Plan to Handover", "Construction Without Surprises", "Your Project, Properly Delivered"],
    imageQueries: ["construction worker", "crane", "construction", "concrete", "building site"],
  },
  "real-estate": {
    palettes: [["#27272a", "#09090b", "#d4af37"], ["#1e40af", "#172554", "#f59e0b"], ["#166534", "#052e16", "#fbbf24"], ["#7c2d12", "#1c1917", "#f5d0a9"], ["#334155", "#0f172a", "#38bdf8"]],
    promises: ["Find the Right Property", "Property Made Simple", "Homes Worth Coming Home To", "The Right Address, The Right Price", "Property Advice You Can Trust"],
    imageQueries: ["house", "apartment", "building", "living room", "modern house"],
  },
  manufacturing: {
    palettes: [["#0369a1", "#082f49", "#eab308"], ["#3f3f46", "#18181b", "#f59e0b"], ["#166534", "#14532d", "#facc15"], ["#b91c1c", "#450a0a", "#fbbf24"]],
    promises: ["Quality Products, Reliable Supply", "Built to Specification", "Consistent Quality, Every Batch", "Supply You Can Plan Around", "Manufacturing You Can Rely On"],
    imageQueries: ["factory", "industry", "manufacturing", "production", "machinery"],
  },
  beverage: {
    palettes: [["#0891b2", "#083344", "#22d3ee"], ["#0284c7", "#0c4a6e", "#7dd3fc"], ["#0d9488", "#042f2e", "#5eead4"], ["#1d4ed8", "#172554", "#93c5fd"]],
    promises: ["Purity You Can Taste", "Clean Water, Delivered", "Refreshment You Can Trust", "Pure Every Single Drop", "Quality You Can Taste"],
    imageQueries: ["water", "water splash", "drink", "beverage", "juice"],
  },
  food: {
    palettes: [["#ea580c", "#7c2d12", "#fbbf24"], ["#b91c1c", "#450a0a", "#fcd34d"], ["#92400e", "#451a03", "#fbbf24"], ["#166534", "#14532d", "#fde047"], ["#9f1239", "#4c0519", "#fb923c"]],
    promises: ["Fresh Food, Made With Care", "Flavours Worth Returning For", "Cooked Fresh, Served Hot", "Real Food, Real Taste", "Where Every Meal Matters"],
    imageQueries: ["food", "restaurant", "cooking", "dinner", "kitchen food"],
  },
  hotel: {
    palettes: [["#7c3aed", "#2e1065", "#f59e0b"], ["#27272a", "#09090b", "#d4af37"], ["#0f766e", "#134e4a", "#fbbf24"], ["#9f1239", "#4c0519", "#fcd34d"]],
    promises: ["Your Comfortable Stay", "Rest Well, Travel Better", "Comfort That Feels Like Home", "A Warm Welcome, Every Time", "Stay Easy, Stay Happy"],
    imageQueries: ["hotel", "hotel room", "resort", "bedroom", "hospitality"],
  },
  healthcare: {
    palettes: [["#0d9488", "#134e4a", "#38bdf8"], ["#0284c7", "#0c4a6e", "#5eead4"], ["#15803d", "#14532d", "#86efac"], ["#4f46e5", "#1e1b4b", "#93c5fd"]],
    promises: ["Expert Care, Close to Home", "Care You Can Trust", "Health in Good Hands", "Treatment Explained Clearly", "Caring for Your Family"],
    imageQueries: ["doctor", "medical", "hospital", "clinic", "health"],
  },
  dental: {
    palettes: [["#0ea5e9", "#0c4a6e", "#fbbf24"], ["#0d9488", "#134e4a", "#a5f3fc"], ["#4f46e5", "#1e1b4b", "#bae6fd"], ["#6366f1", "#312e81", "#fde047"]],
    promises: ["Healthy Smiles, Gentle Care", "Dentistry Without The Dread", "Smile With Confidence", "Gentle Care, Clear Pricing", "Your Smile, Our Craft"],
    imageQueries: ["dentist", "dental", "teeth", "smile", "dental clinic"],
  },
  beauty: {
    palettes: [["#e11d48", "#4c0519", "#f59e0b"], ["#a21caf", "#4a044e", "#fbbf24"], ["#9f1239", "#500724", "#fda4af"], ["#7c3aed", "#3b0764", "#f5d0fe"], ["#be185d", "#500724", "#fcd34d"]],
    promises: ["Where Beauty Meets Care", "Look Good, Feel Better", "Styled The Way You Want", "Your Best Look, Every Time", "Care That Shows"],
    imageQueries: ["salon", "makeup", "beauty", "spa", "cosmetics"],
  },
  fitness: {
    palettes: [["#dc2626", "#0a0a0a", "#facc15"], ["#ea580c", "#1c1917", "#fde047"], ["#16a34a", "#052e16", "#a3e635"], ["#1d4ed8", "#0f172a", "#38bdf8"]],
    promises: ["Stronger Every Day", "Train With Purpose", "Results That Last", "Your Goal, Our Plan", "Fitness That Fits Your Life"],
    imageQueries: ["gym", "fitness", "workout", "exercise", "weights"],
  },
  professional: {
    palettes: [["#4f46e5", "#1e1b4b", "#f59e0b"], ["#1e40af", "#172554", "#fbbf24"], ["#27272a", "#09090b", "#d4af37"], ["#0f766e", "#134e4a", "#fcd34d"]],
    promises: ["Clear Advice, Complete Compliance", "Expert Guidance, Plain Language", "Your Matter In Safe Hands", "Advice Without The Jargon", "Deadlines Met, Always"],
    imageQueries: ["office", "meeting", "business", "documents", "laptop desk"],
  },
  education: {
    palettes: [["#2563eb", "#1e3a8a", "#f59e0b"], ["#15803d", "#14532d", "#fde047"], ["#b45309", "#451a03", "#fbbf24"], ["#7c3aed", "#2e1065", "#fcd34d"]],
    promises: ["A Strong Foundation for Success", "Learning That Actually Sticks", "Where Students Grow", "Teaching With Real Attention", "Building Confident Learners"],
    imageQueries: ["classroom", "students", "school", "library", "study"],
  },
  tech: {
    palettes: [["#6366f1", "#0f172a", "#22d3ee"], ["#0284c7", "#082f49", "#38bdf8"], ["#7c3aed", "#2e1065", "#a78bfa"], ["#0d9488", "#042f2e", "#5eead4"], ["#1e40af", "#0f172a", "#f59e0b"]],
    promises: ["Software That Moves You Forward", "Technology That Just Works", "Built Around Your Business", "From Idea to Launch", "Engineering You Can Depend On"],
    imageQueries: ["computer", "technology", "laptop", "developer", "code"],
  },
  automotive: {
    palettes: [["#0369a1", "#020617", "#ef4444"], ["#dc2626", "#1c1917", "#facc15"], ["#3f3f46", "#09090b", "#38bdf8"], ["#ea580c", "#1c1917", "#fde047"]],
    promises: ["Expert Service, Honest Pricing", "Your Vehicle In Good Hands", "Fixed Right, First Time", "Service Without Surprises", "Back On The Road, Faster"],
    imageQueries: ["car", "mechanic", "garage", "engine", "car repair"],
  },
  events: {
    palettes: [["#a21caf", "#1e0a2e", "#fbbf24"], ["#9f1239", "#4c0519", "#fcd34d"], ["#7c3aed", "#2e1065", "#f5d0fe"], ["#be185d", "#500724", "#fde047"], ["#1e40af", "#172554", "#fbbf24"]],
    promises: ["Your Moments, Beautifully Captured", "Events Worth Remembering", "Every Detail, Handled", "Celebrations Done Right", "Memories You Will Keep"],
    imageQueries: ["wedding", "party", "celebration", "event", "flowers"],
  },
  interior: {
    palettes: [["#c2410c", "#292524", "#d4af37"], ["#27272a", "#18181b", "#f5d0a9"], ["#0f766e", "#134e4a", "#fcd34d"], ["#7c2d12", "#1c1917", "#fbbf24"]],
    promises: ["Interiors Designed Around You", "Spaces That Feel Like Yours", "Design That Works Every Day", "Beautiful Spaces, Built Properly", "Your Home, Thoughtfully Designed"],
    imageQueries: ["interior", "living room", "furniture", "home decor", "kitchen"],
  },
  "home-services": {
    palettes: [["#059669", "#064e3b", "#f59e0b"], ["#1d4ed8", "#0f172a", "#fbbf24"], ["#ea580c", "#1c1917", "#fde047"], ["#0d9488", "#134e4a", "#fcd34d"]],
    promises: ["Fixed Right, the First Time", "Fast Help When You Need It", "Trusted Hands At Your Door", "Quick Service, Clear Pricing", "Problems Solved Properly"],
    imageQueries: ["tools", "repair", "plumber", "maintenance", "electrician"],
  },
  agriculture: {
    palettes: [["#16a34a", "#14532d", "#facc15"], ["#65a30d", "#1a2e05", "#fde047"], ["#b45309", "#451a03", "#a3e635"], ["#0f766e", "#134e4a", "#fbbf24"]],
    promises: ["Better Inputs, Better Harvests", "Growing With You", "Genuine Products, Honest Advice", "From Our Field to Yours", "Farming Made Easier"],
    imageQueries: ["farm", "field", "crops", "tractor", "harvest"],
  },
  retail: {
    palettes: [["#d97706", "#78350f", "#fbbf24"], ["#9f1239", "#4c0519", "#fcd34d"], ["#1d4ed8", "#172554", "#f59e0b"], ["#15803d", "#14532d", "#fde047"], ["#7c3aed", "#2e1065", "#fbbf24"]],
    promises: ["Quality Products, Friendly Prices", "Everything You Need, Nearby", "Shop With Confidence", "Great Value, Every Visit", "Your Neighbourhood Favourite"],
    imageQueries: ["shop", "store", "market", "shopping", "retail"],
  },
  general: {
    palettes: [["#059669", "#0f766e", "#f59e0b"], ["#1d4ed8", "#0f172a", "#fbbf24"], ["#b45309", "#292524", "#fde047"], ["#4f46e5", "#1e1b4b", "#f59e0b"], ["#0f766e", "#134e4a", "#fcd34d"]],
    promises: ["Quality Work, Honest Pricing", "Service You Can Rely On", "Done Properly, Every Time", "Your Work In Good Hands", "Trusted By Your Neighbours"],
    imageQueries: ["business", "shop", "office", "team", "work"],
  },
};

/**
 * Palettes that suit almost any trade. They are appended to every industry's
 * own list so a town with a dozen businesses in one trade still has enough
 * distinct looks to go round — the pigeonhole, not the randomness, was what
 * made two customers share colours.
 */
const SHARED_PALETTES: readonly Palette[] = [
  ["#1e3a8a", "#0f172a", "#fbbf24"],
  ["#334155", "#020617", "#38bdf8"],
  ["#115e59", "#042f2e", "#fcd34d"],
  ["#7c2d12", "#1c1917", "#fbbf24"],
  ["#4c1d95", "#2e1065", "#fcd34d"],
  ["#3f3f46", "#18181b", "#f59e0b"],
  ["#065f46", "#022c22", "#fde047"],
  ["#9d174d", "#500724", "#fbbf24"],
  ["#1d4ed8", "#172554", "#f97316"],
  ["#0e7490", "#083344", "#fde047"],
  ["#4d7c0f", "#1a2e05", "#fbbf24"],
  ["#a16207", "#422006", "#fcd34d"],
  ["#6d28d9", "#2e1065", "#f59e0b"],
  ["#be123c", "#4c0519", "#fcd34d"],
  ["#047857", "#064e3b", "#facc15"],
  ["#1e293b", "#020617", "#f59e0b"],
  ["#86198f", "#4a044e", "#fde047"],
  ["#c2410c", "#431407", "#fed7aa"],
  ["#0f766e", "#134e4a", "#f97316"],
  ["#52525b", "#18181b", "#38bdf8"],
];

export function variantsFor(key: string): IndustryVariants {
  const base = VARIANTS[key] ?? VARIANTS.general;
  const seen = new Set(base.palettes.map((p) => p.join()));
  return {
    ...base,
    palettes: [...base.palettes, ...SHARED_PALETTES.filter((p) => !seen.has(p.join()))],
  };
}

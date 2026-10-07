// WebSetu — designs made in Google Stitch, one set per trade.
//
// This file is GENERATED. Do not edit it by hand: run
//
//   node tools/stitch-palettes.mjs --all        # every trade
//   node tools/stitch-palettes.mjs fitness food # just these
//
// with your Stitch keys in stitch-keys.local.json (gitignored). The script asks
// Stitch for landing-page designs for each trade, keeps the brand palettes it
// returns, and writes them here.
//
// Why design-time and not at signup: a Stitch call takes 30–90 seconds and a
// metered credit. At thousands of businesses that is impossible to pay for, and
// a credit failure in the middle of signup would leave a customer with no
// website at all. Generated once and committed here, every new business gets a
// Stitch-designed palette instantly, offline, for free — and it still gets its
// own palette rather than the same one as the next business in its trade,
// because these are added to the trade's list and the business's seed picks
// from it (see variantsFor + blueprint.ts).
//
// The file ships empty, which is a valid state: the trade falls back to the
// palettes in variants.ts exactly as before.

export interface StitchDesign {
  /** Name Stitch gave the design system, for attribution in admin tooling. */
  name?: string;
  /** [primary, secondary, accent] — the three colours a tenant site uses. */
  colors: readonly [string, string, string];
  /** What the design was asked for, e.g. "real-estate · calm and premium". */
  brief?: string;
}

/**
 * Stitch palettes per industry key, appended to that trade's palette list.
 * Industry keys match `VARIANTS` and the presets in industries.ts.
 */
export const STITCH_DESIGNS: Record<string, readonly StitchDesign[]> = {};

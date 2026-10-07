// WebSetu — the palette family behind a trade.
//
// A trade's curated palettes are a short list on purpose: the owner picks from
// eight colours that suit a clinic, not from three hundred. But the *pool* the
// generator draws a business's default from is a different job, and a short
// pool is how two hundred electricians in one state end up on the same blue.
//
// So the curated list is expanded, at generation time only, into a family: each
// palette is rotated through a fixed set of hue steps and lifted or deepened
// a little, which is what a designer does when a client says "like this, but
// not exactly this". Everything stays inside the trade's own character — a
// ±54° rotation never turns a clinic's calm teal into a neon green — and every
// derived palette is checked before it is offered: white text has to stay
// readable on the primary, and a colour that has gone grey has no business
// painting buttons.
//
// Deterministic and pure: same curated list in, same family out. The family is
// only ever a source of *defaults*; the owner's own choice in the wizard always
// wins, and the picker still shows the short curated row.

import type { Palette } from "@/lib/variants";

/**
 * Hue rotations, in degrees, applied to the primary.
 *
 * Twelve degrees apart, out to ±96°: a twelve-degree step is inside what an eye
 * calls "the same colour", so the family reads as a family, and the far end is
 * still recognisably the same mood (a clinic's calm teal becomes a mint or a
 * sea blue, never a neon green). Further than that and the rotation stops being
 * "like this, but not exactly this" and becomes a different brand.
 */
const HUE_STEPS = [12, -12, 24, -24, 36, -36, 48, -48, 60, -60, 72, -72, 84, -84, 96, -96];
/** Lightness offsets, in percentage points, pairing with the hue steps. */
const LIGHT_STEPS = [3, -3, 6, -6, 9, -9];
/** Saturation offsets — a muted and a saturated reading of the same hue. */
const SAT_STEPS = [0, 0.08, -0.08];

interface Hsl {
  h: number;
  s: number;
  l: number;
}

function hexToHsl(hex: string): Hsl | null {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = 60 * (((g - b) / d) % 6);
  else if (max === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  return { h: (h + 360) % 360, s, l };
}

function hslToHex({ h, s, l }: Hsl): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(1, s));
  const light = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;
  const [r, g, b] =
    hue < 60 ? [c, x, 0]
    : hue < 120 ? [x, c, 0]
    : hue < 180 ? [0, c, x]
    : hue < 240 ? [0, x, c]
    : hue < 300 ? [x, 0, c]
    : [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** Relative luminance, for the "can white text sit on this" check. */
function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0;
  const int = parseInt(m[1], 16);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel((int >> 16) & 255) + 0.7152 * channel((int >> 8) & 255) + 0.0722 * channel(int & 255);
}

/** Contrast ratio between two hex colours (1…21). */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Whether a primary colour can carry a page.
 *
 * Buttons and headings are painted in the primary with white text on top, so a
 * primary that is too light, too grey or too dark to read stops being usable
 * before it stops being a colour. Derived palettes are held to the same bar the
 * curated ones already meet.
 */
export function usablePrimary(hex: string): boolean {
  const hsl = hexToHsl(hex);
  if (!hsl) return false;
  if (hsl.s < 0.25) return false;
  if (hsl.l < 0.22 || hsl.l > 0.62) return false;
  return contrast(hex, "#ffffff") >= 3;
}

/**
 * One trade's curated palettes, expanded into a family.
 *
 * The first entries are the curated palettes themselves, in their original
 * order, so a business whose palette has not been taken keeps exactly the
 * colour it would have had before. Everything after that is a rotation of one
 * of them.
 */
export function expandPaletteFamily(base: readonly Palette[], perPalette = 96): Palette[] {
  const out: Palette[] = [];
  const seen = new Set<string>();
  const push = (palette: Palette) => {
    const key = palette.join(",").toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(palette);
  };

  for (const palette of base) push(palette);

  // Hue-first, so a business that has to step aside from a taken colour moves
  // to *another* colour before it moves to another shade of the same one.
  const rotations: { dh: number; dl: number; ds: number }[] = [];
  for (const dh of HUE_STEPS) {
    for (const dl of LIGHT_STEPS) {
      for (const ds of SAT_STEPS) rotations.push({ dh, dl, ds });
    }
  }

  for (const palette of base) {
    const primary = hexToHsl(palette[0]);
    if (!primary) continue;
    let derived = 0;
    for (const { dh, dl, ds } of rotations) {
      if (derived >= perPalette - 1) break;
      const rotated = hslToHex({ h: primary.h + dh, s: primary.s + ds, l: primary.l + dl / 100 });
      if (!usablePrimary(rotated)) continue;
      // The ink behind the footer stays the trade's own dark: rotating a
      // near-black does almost nothing, so it is kept as drawn.
      const before = out.length;
      push([rotated, palette[1], palette[2]]);
      if (out.length > before) derived += 1;
    }
  }

  return out;
}

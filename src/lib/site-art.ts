// WebSetu — generated SVG artwork, one poster per business.
//
// The complaint this answers: a new site opened with a stock photograph that
// every business in the same trade also had, so two real-estate customers had
// identical pages above the fold. Stock photos cannot fix that — the pool is
// shared by everyone searching "house". Generated art can: it is drawn from the
// business's own seed and its own brand colours, so no two are alike, and it
// costs nothing to produce.
//
// What it is used for:
//   - the hero background, when the owner has not uploaded a photo of their own
//     (the animated scene from hero-scene.tsx sits on top of it)
//   - the link-preview / OG image for a site that has no photo yet
//   - gallery tiles on a brand-new site, so the gallery is never empty or made
//     of three copies of the same stock search
//
// Design rules:
//   - deterministic: same seed and colours always produce the same SVG
//   - self-contained: no external fonts, images or scripts in the output
//   - brand colours only, so the art matches the palette the customer picked
//   - decorative abstract shapes rather than clip-art, so it reads as a design

import { rng, seedFrom } from "@/lib/variants";
import type { SceneKind } from "@/lib/industries";
import type { Business } from "@/lib/types";

export type ArtRatio = "wide" | "square" | "portrait";

const SIZES: Record<ArtRatio, { w: number; h: number }> = {
  wide: { w: 1600, h: 900 },
  square: { w: 1200, h: 1200 },
  portrait: { w: 900, h: 1200 },
};

/**
 * Each trade scene is drawn in several ways, and which one a business gets is
 * decided by its own seed. This is the difference between "different colours on
 * the same picture" and genuinely different artwork: two electricians in one
 * city now get a different *kind* of image, not the same skyline repainted.
 *
 * The names are stable — they appear in art URLs, in tests and in the data
 * attribute on the drawn group — so they can be pinned without changing a seed.
 */
export const MOTIF_VARIANTS = {
  build: ["skyline", "blueprint", "crane"],
  water: ["waves", "drops", "ripples"],
  care: ["pulse", "cross", "arcs"],
  tech: ["chips", "mesh", "bars"],
  drive: ["streaks", "road", "gauge"],
  craft: ["discs", "stack", "spark"],
} as const satisfies Record<SceneKind, readonly string[]>;

export type MotifVariant = (typeof MOTIF_VARIANTS)[SceneKind][number];

/** The variant names a scene can be drawn in, in a stable order. */
export function variantsFor(scene: SceneKind): readonly string[] {
  return MOTIF_VARIANTS[scene] ?? MOTIF_VARIANTS.craft;
}

/**
 * Where each place on a page sits in the drawing cycle.
 *
 * The slots are spaced so that the pictures a visitor actually sees one after
 * another — the about block, the gallery, the closing band — are drawn
 * differently from each other, and the gallery tiles walk forward from the
 * gallery slot so three tiles are three drawings.
 */
const SECTION_SLOT: Record<string, number> = {
  cover: 0,
  cta: 1,
  about: 2,
  gallery: 3,
  hero: 4,
  services: 5,
  products: 6,
};

/**
 * Which variant a poster should use.
 *
 * An explicit request wins (it is what the section-aware URLs pass); otherwise
 * the business's own seed decides where it starts in the cycle, the section
 * decides how far along it sits, and the index walks forward from there.
 */
export function pickVariant(scene: SceneKind, options: { variant?: string; index?: number; seed?: string; section?: string } = {}): string {
  const variants = variantsFor(scene);
  const asked = (options.variant ?? "").trim();
  if (asked && variants.includes(asked)) return asked;
  if (asked) {
    // A variant from another scene is still honoured when it exists anywhere:
    // the caller asked for a shape, and both scenes draw abstract geometry.
    for (const list of Object.values(MOTIF_VARIANTS)) {
      if ((list as readonly string[]).includes(asked)) return asked;
    }
  }
  const index = Math.max(0, options.index ?? 0);
  // The business's own seed decides where in the cycle it starts, so two
  // clinics in one trade open on different drawings; the section and the index
  // walk forward from there, so one business's own pictures differ too.
  const seed = options.seed ?? "";
  const start = seed ? Math.floor(rng(seedFrom(`${seed}::motif`))() * variants.length) % variants.length : 0;
  const slot = SECTION_SLOT[options.section ?? ""] ?? 0;
  return variants[(start + slot + index) % variants.length];
}

/** The Design DNA keys that change how a poster is painted. */
export type ArtTreatment = "plain" | "duotone" | "framed" | "soft-focus";
export type ArtRadius = "sharp" | "rounded" | "pill";

interface ArtInput {
  seed: string;
  scene: SceneKind;
  colors: readonly [string, string, string];
  ratio?: ArtRatio;
  /** Distinguishes several posters for one business (gallery tiles). */
  index?: number;
  /**
   * How the picture is finished, from the business's own Design DNA. A poster
   * is often the only image on a generated site, so the image treatment the
   * genome chose has to be visible here — otherwise "framed" and "duotone"
   * would be settings that change nothing.
   */
  treatment?: ArtTreatment;
  radius?: ArtRadius;
  /** Animation intensity 0–4. At 0–1 the poster is still. */
  motion?: number;
  /**
   * Which drawing of the scene to use. Defaults to the seeded pick; the art
   * route sets it so that one business's hero, about and gallery tiles are
   * different pictures rather than the same one at three crops.
   */
  variant?: string;
  /** Where the poster is used ("hero", "gallery"…). Feeds the seed. */
  section?: string;
}

function esc(s: string): string {
  return s.replace(/[<>&"]/g, "");
}

/**
 * One motif per industry family, drawn as repeated geometry.
 *
 * `scene` comes from the industry preset (see industries.ts) and is the same key
 * the hero animation uses, so a water brand's poster and its hero move in the
 * same visual language.
 */
/**
 * One drawing per (scene, variant). Every one is abstract geometry in the
 * business's own colours — no clip-art, no photographs, no external files.
 *
 * `r()` is the seeded random source; each drawing pulls from it a fixed number
 * of times so the poster stays deterministic. `accent` and `light` are the
 * brand colours the caller resolved.
 */
type Draw = (w: number, h: number, r: () => number, accent: string, light: string) => string;

const DRAWINGS: Record<string, Draw> = {
  /* ----------------------------------------------------------------- build */
  skyline: (w, h, r, accent, light) => {
    const parts: string[] = [];
    const ground = h * 0.94;
    for (let i = 0; i < 7; i++) {
      const bw = h * (0.1 + r() * 0.16);
      const bh = h * (0.18 + r() * 0.5);
      const bx = w * 0.06 + r() * w * 0.88 - bw / 2;
      const by = ground - bh;
      parts.push(
        `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="${(bw * 0.05).toFixed(1)}" fill="${accent}" fill-opacity="0.16" stroke="${light}" stroke-opacity="0.18" stroke-width="2"/>`,
      );
      const cols = 3 + Math.floor(r() * 2);
      const rows = 3 + Math.floor(r() * 3);
      for (let c = 0; c < cols; c++) {
        for (let rr = 0; rr < rows; rr++) {
          parts.push(
            `<rect x="${(bx + bw * (0.14 + c * (0.72 / cols))).toFixed(1)}" y="${(by + bh * (0.12 + rr * (0.74 / rows))).toFixed(1)}" width="${(bw * (0.5 / cols)).toFixed(1)}" height="${(bh * 0.4 / rows).toFixed(1)}" fill="${light}" fill-opacity="${(0.08 + r() * 0.14).toFixed(2)}"/>`,
          );
        }
      }
    }
    parts.push(`<line x1="0" y1="${ground.toFixed(1)}" x2="${w}" y2="${ground.toFixed(1)}" stroke="${light}" stroke-opacity="0.25" stroke-width="3"/>`);
    return parts.join("");
  },
  blueprint: (w, h, r, accent, light) => {
    const parts: string[] = [];
    const step = w / 12;
    for (let i = 1; i < 12; i++) {
      parts.push(`<line x1="${(i * step).toFixed(1)}" y1="0" x2="${(i * step).toFixed(1)}" y2="${h}" stroke="${light}" stroke-opacity="0.07" stroke-width="1"/>`);
    }
    for (let i = 1; i < 7; i++) {
      parts.push(`<line x1="0" y1="${(i * (h / 7)).toFixed(1)}" x2="${w}" y2="${(i * (h / 7)).toFixed(1)}" stroke="${light}" stroke-opacity="0.07" stroke-width="1"/>`);
    }
    // Two room plans drawn as dashed outlines, at different scales.
    for (let i = 0; i < 2; i++) {
      const pw = w * (0.28 + r() * 0.3);
      const ph = h * (0.22 + r() * 0.4);
      const px = w * 0.08 + r() * Math.max(1, w * 0.7 - pw);
      const py = h * 0.1 + r() * Math.max(1, h * 0.6 - ph);
      parts.push(
        `<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}" fill="none" stroke="${accent}" stroke-opacity="0.4" stroke-width="3" stroke-dasharray="14 10"/>`,
      );
      parts.push(
        `<line x1="${(px + pw * 0.55).toFixed(1)}" y1="${py.toFixed(1)}" x2="${(px + pw * 0.55).toFixed(1)}" y2="${(py + ph).toFixed(1)}" stroke="${light}" stroke-opacity="0.3" stroke-width="2"/>`,
      );
      parts.push(
        `<circle cx="${(px + pw * 0.82).toFixed(1)}" cy="${(py + ph * 0.78).toFixed(1)}" r="${(ph * 0.12).toFixed(1)}" fill="none" stroke="${light}" stroke-opacity="0.28" stroke-width="2"/>`,
      );
    }
    return parts.join("");
  },
  crane: (w, h, r, accent, light) => {
    const parts: string[] = [];
    const base = h * 0.92;
    for (let i = 0; i < 3; i++) {
      const tx = w * (0.18 + i * 0.3) + (r() - 0.5) * w * 0.08;
      const mastH = h * (0.4 + r() * 0.36);
      const mastW = h * 0.03;
      parts.push(
        `<rect x="${(tx - mastW / 2).toFixed(1)}" y="${(base - mastH).toFixed(1)}" width="${mastW.toFixed(1)}" height="${mastH.toFixed(1)}" fill="${light}" fill-opacity="0.22"/>`,
      );
      // Lattice: a few cross braces up the mast.
      for (let b = 1; b < 6; b++) {
        const y = base - (mastH * b) / 6;
        parts.push(
          `<line x1="${(tx - mastW).toFixed(1)}" y1="${y.toFixed(1)}" x2="${(tx + mastW).toFixed(1)}" y2="${(y - mastH / 6).toFixed(1)}" stroke="${light}" stroke-opacity="0.18" stroke-width="1.5"/>`,
        );
      }
      const jib = w * (0.16 + r() * 0.2);
      const dir = r() < 0.5 ? -1 : 1;
      parts.push(
        `<rect x="${(dir < 0 ? tx - jib : tx).toFixed(1)}" y="${(base - mastH - h * 0.02).toFixed(1)}" width="${jib.toFixed(1)}" height="${(h * 0.018).toFixed(1)}" fill="${accent}" fill-opacity="0.35"/>`,
      );
      const hookX = tx + dir * jib * (0.6 + r() * 0.35);
      const hookY = base - mastH + h * (0.1 + r() * 0.2);
      parts.push(`<line x1="${hookX.toFixed(1)}" y1="${(base - mastH).toFixed(1)}" x2="${hookX.toFixed(1)}" y2="${hookY.toFixed(1)}" stroke="${light}" stroke-opacity="0.3" stroke-width="2"/>`);
      parts.push(`<rect x="${(hookX - w * 0.02).toFixed(1)}" y="${hookY.toFixed(1)}" width="${(w * 0.04).toFixed(1)}" height="${(h * 0.03).toFixed(1)}" rx="4" fill="${accent}" fill-opacity="0.3"/>`);
    }
    return parts.join("");
  },

  /* ----------------------------------------------------------------- water */
  waves: (w, h, r, accent, light) => {
    const parts: string[] = [];
    const n = 5 + Math.floor(r() * 4);
    const band = h / n;
    for (let i = 0; i < n; i++) {
      const cy = i * band + band * 0.5;
      const amp = band * (0.25 + r() * 0.3);
      parts.push(
        `<path d="M${(-w * 0.1).toFixed(1)} ${cy.toFixed(1)} q ${(w * 0.15).toFixed(1)} ${(-amp).toFixed(1)} ${(w * 0.3).toFixed(1)} 0 t ${(w * 0.3).toFixed(1)} 0 t ${(w * 0.3).toFixed(1)} 0 t ${(w * 0.3).toFixed(1)} 0" fill="none" stroke="${light}" stroke-opacity="0.2" stroke-width="${(2 + r() * 2).toFixed(1)}" stroke-linecap="round"/>`,
      );
    }
    return parts.join("");
  },
  drops: (w, h, r, accent, light) => {
    const parts: string[] = [];
    for (let i = 0; i < 14; i++) {
      const d = h * (0.02 + r() * 0.07);
      const x = w * (0.05 + r() * 0.9);
      const y = h * (0.05 + r() * 0.9);
      const drop = `M${x.toFixed(1)} ${(y - d * 1.6).toFixed(1)} c ${(d * 0.8).toFixed(1)} ${(d * 1.1).toFixed(1)} ${(d * 0.8).toFixed(1)} ${(d * 1.7).toFixed(1)} 0 ${(d * 1.7).toFixed(1)} c ${(-d * 0.8).toFixed(1)} 0 ${(-d * 0.8).toFixed(1)} ${(-d * 0.6).toFixed(1)} 0 ${(-d * 1.7).toFixed(1)} z`;
      parts.push(`<path d="${drop}" fill="${i % 3 === 0 ? accent : light}" fill-opacity="${(0.1 + r() * 0.16).toFixed(2)}"/>`);
    }
    return parts.join("");
  },
  ripples: (w, h, r, accent, light) => {
    const parts: string[] = [];
    for (let i = 0; i < 4; i++) {
      const cx = w * (0.12 + r() * 0.76);
      const cy = h * (0.15 + r() * 0.7);
      const rings = 3 + Math.floor(r() * 3);
      for (let ring = 1; ring <= rings; ring++) {
        parts.push(
          `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(h * 0.04 * ring * (0.8 + r() * 0.4)).toFixed(1)}" fill="none" stroke="${ring % 2 ? light : accent}" stroke-opacity="${(0.26 - ring * 0.04).toFixed(2)}" stroke-width="${(3 - ring * 0.4).toFixed(1)}"/>`,
        );
      }
    }
    return parts.join("");
  },

  /* ------------------------------------------------------------------ care */
  pulse: (w, h, r, accent, light) => {
    const parts: string[] = [];
    const n = 3 + Math.floor(r() * 3);
    const band = h / (n + 1);
    for (let i = 0; i < n; i++) {
      const cy = (i + 1) * band;
      const amp = band * (0.25 + r() * 0.3);
      const seg = band * 0.22;
      parts.push(
        `<path d="M0 ${cy.toFixed(1)} h ${(w * 0.28).toFixed(1)} l ${seg.toFixed(1)} ${(-amp).toFixed(1)} l ${(seg * 1.1).toFixed(1)} ${(amp * 2).toFixed(1)} l ${seg.toFixed(1)} ${(-amp).toFixed(1)} h ${(w * 0.2).toFixed(1)}" fill="none" stroke="${light}" stroke-opacity="0.22" stroke-width="${(2 + r() * 2).toFixed(1)}" stroke-linejoin="round" stroke-linecap="round"/>`,
      );
    }
    return parts.join("");
  },
  cross: (w, h, r, accent, light) => {
    const parts: string[] = [];
    for (let i = 0; i < 6; i++) {
      const s = h * (0.06 + r() * 0.09);
      const x = w * (0.08 + r() * 0.84);
      const y = h * (0.1 + r() * 0.8);
      const t = s * 0.32;
      parts.push(
        `<path d="M${(x - t / 2).toFixed(1)} ${(y - s / 2).toFixed(1)} h ${t.toFixed(1)} v ${((s - t) / 2).toFixed(1)} h ${((s - t) / 2).toFixed(1)} v ${t.toFixed(1)} h ${(-(s - t) / 2).toFixed(1)} v ${((s - t) / 2).toFixed(1)} h ${(-t).toFixed(1)} v ${(-(s - t) / 2).toFixed(1)} h ${(-(s - t) / 2).toFixed(1)} v ${(-t).toFixed(1)} h ${((s - t) / 2).toFixed(1)} z" fill="${i % 2 ? accent : light}" fill-opacity="${(0.12 + r() * 0.14).toFixed(2)}"/>`,
      );
    }
    return parts.join("");
  },
  arcs: (w, h, r, accent, light) => {
    const parts: string[] = [];
    for (let i = 0; i < 3; i++) {
      const cx = w * (0.15 + r() * 0.7);
      const cy = h * (0.55 + r() * 0.4);
      const rad = h * (0.3 + r() * 0.45);
      for (let ring = 0; ring < 4; ring++) {
        const rr = rad * (1 - ring * 0.22);
        parts.push(
          `<path d="M${(cx - rr).toFixed(1)} ${cy.toFixed(1)} a ${rr.toFixed(1)} ${rr.toFixed(1)} 0 0 1 ${(rr * 2).toFixed(1)} 0" fill="none" stroke="${ring % 2 ? accent : light}" stroke-opacity="${(0.3 - ring * 0.05).toFixed(2)}" stroke-width="${(3 - ring * 0.5).toFixed(1)}" stroke-linecap="round"/>`,
        );
      }
    }
    return parts.join("");
  },

  /* ------------------------------------------------------------------ tech */
  chips: (w, h, r, accent, light) => {
    const parts: string[] = [];
    const cols = 3 + Math.floor(r() * 2);
    const rows = 2 + Math.floor(r() * 2);
    for (let c = 0; c < cols; c++) {
      for (let rr = 0; rr < rows; rr++) {
        const size = h * (0.1 + r() * 0.14);
        const x = w * (0.1 + (c + 0.5) * (0.8 / cols));
        const y = h * (0.12 + (rr + 0.5) * (0.7 / rows));
        parts.push(
          `<rect x="${(x - size / 2).toFixed(1)}" y="${(y - size / 2).toFixed(1)}" width="${size.toFixed(1)}" height="${size.toFixed(1)}" rx="${(size * 0.28).toFixed(1)}" fill="${accent}" fill-opacity="0.14" stroke="${light}" stroke-opacity="0.18" stroke-width="2"/>`,
        );
        parts.push(
          `<path d="M${(x - size * 0.22).toFixed(1)} ${(y - size * 0.05).toFixed(1)} l ${(size * 0.14).toFixed(1)} ${(size * 0.14).toFixed(1)} l ${(size * 0.3).toFixed(1)} ${(-size * 0.3).toFixed(1)}" fill="none" stroke="${light}" stroke-opacity="0.32" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`,
        );
      }
    }
    return parts.join("");
  },
  mesh: (w, h, r, accent, light) => {
    const parts: string[] = [];
    const nodes = Array.from({ length: 9 }, () => ({ x: w * (0.08 + r() * 0.84), y: h * (0.12 + r() * 0.76) }));
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist > w * 0.22) continue;
        parts.push(
          `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${accent}" stroke-opacity="${(0.3 - dist / (w * 1.2)).toFixed(2)}" stroke-width="2"/>`,
        );
      }
    }
    for (const node of nodes) {
      parts.push(`<circle cx="${node.x.toFixed(1)}" cy="${node.y.toFixed(1)}" r="${(h * 0.012).toFixed(1)}" fill="${light}" fill-opacity="0.5"/>`);
      parts.push(`<circle cx="${node.x.toFixed(1)}" cy="${node.y.toFixed(1)}" r="${(h * 0.028).toFixed(1)}" fill="none" stroke="${light}" stroke-opacity="0.16" stroke-width="2"/>`);
    }
    return parts.join("");
  },
  bars: (w, h, r, accent, light) => {
    const parts: string[] = [];
    const count = 7 + Math.floor(r() * 5);
    const gap = w * 0.02;
    const barW = (w * 0.72 - gap * (count - 1)) / count;
    const startX = w * 0.14;
    const base = h * 0.84;
    for (let i = 0; i < count; i++) {
      const bh = h * (0.12 + Math.abs(Math.sin(i * 1.7)) * 0.5 * (0.5 + r() * 0.5));
      const x = startX + i * (barW + gap);
      parts.push(
        `<rect x="${x.toFixed(1)}" y="${(base - bh).toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" rx="${(barW * 0.25).toFixed(1)}" fill="${i % 3 === 0 ? accent : light}" fill-opacity="${(0.16 + r() * 0.14).toFixed(2)}"/>`,
      );
    }
    parts.push(`<line x1="${startX - gap}" y1="${base.toFixed(1)}" x2="${(w * 0.9).toFixed(1)}" y2="${base.toFixed(1)}" stroke="${light}" stroke-opacity="0.22" stroke-width="2"/>`);
    return parts.join("");
  },

  /* ----------------------------------------------------------------- drive */
  streaks: (w, h, r, accent, light) => {
    const parts: string[] = [];
    const n = 5 + Math.floor(r() * 4);
    const band = h / n;
    for (let i = 0; i < n; i++) {
      const y = i * band + band * 0.5;
      const len = w * (0.28 + r() * 0.5);
      const x = w * 0.5 + (r() - 0.5) * w * 0.2;
      parts.push(
        `<rect x="${(x - len / 2).toFixed(1)}" y="${(y - band * 0.03).toFixed(1)}" width="${len.toFixed(1)}" height="${(band * 0.06).toFixed(1)}" rx="${(band * 0.03).toFixed(1)}" fill="${light}" fill-opacity="0.18"/>`,
      );
      parts.push(
        `<circle cx="${x.toFixed(1)}" cy="${(y + band * 0.28).toFixed(1)}" r="${(band * 0.2).toFixed(1)}" fill="none" stroke="${accent}" stroke-opacity="0.22" stroke-width="2.5"/>`,
      );
    }
    return parts.join("");
  },
  road: (w, h, r, accent, light) => {
    const parts: string[] = [];
    const vanishing = { x: w * (0.32 + r() * 0.36), y: h * 0.32 };
    // A road narrowing to the horizon, with dashes that shrink with it.
    parts.push(
      `<path d="M${(vanishing.x - w * 0.04).toFixed(1)} ${vanishing.y.toFixed(1)} L${(w * 1.05).toFixed(1)} ${h} L${(-w * 0.05).toFixed(1)} ${h} Z" fill="${accent}" fill-opacity="0.14"/>`,
    );
    for (let i = 0; i < 7; i++) {
      const t = i / 7;
      const y = vanishing.y + (h - vanishing.y) * t;
      const next = vanishing.y + (h - vanishing.y) * (t + 1 / 7);
      const dw = w * 0.012 * (1 + t * 2.4);
      const dh = (next - y) * 0.5;
      parts.push(
        `<rect x="${(vanishing.x - dw / 2).toFixed(1)}" y="${(y + dh * 0.4).toFixed(1)}" width="${dw.toFixed(1)}" height="${dh.toFixed(1)}" rx="${(dw / 2).toFixed(1)}" fill="${light}" fill-opacity="${(0.14 + t * 0.2).toFixed(2)}"/>`,
      );
    }
    for (const side of [-1, 1]) {
      parts.push(
        `<line x1="${(vanishing.x + side * w * 0.05).toFixed(1)}" y1="${vanishing.y.toFixed(1)}" x2="${(vanishing.x + side * w * 0.55).toFixed(1)}" y2="${h}" stroke="${light}" stroke-opacity="0.2" stroke-width="3"/>`,
      );
    }
    return parts.join("");
  },
  gauge: (w, h, r, accent, light) => {
    const parts: string[] = [];
    const cx = w * (0.3 + r() * 0.4);
    const cy = h * (0.55 + r() * 0.25);
    const rad = h * (0.32 + r() * 0.22);
    for (let ring = 0; ring < 4; ring++) {
      const rr = rad * (1 - ring * 0.2);
      const sweep = 0.6 + r() * 0.9;
      const endX = cx + rr * Math.cos(Math.PI * (1 - sweep));
      const endY = cy - rr * Math.sin(Math.PI * (1 - sweep));
      parts.push(
        `<path d="M${(cx - rr).toFixed(1)} ${cy.toFixed(1)} a ${rr.toFixed(1)} ${rr.toFixed(1)} 0 0 1 ${(endX - (cx - rr)).toFixed(1)} ${(endY - cy).toFixed(1)}" fill="none" stroke="${ring % 2 ? accent : light}" stroke-opacity="${(0.3 - ring * 0.05).toFixed(2)}" stroke-width="${(4 - ring * 0.6).toFixed(1)}" stroke-linecap="round"/>`,
      );
    }
    const needle = -0.9 + r() * 1.8;
    parts.push(
      `<line x1="${cx.toFixed(1)}" y1="${cy.toFixed(1)}" x2="${(cx + rad * 0.82 * Math.cos(needle)).toFixed(1)}" y2="${(cy - rad * 0.82 * Math.sin(needle)).toFixed(1)}" stroke="${light}" stroke-opacity="0.55" stroke-width="4" stroke-linecap="round"/>`,
    );
    parts.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(rad * 0.07).toFixed(1)}" fill="${light}" fill-opacity="0.5"/>`);
    return parts.join("");
  },

  /* ----------------------------------------------------------------- craft */
  discs: (w, h, r, accent, light) => {
    const parts: string[] = [];
    const n = 5 + Math.floor(r() * 4);
    const band = h / n;
    for (let i = 0; i < n; i++) {
      const y = i * band + band * 0.5;
      const x = w * 0.5 + (r() - 0.5) * w * 0.2;
      const rad = band * (0.24 + r() * 0.18);
      parts.push(
        `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad.toFixed(1)}" fill="${accent}" fill-opacity="0.13" stroke="${light}" stroke-opacity="0.18" stroke-width="2"/>`,
      );
      parts.push(
        `<circle cx="${(x + rad * 0.5).toFixed(1)}" cy="${(y + rad * 0.35).toFixed(1)}" r="${(rad * 0.55).toFixed(1)}" fill="${light}" fill-opacity="0.1"/>`,
      );
    }
    return parts.join("");
  },
  stack: (w, h, r, accent, light) => {
    const parts: string[] = [];
    for (let i = 0; i < 4; i++) {
      const bw = w * (0.3 + r() * 0.45);
      const bh = h * (0.06 + r() * 0.1);
      const x = w * 0.5 - bw / 2 + (r() - 0.5) * w * 0.12;
      const y = h * (0.2 + i * 0.16);
      const tone = i % 2 ? light : accent;
      parts.push(
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="${(bh * 0.35).toFixed(1)}" fill="${tone}" fill-opacity="${(0.16 + r() * 0.14).toFixed(2)}"/>`,
      );
      // A taller lid line on each stack, like a shelf of goods.
      parts.push(
        `<rect x="${(x + bw * 0.12).toFixed(1)}" y="${(y - bh * 0.5).toFixed(1)}" width="${(bw * 0.76).toFixed(1)}" height="${(bh * 0.22).toFixed(1)}" rx="${(bh * 0.11).toFixed(1)}" fill="${light}" fill-opacity="0.12"/>`,
      );
    }
    return parts.join("");
  },
  spark: (w, h, r, accent, light) => {
    const parts: string[] = [];
    for (let i = 0; i < 7; i++) {
      const cx = w * (0.1 + r() * 0.8);
      const cy = h * (0.12 + r() * 0.76);
      const len = h * (0.04 + r() * 0.11);
      const wide = len * (0.18 + r() * 0.14);
      parts.push(
        `<path d="M${cx.toFixed(1)} ${(cy - len).toFixed(1)} q ${wide.toFixed(1)} ${(len - wide).toFixed(1)} ${wide.toFixed(1)} ${len.toFixed(1)} q ${(-wide).toFixed(1)} ${wide.toFixed(1)} ${(-wide).toFixed(1)} ${len.toFixed(1)} q ${(-wide).toFixed(1)} ${(-(len - wide)).toFixed(1)} ${(-wide).toFixed(1)} ${(-len).toFixed(1)} q ${wide.toFixed(1)} ${(-wide).toFixed(1)} ${wide.toFixed(1)} ${(-len).toFixed(1)} z" fill="${i % 2 ? accent : light}" fill-opacity="${(0.14 + r() * 0.18).toFixed(2)}"/>`,
      );
    }
    return parts.join("");
  },
};

/** The drawing a scene falls back to when a variant name is unknown. */
function defaultDrawing(scene: SceneKind): string {
  return MOTIF_VARIANTS[scene]?.[0] ?? "discs";
}

function motif(scene: SceneKind, variant: string, w: number, h: number, r: () => number, accent: string, light: string): string {
  const draw = DRAWINGS[variant] ?? DRAWINGS[defaultDrawing(scene)] ?? DRAWINGS.discs;
  return draw(w, h, r, accent, light);
}

/**
 * A poster for one business. Pure: no I/O, no Date, no randomness beyond the
 * seed, so the same call always returns the same bytes (which is what lets it be
 * cached aggressively and compared in tests).
 */
export function posterSvg({
  seed, scene, colors, ratio = "wide", index = 0,
  treatment = "plain", radius = "rounded", motion = 2, variant, section,
}: ArtInput): string {
  const { w, h } = SIZES[ratio];
  const level = Math.max(0, Math.min(4, motion));
  // Where the picture is used is part of its identity: the hero and the gallery
  // tile of one business would otherwise be the same drawing.
  const scope = section ? `${section}::` : "";
  const r = rng(seedFrom(`${seed}::art::${scope}${index}`));
  const drawing = pickVariant(scene, { variant, index, seed, section });
  const primary = esc(colors[0] || "#0f766e");
  const secondary = esc(colors[1] || "#042f2e");
  const accent = esc(colors[2] || "#f59e0b");
  const light = "#ffffff";

  // Two soft lights, positioned differently per business.
  const gx1 = 0.15 + r() * 0.5;
  const gy1 = 0.1 + r() * 0.4;
  const gx2 = 0.45 + r() * 0.5;
  const gy2 = 0.6 + r() * 0.35;
  const angle = Math.floor(r() * 60);

  // Slow motion, drawn from the same seed as the shapes, so no two businesses
  // move alike. Written as CSS inside the SVG: it keeps animating when the file
  // is used in an <img> (scripts would not run there, styles do), it costs no
  // JavaScript on the tenant's page, and it turns itself off for anyone who has
  // asked their device for reduced motion.
  // Intensity from the genome: 0–1 paints a still poster, 2 is the normal
  // tempo, 3 is a little livelier. The rates stay seeded, so two businesses at
  // the same intensity still move differently.
  const tempo = level <= 1 ? 0 : level >= 3 ? 0.8 : 1;
  const animated = tempo > 0;
  const d1 = ((13 + r() * 9) * tempo).toFixed(1);
  const d2 = ((17 + r() * 11) * tempo).toFixed(1);
  const d3 = ((22 + r() * 14) * tempo).toFixed(1);
  const dx = (16 + r() * 34).toFixed(0);
  const dy = (10 + r() * 26).toFixed(0);
  const spin = ((r() < 0.5 ? -1 : 1) * (1 + r() * 2)).toFixed(2);
  const style = !animated
    ? ""
    : `<style>` +
    `@keyframes ws-a{from{transform:translate(0,0)}to{transform:translate(${dx}px,${dy}px)}}` +
    `@keyframes ws-b{from{transform:translate(0,0)}to{transform:translate(-${dx}px,${dy}px)}}` +
    `@keyframes ws-m{from{transform:translate(0,0) rotate(0deg)}to{transform:translate(${dy}px,${(-Number(dx) / 2).toFixed(0)}px) rotate(${spin}deg)}}` +
    `.ws-g1{animation:ws-a ${d1}s ease-in-out infinite alternate}` +
    `.ws-g2{animation:ws-b ${d2}s ease-in-out infinite alternate}` +
    `.ws-m{animation:ws-m ${d3}s ease-in-out infinite alternate;transform-origin:50% 50%}` +
    `@media (prefers-reduced-motion:reduce){.ws-g1,.ws-g2,.ws-m{animation:none}}` +
    `</style>`;

  // --- how the genome finishes the picture -----------------------------------
  // Each treatment is a visible difference on the page, not a flag: a framed
  // poster gets an inset border whose corner radius follows the site's own
  // radius, a duotone poster is washed in the brand colour, soft focus blurs
  // the lights, and plain leaves the geometry alone.
  const soften = treatment === "soft-focus";
  const frameInset = Math.round(h * 0.035);
  const frameRadius =
    radius === "sharp" ? 2 : radius === "pill" ? Math.round(h * 0.08) : Math.round(h * 0.03);

  const finish: string[] = [];
  if (soften) {
    finish.push(`<filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${(h * 0.03).toFixed(0)}"/></filter>`);
  }
  if (treatment === "duotone") {
    finish.push(`<rect width="${w}" height="${h}" fill="${primary}" fill-opacity="0.26"/>`);
    finish.push(
      `<path d="M0 ${h * 0.72} L${w} ${h * 0.42} L${w} ${h} L0 ${h} Z" fill="${accent}" fill-opacity="0.16"/>`,
    );
  }
  if (treatment === "framed") {
    finish.push(
      `<rect x="${frameInset}" y="${frameInset}" width="${w - frameInset * 2}" height="${h - frameInset * 2}" rx="${frameRadius}" fill="none" stroke="${light}" stroke-opacity="0.3" stroke-width="3"/>`,
    );
    finish.push(
      `<rect x="${frameInset * 2}" y="${frameInset * 2}" width="${w - frameInset * 4}" height="${h - frameInset * 4}" rx="${Math.round(frameRadius * 0.6)}" fill="none" stroke="${accent}" stroke-opacity="0.22" stroke-width="1.5"/>`,
    );
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" preserveAspectRatio="xMidYMid slice">`,
    `<defs>`,
    `<linearGradient id="bg" gradientTransform="rotate(${angle} 0.5 0.5)">`,
    `<stop offset="0%" stop-color="${secondary}"/>`,
    `<stop offset="100%" stop-color="${primary}"/>`,
    `</linearGradient>`,
    `<radialGradient id="g1"><stop offset="0%" stop-color="${accent}" stop-opacity="0.55"/><stop offset="100%" stop-color="${accent}" stop-opacity="0"/></radialGradient>`,
    `<radialGradient id="g2"><stop offset="0%" stop-color="${light}" stop-opacity="0.28"/><stop offset="100%" stop-color="${light}" stop-opacity="0"/></radialGradient>`,
    `</defs>`,
    style,
    `<rect width="${w}" height="${h}" fill="url(#bg)"/>`,
    `<g${soften ? ' filter="url(#soft)"' : ""}>`,
    `<circle class="ws-g1" cx="${(gx1 * w).toFixed(0)}" cy="${(gy1 * h).toFixed(0)}" r="${(h * 0.62).toFixed(0)}" fill="url(#g1)"/>`,
    `<circle class="ws-g2" cx="${(gx2 * w).toFixed(0)}" cy="${(gy2 * h).toFixed(0)}" r="${(h * 0.5).toFixed(0)}" fill="url(#g2)"/>`,
    `</g>`,
    `<g class="ws-m" data-motif="${esc(drawing)}">${motif(scene, drawing, w, h, r, accent, light)}</g>`,
    ...finish,
    `</svg>`,
  ].join("");
}

/**
 * Where a business's poster is served from. Stable, so it can be cached.
 *
 * `section` names where the picture is used (hero / about / gallery / cta) and
 * `variant` pins the drawing; both go into the seed, so one business's four
 * images are four different pictures. Sections are written into every URL the
 * generator produces — a page whose hero, about and gallery were all the same
 * drawing was the complaint this answers.
 */
export function posterUrl(
  slug: string,
  ratio: ArtRatio = "wide",
  index = 0,
  options: { section?: ArtSection; variant?: MotifVariant | string } = {},
): string {
  const q = new URLSearchParams();
  if (ratio !== "wide") q.set("r", ratio);
  if (index) q.set("i", String(index));
  if (options.section) q.set("s", options.section);
  if (options.variant) q.set("v", options.variant);
  const suffix = q.toString() ? `?${q}` : "";
  return `/api/art/${encodeURIComponent(slug)}.svg${suffix}`;
}

/**
 * The places a poster is used on a page. Kept to a fixed list because the value
 * ends up in a URL and in the seed: an open-ended string from the browser would
 * be an unbounded cache key.
 */
export type ArtSection = "hero" | "about" | "gallery" | "cta" | "services" | "products" | "cover";

export const ART_SECTIONS: readonly ArtSection[] = ["hero", "about", "gallery", "cta", "services", "products", "cover"];

/**
 * The generated picture for one place on a page.
 *
 * Takes the business itself (or just its slug) so a caller that already holds
 * the business does not have to dig the slug out first. Returns undefined when
 * there is no slug yet — a site still being drafted — so a caller can fall back
 * to an icon or to the owner's own photo with no special cases. The slug is
 * also the seed, so it is the same set of drawings on every render and in every
 * process.
 */
export function sectionArt(
  business: Business | string | null | undefined,
  section: ArtSection,
  index = 0,
  options: { ratio?: ArtRatio; variant?: MotifVariant | string } = {},
): string | undefined {
  const slug = (typeof business === "string" ? business : business?.slug ?? "").trim();
  if (!slug) return undefined;
  return posterUrl(slug, options.ratio ?? ratioForSection(section), index, {
    section,
    variant: options.variant,
  });
}

/** The ratio a section wants when the caller has no opinion. */
export function ratioForSection(section: ArtSection): ArtRatio {
  if (section === "about") return "portrait";
  if (section === "gallery") return "square";
  return "wide";
}

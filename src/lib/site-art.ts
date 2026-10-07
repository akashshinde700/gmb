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

export type ArtRatio = "wide" | "square" | "portrait";

const SIZES: Record<ArtRatio, { w: number; h: number }> = {
  wide: { w: 1600, h: 900 },
  square: { w: 1200, h: 1200 },
  portrait: { w: 900, h: 1200 },
};

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
function motif(scene: SceneKind, w: number, h: number, r: () => number, accent: string, light: string): string {
  const parts: string[] = [];
  const n = 5 + Math.floor(r() * 4); // 5–8 repetitions
  const band = h / n;

  for (let i = 0; i < n; i++) {
    const y = i * band + band * 0.5;
    const shift = (r() - 0.5) * w * 0.12;
    const scale = 0.7 + r() * 0.6;
    const x = w * 0.5 + shift;

    switch (scene) {
      case "build": {
        // Skyline: blocks of varying height standing on one ground line, with
        // windows punched out — a city, not a stack of cards.
        const ground = h * 0.94;
        const bw = band * (0.9 + r() * 1.6);
        const bh = h * (0.16 + r() * 0.52) * scale;
        const bx = w * 0.08 + r() * w * 0.84 - bw / 2;
        const by = ground - bh;
        parts.push(
          `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="${(bw * 0.05).toFixed(1)}" fill="${accent}" fill-opacity="0.16" stroke="${light}" stroke-opacity="0.18" stroke-width="2"/>`,
        );
        const cols = 3 + Math.floor(r() * 2);
        const rows = 3 + Math.floor(r() * 2);
        for (let c = 0; c < cols; c++) {
          for (let rr = 0; rr < rows; rr++) {
            parts.push(
              `<rect x="${(bx + bw * (0.14 + c * (0.72 / cols))).toFixed(1)}" y="${(by + bh * (0.14 + rr * (0.7 / rows))).toFixed(1)}" width="${(bw * (0.5 / cols)).toFixed(1)}" height="${(bh * (0.4 / rows)).toFixed(1)}" fill="${light}" fill-opacity="${(0.1 + r() * 0.12).toFixed(2)}"/>`,
            );
          }
        }
        break;
      }
      case "water": {
        // Stacked waves.
        const cy = y;
        const amp = band * 0.35 * scale;
        parts.push(
          `<path d="M${(-w * 0.1).toFixed(1)} ${cy.toFixed(1)} q ${(w * 0.15).toFixed(1)} ${(-amp).toFixed(1)} ${(w * 0.3).toFixed(1)} 0 t ${(w * 0.3).toFixed(1)} 0 t ${(w * 0.3).toFixed(1)} 0 t ${(w * 0.3).toFixed(1)} 0" fill="none" stroke="${light}" stroke-opacity="0.2" stroke-width="${(2 + scale * 2).toFixed(1)}" stroke-linecap="round"/>`,
        );
        const d = band * 0.5 * scale;
        parts.push(
          `<path d="M${x.toFixed(1)} ${(cy - d).toFixed(1)} c ${(d * 0.6).toFixed(1)} ${(d * 0.7).toFixed(1)} ${(d * 0.6).toFixed(1)} ${(d * 1.2).toFixed(1)} 0 ${(d * 1.2).toFixed(1)} c ${(-d * 0.6).toFixed(1)} 0 ${(-d * 0.6).toFixed(1)} ${(-d * 0.5).toFixed(1)} 0 ${(-d * 1.2).toFixed(1)} z" fill="${accent}" fill-opacity="0.14"/>`,
        );
        break;
      }
      case "care": {
        // Pulse line with a soft node.
        const cy = y;
        const amp = band * 0.3 * scale;
        parts.push(
          `<path d="M0 ${cy.toFixed(1)} h ${(w * 0.28).toFixed(1)} l ${(band * 0.2).toFixed(1)} ${(-amp).toFixed(1)} l ${(band * 0.22).toFixed(1)} ${(amp * 2).toFixed(1)} l ${(band * 0.2).toFixed(1)} ${(-amp).toFixed(1)} h ${(w * 0.2).toFixed(1)}" fill="none" stroke="${light}" stroke-opacity="0.22" stroke-width="${(2 + scale * 2).toFixed(1)}" stroke-linejoin="round" stroke-linecap="round"/>`,
        );
        parts.push(`<circle cx="${x.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(band * 0.18 * scale).toFixed(1)}" fill="${accent}" fill-opacity="0.18"/>`);
        break;
      }
      case "tech": {
        // Grid of rounded chips, like cards on a canvas.
        const s = band * 0.62 * scale;
        parts.push(
          `<rect x="${(x - s / 2).toFixed(1)}" y="${(y - s / 2).toFixed(1)}" width="${s.toFixed(1)}" height="${s.toFixed(1)}" rx="${(s * 0.28).toFixed(1)}" fill="${accent}" fill-opacity="0.14" stroke="${light}" stroke-opacity="0.16" stroke-width="2"/>`,
        );
        parts.push(
          `<path d="M${(x - s * 0.22).toFixed(1)} ${(y - s * 0.05).toFixed(1)} l ${(s * 0.14).toFixed(1)} ${(s * 0.14).toFixed(1)} l ${(s * 0.3).toFixed(1)} ${(-s * 0.3).toFixed(1)}" fill="none" stroke="${light}" stroke-opacity="0.3" stroke-width="${(2 + scale).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`,
        );
        break;
      }
      case "drive": {
        // Motion streaks with a wheel disc.
        const len = w * (0.28 + r() * 0.45);
        parts.push(
          `<rect x="${(x - len / 2).toFixed(1)}" y="${(y - band * 0.03).toFixed(1)}" width="${len.toFixed(1)}" height="${(band * 0.06).toFixed(1)}" rx="${(band * 0.03).toFixed(1)}" fill="${light}" fill-opacity="0.18"/>`,
        );
        const rad = band * 0.22 * scale;
        parts.push(
          `<circle cx="${x.toFixed(1)}" cy="${(y + band * 0.28).toFixed(1)}" r="${rad.toFixed(1)}" fill="none" stroke="${accent}" stroke-opacity="0.22" stroke-width="${(2 + scale).toFixed(1)}"/>`,
        );
        break;
      }
      default: {
        // craft / retail / hospitality: overlapping product discs.
        const rad = band * 0.3 * scale;
        parts.push(
          `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad.toFixed(1)}" fill="${accent}" fill-opacity="0.13" stroke="${light}" stroke-opacity="0.16" stroke-width="2"/>`,
        );
        parts.push(
          `<circle cx="${(x + rad * 0.5).toFixed(1)}" cy="${(y + rad * 0.35).toFixed(1)}" r="${(rad * 0.55).toFixed(1)}" fill="${light}" fill-opacity="0.1"/>`,
        );
        break;
      }
    }
  }
  return parts.join("");
}

/**
 * A poster for one business. Pure: no I/O, no Date, no randomness beyond the
 * seed, so the same call always returns the same bytes (which is what lets it be
 * cached aggressively and compared in tests).
 */
export function posterSvg({
  seed, scene, colors, ratio = "wide", index = 0,
  treatment = "plain", radius = "rounded", motion = 2,
}: ArtInput): string {
  const { w, h } = SIZES[ratio];
  const level = Math.max(0, Math.min(4, motion));
  const r = rng(seedFrom(`${seed}::art::${index}`));
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
    `<g class="ws-m">${motif(scene, w, h, r, accent, light)}</g>`,
    ...finish,
    `</svg>`,
  ].join("");
}

/** Where a business's poster is served from. Stable, so it can be cached. */
export function posterUrl(slug: string, ratio: ArtRatio = "wide", index = 0): string {
  const q = new URLSearchParams();
  if (ratio !== "wide") q.set("r", ratio);
  if (index) q.set("i", String(index));
  const suffix = q.toString() ? `?${q}` : "";
  return `/api/art/${encodeURIComponent(slug)}.svg${suffix}`;
}

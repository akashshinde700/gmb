// WebSetu — bring a design in from Figma.
//
// lib/site-import.ts takes the **content** of an owner's old website and
// deliberately leaves its design behind ("the new site does not look like the
// old one"). This file is the mirror image: it reads the **design system** of a
// Figma file — the colours, the type, the corners, the shadows, the buttons,
// the rhythm — and the order of the frames down the page, and leaves the
// content behind. An owner who has a designer (or who designed it themselves)
// should not have to describe the design to a form.
//
// Three rules hold everywhere below.
//
//   1. Never invent. Every value returned here was present in the file — a fill
//      a node actually carries, a font a text node actually uses, a frame that
//      is actually named "Hero". Where the file does not say, the answer is
//      "not detected" and the site keeps what it had; nothing is guessed.
//   2. The owner's own words, photos and colours are not ours to move. A
//      Figma file's palette is *offered* (and only applied when the owner asks
//      for it by name), exactly like a restyle: the content and the chosen
//      colours survive an import.
//   3. Deterministic. The same file read twice produces the same design, and
//      the same design applied to the same site produces the same page, so an
//      import can be explained afterwards and undone with one version rollback.
//
// The network is only touched in `fetchFigmaFile`; everything else is pure, so
// the whole mapping is testable without a Figma account (see tests/figma.test.mts
// and the stub server the live probe points FIGMA_API_BASE at).

import type { SectionType, SiteSection } from "@/lib/types";
import {
  sectionPlanFor,
  type ButtonChoice,
  type DesignTokens,
  type FontChoice,
  type FooterChoice,
  type HeaderChoice,
  type ImageTreatment,
  type RadiusChoice,
  type SectionChoice,
  type ShadowChoice,
  type SpacingChoice,
} from "@/lib/design-dna";

/* ------------------------------------------------------------------- types */

export interface FigmaUrl {
  key: string;
  /** `node-id` from the query string, normalised to the API's `1:2` form. */
  nodeId?: string;
  /** Which kind of Figma link this was — the file API is the same for all. */
  kind: "file" | "design" | "proto";
}

/** The parts of Figma's file JSON this module reads. Everything is optional:
 *  a file that is missing half of it must still produce a usable answer. */
interface FigmaPaint {
  type?: string;
  visible?: boolean;
  opacity?: number;
  color?: { r?: number; g?: number; b?: number };
  gradientStops?: { color?: { r?: number; g?: number; b?: number } }[];
}

interface FigmaEffect {
  type?: string;
  visible?: boolean;
  radius?: number;
  offset?: { x?: number; y?: number };
}

interface FigmaNode {
  id?: string;
  name?: string;
  type?: string;
  children?: FigmaNode[];
  fills?: FigmaPaint[];
  strokes?: FigmaPaint[];
  strokeWeight?: number;
  effects?: FigmaEffect[];
  cornerRadius?: number;
  rectangleCornerRadii?: number[];
  itemSpacing?: number;
  paddingLeft?: number;
  paddingTop?: number;
  layoutMode?: string;
  style?: { fontFamily?: string; fontSize?: number; fontWeight?: number };
  styles?: Record<string, string>;
  absoluteBoundingBox?: { width?: number; height?: number };
}

export interface FigmaFileJson {
  name?: string;
  lastModified?: string;
  document?: FigmaNode;
  styles?: Record<string, { name?: string; styleType?: string }>;
}

/** What a Figma file says about its own design, before any mapping. */
export interface FigmaDesign {
  fileName: string;
  /** Hex colours found in fills, most-used first, with the name that carried
   *  them (a published style's name beats a layer name). */
  colors: { hex: string; count: number; name: string }[];
  /** Text families found, most-used first. */
  fonts: { family: string; count: number }[];
  /** Corner radii seen on rectangles and frames, in px. */
  radii: number[];
  /** Drop shadows seen, as {blur, offsetY}. */
  shadows: { blur: number; offsetY: number }[];
  /** Auto-layout spacing and padding values, in px. */
  spacing: number[];
  /** Nodes whose name says "button", with how they are painted. */
  buttons: { paint: "solid" | "outline" | "gradient" | "soft"; radius: number; height: number }[];
  /** Top-level frames in document order — the page as the designer laid it out. */
  frames: string[];
  /** Every published style name in the file. */
  styleNames: string[];
  nodeCount: number;
}

export interface FigmaPalette {
  primary?: string;
  secondary?: string;
  accent?: string;
}

export interface FigmaRead {
  design: FigmaDesign;
  /** The tokens we can justify, and only those. */
  tokens: Partial<Omit<DesignTokens, "styleName">>;
  /** Which theme keys the file decided, one line each, for the owner to read. */
  notes: string[];
  /** Colours to offer (never applied unless asked for). */
  palette: FigmaPalette;
  /** The page's own section order, mapped to our section types. */
  sectionPlan: SectionChoice[];
  /** Frames we recognised as sections, in order, for the change list. */
  framePlan: string[];
  /** How much of a design system this file actually gave us. */
  confidence: "strong" | "partial" | "weak";
  styleName: string;
}

/* ------------------------------------------------------------- url parsing */

/**
 * Read a Figma link the way a person copies it out of the app.
 *
 * Accepts `/file/`, `/design/` and `/proto/` links, with or without a name
 * segment, with or without `?node-id=`, and a bare key as a last resort. A
 * `/board/` or a community link is refused rather than guessed at: those fetch
 * HTML, not the file API.
 */
export function parseFigmaUrl(input: string): FigmaUrl | null {
  const raw = String(input || "").trim();
  if (!raw) return null;

  // A bare key: Figma keys are 22-ish characters of letters and digits.
  if (/^[A-Za-z0-9]{10,64}$/.test(raw)) return { key: raw, kind: "file" };

  let url: URL;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (host !== "figma.com" && !host.endsWith(".figma.com")) return null;

  const parts = url.pathname.split("/").filter(Boolean);
  const kind = parts[0];
  if (kind !== "file" && kind !== "design" && kind !== "proto") return null;
  const key = parts[1] ?? "";
  if (!/^[A-Za-z0-9]{10,64}$/.test(key)) return null;

  // Figma writes node ids with a dash in the query string and a colon in the
  // API. Both spellings arrive here.
  const node = (url.searchParams.get("node-id") || "").replace("-", ":").trim();
  return { key, kind, ...(node && /^\d+:\d+$/.test(node) ? { nodeId: node } : {}) };
}

/** Where the Figma API lives. Overridable so a test can point it at a stub. */
export function figmaApiBase(): string {
  return (process.env.FIGMA_API_BASE || "https://api.figma.com").replace(/\/$/, "");
}

export class FigmaError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "FigmaError";
    this.status = status;
  }
}

const MAX_BYTES = 6_000_000;
const TIMEOUT_MS = 15_000;

/**
 * Fetch one file from Figma's REST API and return the parts we read.
 *
 * Depth is capped: the design system lives on the first three levels (the page,
 * its frames, and what is inside them) and pulling a 200-screen file whole
 * would be slow for no gain. The token is the caller's own, sent from the
 * server and never to the browser.
 */
export async function fetchFigmaFile(key: string, token: string, depth = 4): Promise<FigmaFileJson> {
  if (!token) throw new FigmaError("Connect a Figma token first", 400);
  const url = `${figmaApiBase()}/v1/files/${encodeURIComponent(key)}?depth=${depth}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "X-Figma-Token": token },
      signal: controller.signal,
      cache: "no-store",
    });
  } catch {
    clearTimeout(timer);
    throw new FigmaError("Figma did not answer — try again in a moment", 502);
  }
  clearTimeout(timer);

  if (res.status === 401 || res.status === 403) {
    throw new FigmaError("Figma refused that token — check it has access to this file", 401);
  }
  if (res.status === 404) {
    throw new FigmaError("Figma has no file with that link — check the link or its sharing setting", 404);
  }
  if (res.status === 429) {
    throw new FigmaError("Figma is rate-limiting this token — wait a minute and try again", 429);
  }
  if (!res.ok) throw new FigmaError(`Figma answered ${res.status}`, 502);

  const text = await res.text();
  if (text.length > MAX_BYTES) throw new FigmaError("That file is too large to read", 413);
  try {
    return JSON.parse(text) as FigmaFileJson;
  } catch {
    throw new FigmaError("Figma answered with something that is not a file", 502);
  }
}

/* ------------------------------------------------------------ colour maths */

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** A Figma colour channel (0…1 float) as a #rrggbb string. */
export function hexFromChannel(color: { r?: number; g?: number; b?: number } | undefined): string | null {
  if (!color) return null;
  const { r, g, b } = color;
  if (typeof r !== "number" || typeof g !== "number" || typeof b !== "number") return null;
  const to = (v: number) => clamp(Math.round(v * 255), 0, 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** Hue/saturation/lightness of a #rrggbb colour, each 0…1 (hue 0…360). */
export function hslOf(hex: string): { h: number; s: number; l: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { h: 0, s: 0, l: 0 };
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

/** Contrast ratio between two colours, WCAG-style (1…21). */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return 0;
    const int = parseInt(m[1], 16);
    const channel = (v: number) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel((int >> 16) & 255) + 0.7152 * channel((int >> 8) & 255) + 0.0722 * channel(int & 255);
  };
  const la = lum(a);
  const lb = lum(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/* --------------------------------------------------------- reading a file */

const SECTION_WORDS: [SectionType, RegExp][] = [
  // Word boundaries everywhere a short word would otherwise match inside a
  // longer one: "Rectangle 41" contains "cta", and a frame called "Preview" is
  // not a testimonial.
  ["hero", /\bhero\b|\bbanner\b|\bcover\b|masthead|headline|splash/i],
  ["about", /\babout\b|\bstory\b|who we are|our story|\bcompany\b|\bintro\b/i],
  ["services", /\bservices?\b|what we do|offerings|\bsolutions?\b|treatment|menu of/i],
  ["products", /\bproducts?\b|\bshop\b|\bstore\b|catalog|collection|\bmenu\b|\bitems?\b|pricing|\bplans?\b/i],
  ["gallery", /\bgallery\b|\bworks?\b|\bwork\b|portfolio|\bprojects?\b|\bphotos?\b|lookbook|before/i],
  ["testimonials", /testimonial|\breviews?\b|client say|feedback|praise|rating/i],
  ["faq", /\bfaq\b|\bquestions?\b|\banswers?\b|\bhelp\b/i],
  ["stats", /\bstats?\b|\bnumbers?\b|metric|counter|impact|by the numbers/i],
  ["whyUs", /\bwhy\b|benefit|advantage|difference|us vs/i],
  ["hours", /\bhours\b|timing|opening|schedule|visit us|\blocation\b|\bmap\b|find us|\baddress\b/i],
  ["blog", /\bblog\b|\bnews\b|article|\blatest\b|insight|\bupdates?\b/i],
  ["payment", /\bpayment\b|\bupi\b|pay online|checkout/i],
  ["cta", /\bctas?\b|call to action|get in touch|\bcontacts?\b|enquir|book now|start now|\bcontact\b/i],
];

/** Which section type a frame name looks like, or null when it is none of them. */
export function sectionTypeFromName(name: string): SectionType | null {
  const clean = String(name || "").trim();
  if (!clean) return null;
  for (const [type, pattern] of SECTION_WORDS) {
    // "Contact" alone is the contact block; "footer" is chrome, not a section.
    if (/^(footer|nav|navbar|header|menu bar)$/i.test(clean)) return null;
    if (pattern.test(clean)) return type;
  }
  return null;
}

function radiusOf(node: FigmaNode): number | null {
  if (typeof node.cornerRadius === "number") return node.cornerRadius;
  const radii = node.rectangleCornerRadii;
  if (Array.isArray(radii) && radii.length) {
    const nums = radii.filter((r): r is number => typeof r === "number");
    if (nums.length) return nums.reduce((a, b) => a + b, 0) / nums.length;
  }
  return null;
}

function paintKind(node: FigmaNode): "solid" | "outline" | "gradient" | "soft" | null {
  const fills = (node.fills ?? []).filter((f) => f && f.visible !== false);
  const gradient = fills.some((f) => (f.type ?? "").startsWith("GRADIENT"));
  if (gradient) return "gradient";
  const solid = fills.find((f) => (f.type ?? "SOLID") === "SOLID");
  if (solid) {
    const hex = hexFromChannel(solid.color);
    if (!hex) return null;
    const { l } = hslOf(hex);
    if ((solid.opacity ?? 1) < 0.35) return "soft";
    return l > 0.82 ? "soft" : "solid";
  }
  const strokes = (node.strokes ?? []).filter((s) => s && s.visible !== false);
  if (strokes.length) return "outline";
  return null;
}

/**
 * Walk the file and collect what it says about its own design.
 *
 * Pure and defensive: Figma's JSON is wide and versioned, a partial file must
 * never throw, and anything we cannot read is simply not counted.
 */
export function readFigmaDesign(file: FigmaFileJson): FigmaDesign {
  const styleNamesById = new Map<string, string>();
  for (const [id, style] of Object.entries(file.styles ?? {})) {
    if (style?.name) styleNamesById.set(id, style.name);
  }

  const colors = new Map<string, { hex: string; count: number; name: string }>();
  const fonts = new Map<string, number>();
  const radii: number[] = [];
  const shadows: { blur: number; offsetY: number }[] = [];
  const spacing: number[] = [];
  const buttons: FigmaDesign["buttons"] = [];
  const frames: string[] = [];
  let nodeCount = 0;

  const walk = (node: FigmaNode, depth: number) => {
    if (!node || typeof node !== "object") return;
    nodeCount += 1;
    const name = String(node.name ?? "");

    // Colours: a published style's name beats a layer name, so
    // "Primary/500" on a button reads as the palette rather than "Rectangle 12".
    const styleName = node.styles?.fill ? styleNamesById.get(node.styles.fill) : undefined;
    for (const fill of node.fills ?? []) {
      if (!fill || fill.visible === false) continue;
      if ((fill.opacity ?? 1) < 0.1) continue;
      const hex = fill.type && fill.type.startsWith("GRADIENT")
        ? hexFromChannel(fill.gradientStops?.[0]?.color)
        : hexFromChannel(fill.color);
      if (!hex || hex === "#ffffff" || hex === "#000000") continue;
      // A very light fill is a card or a page, never a brand colour; counting
      // them would fill the palette with near-whites and bury the real ones.
      if (hslOf(hex).l >= 0.94) continue;
      const key = hex.toLowerCase();
      const existing = colors.get(key);
      if (existing) {
        existing.count += 1;
        if (styleName && !existing.name.includes("/")) existing.name = styleName;
      } else {
        colors.set(key, { hex: key, count: 1, name: styleName ?? name });
      }
    }

    if (node.type === "TEXT" && node.style?.fontFamily) {
      const family = String(node.style.fontFamily).trim();
      if (family) fonts.set(family, (fonts.get(family) ?? 0) + 1);
    }

    const radius = radiusOf(node);
    if (radius !== null && Number.isFinite(radius)) radii.push(radius);

    for (const effect of node.effects ?? []) {
      if (!effect || effect.visible === false) continue;
      if (effect.type !== "DROP_SHADOW") continue;
      shadows.push({ blur: Number(effect.radius ?? 0), offsetY: Number(effect.offset?.y ?? 0) });
    }

    if (typeof node.itemSpacing === "number" && node.itemSpacing > 0) spacing.push(node.itemSpacing);
    if (typeof node.paddingTop === "number" && node.paddingTop > 0) spacing.push(node.paddingTop);

    if (/button|btn|cta/i.test(name)) {
      const paint = paintKind(node);
      const box = node.absoluteBoundingBox ?? {};
      if (paint) {
        buttons.push({
          paint,
          radius: radius ?? 0,
          height: Number(box.height ?? 0),
        });
      }
    }

    if (depth === 0 && node.type === "PAGE" && node.children) {
      for (const child of node.children) frames.push(String(child.name ?? ""));
    }

    for (const child of node.children ?? []) walk(child, depth + 1);
  };

  // No document at all is an empty file, not a page with one node in it.
  if (file.document) walk(file.document, 0);

  return {
    fileName: String(file.name ?? "Figma file"),
    colors: [...colors.values()].sort((a, b) => b.count - a.count || a.hex.localeCompare(b.hex)),
    fonts: [...fonts.entries()].map(([family, count]) => ({ family, count })).sort((a, b) => b.count - a.count || a.family.localeCompare(b.family)),
    radii,
    shadows,
    spacing,
    buttons,
    frames,
    styleNames: [...styleNamesById.values()],
    nodeCount,
  };
}

/* ------------------------------------------------------------- the palette */

/**
 * Which colours in the file are the brand, the dark, and the accent.
 *
 * Named styles are believed first ("Primary/500" means primary); after that the
 * work is done by how the colour behaves — a saturated colour used a lot is the
 * brand, the darkest widely-used colour is the ink, and a second saturated
 * colour is the accent. Nothing is returned when the file does not carry it.
 */
export function figmaPalette(design: FigmaDesign): FigmaPalette {
  const colors = design.colors.filter((c) => c.count >= 1);
  const withHsl = colors.map((c) => ({ ...c, ...hslOf(c.hex) }));

  const named = (pattern: RegExp) => withHsl.find((c) => pattern.test(c.name)) ?? null;

  const primaryNamed = named(/primary|brand(?!-?secondary)|main colour|main color/i);
  const secondaryNamed = named(/secondary|ink|text|dark|neutral\/9|neutral\/10/i);
  const accentNamed = named(/accent|highlight|cta|brand-?2/i);

  const saturated = withHsl.filter((c) => c.s > 0.25 && c.l > 0.12 && c.l < 0.78);
  const byUse = [...saturated].sort((a, b) => b.count - a.count || b.s - a.s);
  const darkest = [...withHsl].sort((a, b) => a.l - b.l)[0] ?? null;

  const primary = primaryNamed?.hex ?? byUse[0]?.hex ?? null;
  const secondary = secondaryNamed?.hex ?? (darkest && darkest.l < 0.35 ? darkest.hex : null);
  const accent =
    accentNamed?.hex ??
    byUse.find((c) => c.hex !== primary && c.hex !== secondary)?.hex ??
    null;

  return {
    ...(primary ? { primary } : {}),
    ...(secondary && secondary !== primary ? { secondary } : {}),
    ...(accent && accent !== primary && accent !== secondary ? { accent } : {}),
  };
}

/* -------------------------------------------------------------- the tokens */

const FONT_PATTERNS: [FontChoice, RegExp][] = [
  ["elegant", /playfair|didot|bodoni|dm serif|libre|cormorant|marcellus|prata|lora|freight|editorial|canela|recoleta/i],
  ["classic", /georgia|garamond|times|merriweather|pt serif|source serif|noto serif|baskerville|book|cambria|serif/i],
  ["modern", /inter|poppins|montserrat|roboto|helvetica|arial|futura|dm sans|manrope|work sans|public sans|space grotesk|karla|rubik|nunito|open sans|lato|outfit|sora|geist|satoshi|circular|graphik|univers|frutiger|segoe|system|sf pro|plex/i],
];

/** Which of our three type directions a font family reads as. */
export function fontChoiceFor(families: string[]): FontChoice | null {
  for (const family of families) {
    for (const [choice, pattern] of FONT_PATTERNS) {
      if (pattern.test(String(family))) return choice;
    }
  }
  return null;
}

function average(numbers: number[]): number {
  return numbers.length ? numbers.reduce((a, b) => a + b, 0) / numbers.length : 0;
}

function median(numbers: number[]): number {
  if (!numbers.length) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * The design tokens this file justifies, and a note for each one.
 *
 * A key is only returned when the file actually carries the evidence (see the
 * module header). `notes` is the honest half of that: the owner reads which
 * decisions came from the file, which ones their own site keeps, and the
 * colours are named as an offer rather than applied.
 */
export function tokensFromFigma(
  design: FigmaDesign,
  current: Omit<DesignTokens, "styleName">,
  options: { fullFile?: boolean } = {},
): {
  tokens: Partial<Omit<DesignTokens, "styleName">>;
  notes: string[];
  styleName: string;
} {
  // A deep link reads one frame, and one frame cannot tell us the file has no
  // shadows anywhere — so the "flat" inference only holds for a whole file.
  const fullFile = options.fullFile !== false;
  const tokens: Partial<Omit<DesignTokens, "styleName">> = {};
  const notes: string[] = [];
  const descriptor: string[] = [];

  // Type.
  const fontChoice = fontChoiceFor(design.fonts.slice(0, 4).map((f) => f.family));
  if (fontChoice) {
    tokens.font = fontChoice;
    const family = design.fonts[0]?.family ?? "";
    notes.push(`Type: ${family} reads as ${fontChoice} in our system${fontChoice === current.font ? " (already your setting)" : ""}`);
    descriptor.push(family);
  }

  // Corners.
  const radii = design.radii.filter((r) => Number.isFinite(r) && r >= 0);
  if (radii.length >= 3) {
    const sharpShare = radii.filter((r) => r <= 2).length / radii.length;
    const avg = average(radii);
    const pill = radii.filter((r) => r >= 24).length / radii.length >= 0.35;
    const radius: RadiusChoice = pill || avg >= 18 ? "pill" : sharpShare >= 0.6 || avg <= 3 ? "sharp" : "rounded";
    tokens.radius = radius;
    notes.push(`Corners: ${Math.round(avg)}px average across ${radii.length} layers → ${radius}`);
    descriptor.push(`${radius} corners`);
  }

  // Shadows.
  const shadows = design.shadows.filter((s) => Number.isFinite(s.blur));
  if (shadows.length) {
    const blur = Math.max(...shadows.map((s) => s.blur));
    const shadow: ShadowChoice = blur <= 6 ? "soft" : blur <= 20 ? "lifted" : "dramatic";
    tokens.shadow = shadow;
    notes.push(`Shadows: strongest blur ${Math.round(blur)}px → ${shadow}`);
    descriptor.push("shadowed cards");
  } else if (design.nodeCount > 0 && fullFile) {
    tokens.shadow = "none";
    notes.push("Shadows: the file has no drop shadows → flat cards");
    descriptor.push("flat cards");
  }

  // Buttons.
  if (design.buttons.length) {
    const counts: Record<string, number> = {};
    for (const b of design.buttons) counts[b.paint] = (counts[b.paint] ?? 0) + 1;
    const paint = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0] as "solid" | "outline" | "gradient" | "soft";
    const pillish = design.buttons.filter((b) => b.height > 0 && b.radius >= b.height / 2 - 1).length / design.buttons.length >= 0.5;
    const button: ButtonChoice =
      paint === "gradient" ? "gradient"
      : paint === "outline" ? "outline"
      : paint === "soft" ? "soft"
      : pillish ? "soft"
      : design.radii.length && average(design.radii) <= 3 ? "square"
      : "solid";
    tokens.button = button;
    notes.push(`Buttons: ${design.buttons.length} button layer(s), mostly ${paint} → ${button}`);
    descriptor.push(`${button} buttons`);
  }

  // Spacing and rhythm.
  const spacing = design.spacing.filter((s) => Number.isFinite(s) && s > 0);
  if (spacing.length >= 3) {
    const mid = median(spacing);
    const space: SpacingChoice = mid <= 8 ? "tight" : mid <= 20 ? "normal" : "airy";
    tokens.spacing = space;
    notes.push(`Spacing: ${Math.round(mid)}px median gaps → ${space}`);
    descriptor.push(`${space} spacing`);
  }

  // Header, footer, hero: the file's own chrome frames.
  const hasNav = design.frames.some((f) => /nav|header|topbar|menu bar/i.test(f));
  if (hasNav) {
    const topbar = design.frames.some((f) => /topbar|top bar/i.test(f));
    const header: HeaderChoice = topbar ? "topbar" : "sticky";
    tokens.header = header;
    notes.push(`Header: the file has a navigation frame → ${header}`);
  }
  const footerFrame = design.frames.find((f) => /footer/i.test(f));
  if (footerFrame) {
    const footer: FooterChoice = "columned";
    tokens.footer = footer;
    notes.push(`Footer: the file has a footer frame → ${footer}`);
  }

  // Image treatment: heavy image use reads as photography; a duotone-ish file
  // is not detectable, so we only move when the file is clearly photographic.
  const imageFrames = design.frames.filter((f) => /gallery|photo|work|portfolio|lookbook/i.test(f)).length;
  if (imageFrames >= 2) {
    tokens.imageTreatment = "plain" satisfies ImageTreatment;
    notes.push(`Images: ${imageFrames} image-led frames → photographs shown plain`);
  }

  const styleName = descriptor.length
    ? `${descriptor.slice(0, 3).join(" · ")}`.slice(0, 60)
    : `From ${design.fileName}`.slice(0, 60);

  return { tokens, notes, styleName };
}

/* ------------------------------------------------------------- the sections */

function titleCase(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 40);
}

/**
 * The page's own order, as our sections.
 *
 * A designer laying out a page is the strongest signal we get about what the
 * business is: hero, then services, then work, then a form. Frames we cannot
 * place are skipped (never guessed into a section), and duplicates collapse:
 * two frames both named "Gallery / mobile" are one gallery.
 */
export function planFromDesign(design: FigmaDesign, seed: string): { plan: SectionChoice[]; frames: string[] } {
  const types: SectionType[] = [];
  const frames: string[] = [];
  for (const frame of design.frames) {
    const type = sectionTypeFromName(frame);
    if (!type) continue;
    if (!frames.includes(frame)) frames.push(titleCase(frame));
    if (!types.includes(type)) types.push(type);
  }
  const plan = types.length >= 2 ? sectionPlanFor(seed, types) : [];
  return { plan, frames: frames.slice(0, 12) };
}

/**
 * Apply an imported composition to a site without touching its content.
 *
 * Only two things move: the arrangement token inside a section the site already
 * has (`content.variant`), and the order sections sit in. Sections the design
 * asked for but whose data the site genuinely has are added empty-headed — the
 * renderer fills them from the owner's own services, products or photos, so
 * nothing is invented; sections it asked for with no data behind them are
 * reported as "not added" rather than shipped as blank boxes.
 */
export function recompose(
  sections: SiteSection[],
  plan: SectionChoice[],
  available: Partial<Record<SectionType, boolean>>,
): { sections: SiteSection[]; added: SectionType[]; skipped: SectionType[]; reordered: boolean; variants: number } {
  if (!plan.length) return { sections, added: [], skipped: [], reordered: false, variants: 0 };

  const wanted = plan.map((p) => p.type);
  const byType = new Map<SectionType, SiteSection>();
  for (const section of sections) if (!byType.has(section.type)) byType.set(section.type, section);

  const added: SectionType[] = [];
  const skipped: SectionType[] = [];
  const variantFor = new Map(plan.map((p) => [p.type, p.variant]));

  // Which sections the new page will hold, in the designer's order first and
  // then whatever the owner already had that the design did not mention.
  const ordered: SiteSection[] = [];
  for (const type of wanted) {
    const existing = byType.get(type);
    if (existing) {
      ordered.push(existing);
      continue;
    }
    if (available[type]) {
      added.push(type);
      ordered.push({
        id: `s_${type}_${Math.random().toString(36).slice(2, 8)}`,
        type,
        visible: true,
        content: {},
      });
    } else {
      skipped.push(type);
    }
  }
  for (const section of sections) if (!ordered.includes(section)) ordered.push(section);

  let variants = 0;
  const next = ordered.map((section) => {
    const variant = variantFor.get(section.type);
    if (!variant || section.content?.variant === variant) return section;
    variants += 1;
    return { ...section, content: { ...section.content, variant } };
  });

  const beforeOrder = sections.map((s) => s.id).join(",");
  return {
    sections: next,
    added,
    skipped,
    reordered: beforeOrder !== next.map((s) => s.id).join(","),
    variants,
  };
}

/* ------------------------------------------------------ the change summary */

/**
 * What an import did, in the owner's words.
 *
 * The same discipline as a restyle: every decision that moved is listed, and
 * every decision that was *not* taken is listed too — which colours were read
 * from the file and left alone, which sections the design wanted and the site
 * has no content for.
 */
export function figmaChangeSummary(input: {
  before: Omit<DesignTokens, "styleName">;
  after: Omit<DesignTokens, "styleName">;
  palette: FigmaPalette;
  paletteApplied: boolean;
  framePlan: string[];
  added: SectionType[];
  skipped: SectionType[];
  reordered: boolean;
  variants: number;
}): string[] {
  const changed: string[] = [];
  const say = (label: string, from: string, to: string) => {
    if (from !== to) changed.push(`${label}: ${from} → ${to}`);
  };
  say("Type", input.before.font, input.after.font);
  say("Corners", input.before.radius, input.after.radius);
  say("Shadows", input.before.shadow, input.after.shadow);
  say("Buttons", input.before.button, input.after.button);
  say("Spacing", input.before.spacing, input.after.spacing);
  say("Header", input.before.header, input.after.header);
  say("Footer", input.before.footer, input.after.footer);
  say("Images", input.before.imageTreatment, input.after.imageTreatment);

  const colors = [input.palette.primary, input.palette.secondary, input.palette.accent].filter(Boolean) as string[];
  if (colors.length) {
    changed.push(
      input.paletteApplied
        ? `Colours: using the file's ${colors.join(", ")}`
        : `Colours: the file's ${colors.join(", ")} read but not applied — your own colours stay`,
    );
  }
  if (input.framePlan.length) changed.push(`Sections from the file: ${input.framePlan.join(" → ")}`);
  if (input.reordered) changed.push("Sections reordered to the file's layout");
  if (input.variants) changed.push(`${input.variants} section${input.variants > 1 ? "s" : ""} laid out differently`);
  if (input.added.length) changed.push(`Added: ${input.added.join(", ")} (filled from your own data)`);
  if (input.skipped.length) changed.push(`Not added (no content of yours to fill them): ${input.skipped.join(", ")}`);
  if (!changed.length) changed.push("No design change was readable from that file — nothing was touched");
  return changed;
}

/* ------------------------------------------------- design-token JSON import */

/**
 * A design token file, as designers actually export one.
 *
 * Tokens Studio ("Figma Tokens") writes `{ "color": { "primary": { "value": "#0b5fff" } } }`
 * and Figma's own Variables export writes `{ "Primary": { "$type": "color", "$value": "#0b5fff" } }`.
 * Both are accepted, both are flattened, and both go through exactly the same
 * mapping as a live file — one design pipeline, two doors into it.
 */
export function tokensToDesign(raw: unknown): FigmaDesign {
  const colors = new Map<string, { hex: string; count: number; name: string }>();
  const fonts = new Map<string, number>();
  const radii: number[] = [];
  const spacing: number[] = [];
  const styleNames: string[] = [];

  const visit = (node: unknown, path: string[]) => {
    if (node === null || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    const value = record.value ?? record.$value;
    const type = String(record.type ?? record.$type ?? "").toLowerCase();
    const name = path.join("/") || "token";

    if (value !== undefined && value !== null) {
      if (typeof value === "string") {
        const hex = /^#([0-9a-f]{6})$/i.test(value.trim()) ? value.trim().toLowerCase() : null;
        if (hex && hex !== "#ffffff" && hex !== "#000000") {
          const existing = colors.get(hex);
          if (existing) existing.count += 1;
          else colors.set(hex, { hex, count: 1, name });
          styleNames.push(name);
        } else if (type.includes("fontfamil") || /font/i.test(name)) {
          const family = value.replace(/['"]/g, "").split(",")[0].trim();
          if (family) fonts.set(family, (fonts.get(family) ?? 0) + 1);
        } else if (type.includes("typography") || /font|type/i.test(name)) {
          const family = value.replace(/['"]/g, "").split(",")[0].trim();
          if (family && /[a-z]/i.test(family)) fonts.set(family, (fonts.get(family) ?? 0) + 1);
        }
        const px = /^(\d+(?:\.\d+)?)px$/.exec(value.trim());
        if (px) {
          const num = Number(px[1]);
          if (/radius|corner|round/i.test(name)) radii.push(num);
          else if (/spacing|gap|space|padding|margin/i.test(name)) spacing.push(num);
        }
      } else if (typeof value === "object" && typeof (value as { fontFamily?: unknown }).fontFamily === "string") {
        const family = String((value as { fontFamily: string }).fontFamily).replace(/['"]/g, "").split(",")[0].trim();
        if (family) fonts.set(family, (fonts.get(family) ?? 0) + 1);
      } else if (typeof value === "number") {
        if (/radius|corner|round/i.test(name)) radii.push(value);
        else if (/spacing|gap|space|padding|margin/i.test(name)) spacing.push(value);
      } else {
        visit(value, path);
      }
    }

    for (const [key, child] of Object.entries(record)) {
      if (key === "value" || key === "$value" || key === "type" || key === "$type") continue;
      if (child && typeof child === "object") visit(child, [...path, key]);
    }
  };

  visit(raw, []);

  return {
    fileName: "Design tokens",
    colors: [...colors.values()].sort((a, b) => b.count - a.count || a.hex.localeCompare(b.hex)),
    fonts: [...fonts.entries()].map(([family, count]) => ({ family, count })).sort((a, b) => b.count - a.count || a.family.localeCompare(b.family)),
    radii,
    shadows: [],
    spacing,
    buttons: [],
    frames: [],
    styleNames,
    nodeCount: colors.size + fonts.size + radii.length + spacing.length,
  };
}

/* ----------------------------------------------------------------- the read */

/**
 * Everything an import produces, from either door.
 *
 * `current` is the site's design today: the tokens the owner already has. The
 * answer never contains a token the file did not justify, so applying it leaves
 * every undecided decision exactly as the owner last left it.
 */
export function readDesign(
  design: FigmaDesign,
  current: Omit<DesignTokens, "styleName">,
  seed: string,
  options: { fullFile?: boolean } = {},
): FigmaRead {
  const { tokens, notes, styleName } = tokensFromFigma(design, current, options);
  const { plan, frames } = planFromDesign(design, seed);
  const palette = figmaPalette(design);

  const signals =
    (tokens.font ? 1 : 0) +
    (tokens.radius ? 1 : 0) +
    (tokens.shadow ? 1 : 0) +
    (tokens.button ? 1 : 0) +
    (tokens.spacing ? 1 : 0) +
    (design.colors.length >= 2 ? 1 : 0) +
    (plan.length >= 3 ? 1 : 0);

  return {
    design,
    tokens,
    notes,
    palette,
    sectionPlan: plan,
    framePlan: frames,
    confidence: signals >= 5 ? "strong" : signals >= 2 ? "partial" : "weak",
    styleName,
  };
}

/**
 * Unit tests for the Figma import (lib/figma.ts).
 *
 *   node --experimental-strip-types --import ./tests/path-alias.mjs tests/figma.test.mts
 *
 * Everything here runs without a Figma account: the module's network call is
 * one function, and every promise this file tests is about the mapping from a
 * file's own JSON to our design system. The promises that matter:
 *
 *   · never invent — a token appears only when the file carried the evidence,
 *     an unreadable file changes nothing rather than guessing;
 *   · the owner's content and colours survive an import (only `variant` inside
 *     a section ever moves, and the palette is an offer, not a decision);
 *   · deterministic — the same file read twice gives the same design, so an
 *     import can be explained and rolled back.
 */

import { SECTION_LIBRARY } from "@/lib/sections";
import {
  contrastRatio, figmaChangeSummary, figmaPalette, fontChoiceFor, hexFromChannel, hslOf,
  parseFigmaUrl, planFromDesign, readDesign, readFigmaDesign, recompose, sectionTypeFromName,
  tokensFromFigma, tokensToDesign, type FigmaFileJson,
} from "@/lib/figma";
import type { SectionChoice } from "@/lib/design-dna";
import type { SiteSection } from "@/lib/types";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const section = (id: string, type: SiteSection["type"], content: Record<string, unknown> = {}): SiteSection =>
  ({ id, type, visible: true, content });

/* ------------------------------------------------------------ a real file */

/**
 * A small but honest Figma file: two published styles, a hero with a headline
 * and a button, a services grid, a gallery, a contact form and a footer — the
 * shape of a page a designer would hand over.
 */
const FILE: FigmaFileJson = {
  name: "Sharma Electricals — Website",
  styles: {
    "S:1": { name: "Primary/500", styleType: "FILL" },
    "S:2": { name: "Ink/900", styleType: "FILL" },
    "S:3": { name: "Accent/Coral", styleType: "FILL" },
  },
  document: {
    type: "PAGE",
    children: [
      {
        id: "1:1", name: "Header / Nav", type: "FRAME",
        fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }],
        children: [{ id: "1:1:1", name: "Logo", type: "TEXT", style: { fontFamily: "Inter", fontSize: 18 } }],
      },
      {
        id: "1:2", name: "Hero", type: "FRAME",
        fills: [{ type: "SOLID", color: { r: 0.043, g: 0.373, b: 1 } }],
        styles: { fill: "S:1" },
        itemSpacing: 24, paddingTop: 96,
        children: [
          { id: "1:2:1", name: "Headline", type: "TEXT", style: { fontFamily: "Inter", fontSize: 56, fontWeight: 700 } },
          { id: "1:2:2", name: "Sub", type: "TEXT", style: { fontFamily: "Inter", fontSize: 20 } },
          {
            id: "1:2:3", name: "Primary Button", type: "FRAME",
            fills: [{ type: "SOLID", color: { r: 0.043, g: 0.373, b: 1 } }],
            cornerRadius: 32, absoluteBoundingBox: { width: 180, height: 56 },
          },
        ],
      },
      {
        id: "1:3", name: "Services", type: "FRAME",
        fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }],
        itemSpacing: 16,
        children: [
          {
            id: "1:3:1", name: "Service Card", type: "FRAME",
            strokes: [{ type: "SOLID", color: { r: 0.9, g: 0.9, b: 0.92 } }],
            strokeWeight: 1, cornerRadius: 12,
            effects: [{ type: "DROP_SHADOW", radius: 18, offset: { x: 0, y: 6 } }],
          },
          { id: "1:3:2", name: "Service Card copy", type: "TEXT", style: { fontFamily: "Inter", fontSize: 16 } },
        ],
      },
      {
        id: "1:4", name: "Gallery", type: "FRAME",
        children: [{ id: "1:4:1", name: "Photo", type: "RECTANGLE", cornerRadius: 8, fills: [{ type: "SOLID", color: { r: 0.95, g: 0.95, b: 0.95 } }] }],
      },
      {
        id: "1:5", name: "Contact", type: "FRAME",
        fills: [{ type: "SOLID", color: { r: 0.98, g: 0.6, b: 0.35 }, opacity: 1 }],
        styles: { fill: "S:3" },
        children: [
          {
            id: "1:5:1", name: "Send CTA", type: "FRAME",
            fills: [{ type: "SOLID", color: { r: 0.98, g: 0.6, b: 0.35 } }],
            cornerRadius: 4, absoluteBoundingBox: { width: 140, height: 44 },
          },
        ],
      },
      { id: "1:6", name: "Footer", type: "FRAME", fills: [{ type: "SOLID", color: { r: 0.05, g: 0.06, b: 0.09 } }], styles: { fill: "S:2" } },
    ],
  },
};

const design = readFigmaDesign(FILE);

/* ------------------------------------------------------------------ URL ---- */

check("a /design link is read", parseFigmaUrl("https://www.figma.com/design/AbC123xYz789/Sharma-Electricals")?.key === "AbC123xYz789");
check("a /file link is read", parseFigmaUrl("https://figma.com/file/AbC123xYz789/Name?node-id=12-34")?.kind === "file");
check("a /proto link is read", parseFigmaUrl("https://figma.com/proto/AbC123xYz789/Name")?.kind === "proto");
check("node-id is normalised to the API's spelling", parseFigmaUrl("https://figma.com/design/AbC123xYz789/N?node-id=12-34")?.nodeId === "12:34");
check("a colon node id passes through", parseFigmaUrl("https://figma.com/design/AbC123xYz789/N?node-id=12:34")?.nodeId === "12:34");
check("a link with no node has no nodeId", parseFigmaUrl("https://figma.com/design/AbC123xYz789/N")?.nodeId === undefined);
check("a link without a scheme is read", parseFigmaUrl("figma.com/design/AbC123xYz789/N")?.key === "AbC123xYz789");
check("a bare file key is accepted", parseFigmaUrl("AbC123xYz789")?.key === "AbC123xYz789");
check("query noise does not confuse the key", parseFigmaUrl("https://figma.com/design/AbC123xYz789/N?t=abc&node-id=1-2")?.nodeId === "1:2");
check("a community link is refused", parseFigmaUrl("https://figma.com/community/file/12345") === null);
check("a board link is refused", parseFigmaUrl("https://figma.com/board/AbC123xYz789") === null);
check("a lookalike domain is refused", parseFigmaUrl("https://figma.com.evil.example/design/AbC123xYz789/N") === null);
check("a non-figma URL is refused", parseFigmaUrl("https://example.com/design/AbC123xYz789") === null);
check("an empty string is refused", parseFigmaUrl("   ") === null);
check("a too-short key is refused", parseFigmaUrl("https://figma.com/design/short/Name") === null);

/* --------------------------------------------------------------- colours --- */

check("a Figma colour channel becomes hex", hexFromChannel({ r: 0.043, g: 0.373, b: 1 }) === "#0b5fff");
check("white is white", hexFromChannel({ r: 1, g: 1, b: 1 }) === "#ffffff");
check("a missing channel returns null", hexFromChannel({ r: 0.5 }) === null);
check("undefined returns null", hexFromChannel(undefined) === null);
check("hsl of pure red", hslOf("#ff0000").h === 0 && hslOf("#ff0000").s === 1);
check("hsl of a white is unsaturated", hslOf("#ffffff").s === 0);
check("contrast of black on white is 21", contrastRatio("#000000", "#ffffff") === 21);
check("contrast of a colour with itself is 1", contrastRatio("#0b5fff", "#0b5fff") === 1);

/* --------------------------------------------------------------- reading --- */

check("the file name is read", design.fileName === "Sharma Electricals — Website");
check("the top-level frames are read in order", design.frames.join("|") === "Header / Nav|Hero|Services|Gallery|Contact|Footer", design.frames.join("|"));
check("white fills are not counted as colours", !design.colors.some((c) => c.hex === "#ffffff"));
check("near-white card fills are not counted either", !design.colors.some((c) => c.hex === "#f2f2f2"));
check("a published style name beats the layer name", design.colors.some((c) => c.name === "Primary/500" && c.hex === "#0b5fff"));
check("the accent style is carried by its name", design.colors.some((c) => c.name === "Accent/Coral"));
check("every colour found has a count", design.colors.every((c) => c.count >= 1));
check("colours are ordered by use", design.colors[0].count >= design.colors[design.colors.length - 1].count);
check("fonts are counted", design.fonts[0].family === "Inter" && design.fonts[0].count === 4, JSON.stringify(design.fonts));
check("radii are collected", design.radii.includes(32) && design.radii.includes(12) && design.radii.includes(4));
check("shadows are collected with their blur", design.shadows.some((s) => s.blur === 18));
check("auto-layout spacing is collected", design.spacing.includes(24) && design.spacing.includes(16) && design.spacing.includes(96));
check("button-ish layers are collected", design.buttons.length === 2, JSON.stringify(design.buttons));
check("a solid button reads as solid", design.buttons.some((b) => b.paint === "solid"));
check("nodes are counted", design.nodeCount > 10);
check("published style names are listed", design.styleNames.length === 3);

const invisible = readFigmaDesign({
  document: {
    type: "PAGE",
    children: [{
      name: "Hero", type: "FRAME",
      fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 }, visible: false }],
      effects: [{ type: "DROP_SHADOW", radius: 40, visible: false }],
    }],
  },
});
check("hidden fills are ignored", invisible.colors.length === 0);
check("hidden effects are ignored", invisible.shadows.length === 0);
check("an empty file does not throw", readFigmaDesign({}).nodeCount === 0);

/* --------------------------------------------------------------- palette --- */

const palette = figmaPalette(design);
check("the named primary wins", palette.primary === "#0b5fff", String(palette.primary));
check("the darkest named ink becomes secondary", palette.secondary === "#0d0f17", String(palette.secondary));
check("the named accent is the accent", palette.accent === "#fa9959", String(palette.accent));
check("no colour is used twice", new Set([palette.primary, palette.secondary, palette.accent]).size === 3);
check("an empty file offers no palette", Object.keys(figmaPalette(readFigmaDesign({}))).length === 0);

const unnamed = readFigmaDesign({
  document: {
    type: "PAGE",
    children: [
      { name: "A", type: "RECTANGLE", fills: [{ type: "SOLID", color: { r: 0.05, g: 0.4, b: 0.9 } }] },
      { name: "B", type: "RECTANGLE", fills: [{ type: "SOLID", color: { r: 0.05, g: 0.4, b: 0.9 } }] },
      { name: "C", type: "RECTANGLE", fills: [{ type: "SOLID", color: { r: 0.9, g: 0.2, b: 0.1 } }] },
      { name: "D", type: "RECTANGLE", fills: [{ type: "SOLID", color: { r: 0.06, g: 0.07, b: 0.1 } }] },
    ],
  },
});
const unnamedPalette = figmaPalette(unnamed);
check("without names the most-used saturated colour is the brand", unnamedPalette.primary === "#0d66e6", String(unnamedPalette.primary));
check("without names the darkest becomes the ink", unnamedPalette.secondary === "#0f121a", String(unnamedPalette.secondary));

/* ------------------------------------------------------------------ type --- */

check("Playfair reads as elegant", fontChoiceFor(["Playfair Display"]) === "elegant");
check("Georgia reads as classic", fontChoiceFor(["Georgia"]) === "classic");
check("Inter reads as modern", fontChoiceFor(["Inter"]) === "modern");
check("an unknown face is not guessed at", fontChoiceFor(["Zzz Custom Face"]) === null);
check("an empty list is not guessed at", fontChoiceFor([]) === null);

/* ---------------------------------------------------------------- tokens --- */

const current = {
  font: "modern" as const, radius: "rounded" as const, cardStyle: "shadow" as const,
  shadow: "soft" as const, button: "solid" as const, spacing: "normal" as const,
  header: "sticky" as const, footer: "columned" as const, imageTreatment: "plain" as const,
};
const read = tokensFromFigma(design, current);
check("the font token is set from the file's type", read.tokens.font === "modern");
check("the radius token follows the file's corners", read.tokens.radius === "rounded", String(read.tokens.radius));
check("the shadow token follows the file's shadows", read.tokens.shadow === "lifted", String(read.tokens.shadow));
check("the spacing token follows the file's rhythm", read.tokens.spacing === "airy", String(read.tokens.spacing));
check("the header token follows the file's nav frame", read.tokens.header === "sticky");
check("the footer token follows the file's footer frame", read.tokens.footer === "columned");
check("every token set has a note", read.notes.length >= 5, JSON.stringify(read.notes));
check("notes are one line each", read.notes.every((n) => n.length < 140));
check("the style name describes the file", read.styleName.length > 0 && read.styleName.length <= 60, read.styleName);

const bare = tokensFromFigma(readFigmaDesign({ document: { type: "PAGE", children: [{ name: "Hero", type: "FRAME" }] } }), current);
check("a file with nothing in it sets no type", bare.tokens.font === undefined);
check("a file with nothing in it sets no corners", bare.tokens.radius === undefined);
check("a file with nothing in it sets no spacing", bare.tokens.spacing === undefined);
check("a file with no shadows says flat", bare.tokens.shadow === "none");
check("every token is a valid value for its key", (() => {
  const allowed: Record<string, string[]> = {
    font: ["modern", "classic", "elegant"], radius: ["sharp", "rounded", "pill"],
    cardStyle: ["flat", "shadow", "outline"], shadow: ["none", "soft", "lifted", "dramatic"],
    button: ["solid", "outline", "soft", "gradient", "square"], spacing: ["tight", "normal", "airy"],
    header: ["sticky", "minimal", "topbar", "centred"], footer: ["columned", "compact", "statement"],
    imageTreatment: ["plain", "duotone", "framed", "soft-focus"],
  };
  return Object.entries(read.tokens).every(([key, value]) => allowed[key]?.includes(String(value)));
})());

const pillFile = readFigmaDesign({
  document: {
    type: "PAGE",
    children: [
      { name: "Card", type: "FRAME", cornerRadius: 28 },
      { name: "Card 2", type: "FRAME", cornerRadius: 24 },
      { name: "Card 3", type: "FRAME", cornerRadius: 32 },
      { name: "Button", type: "FRAME", cornerRadius: 30, absoluteBoundingBox: { width: 160, height: 56 }, fills: [{ type: "SOLID", color: { r: 0.1, g: 0.2, b: 0.3 } }] },
    ],
  },
});
const pillTokens = tokensFromFigma(pillFile, current);
check("round corners read as pill", pillTokens.tokens.radius === "pill", String(pillTokens.tokens.radius));
check("a pill button reads as soft, not square", pillTokens.tokens.button === "soft", String(pillTokens.tokens.button));

const sharpFile = readFigmaDesign({
  document: {
    type: "PAGE",
    children: [
      { name: "Block", type: "FRAME", cornerRadius: 0 },
      { name: "Block 2", type: "FRAME", cornerRadius: 0 },
      { name: "Block 3", type: "R ECTANGLE".replace(" ", ""), cornerRadius: 1 },
    ],
  },
});
check("square corners read as sharp", tokensFromFigma(sharpFile, current).tokens.radius === "sharp");

const noShadowFile = readFigmaDesign({ document: { type: "PAGE", children: [{ name: "Card", type: "FRAME", cornerRadius: 8 }] } });
check("a file with no shadows is flat", tokensFromFigma(noShadowFile, current).tokens.shadow === "none");

const tightFile = readFigmaDesign({
  document: {
    type: "PAGE",
    children: [
      { name: "A", type: "FRAME", itemSpacing: 4 },
      { name: "B", type: "FRAME", itemSpacing: 6 },
      { name: "C", type: "FRAME", itemSpacing: 8 },
    ],
  },
});
check("tight gaps read as tight", tokensFromFigma(tightFile, current).tokens.spacing === "tight");

/* ------------------------------------------------------------- section plan */

check("a hero frame is a hero", sectionTypeFromName("Hero") === "hero");
check("a homepage hero is a hero", sectionTypeFromName("Homepage / Hero") === "hero");
check("Services reads as services", sectionTypeFromName("Our Services") === "services");
check("Gallery reads as gallery", sectionTypeFromName("Gallery / mobile") === "gallery");
check("Contact reads as a cta", sectionTypeFromName("Contact") === "cta");
check("a footer is chrome, not a section", sectionTypeFromName("Footer") === null);
check("a navbar is chrome, not a section", sectionTypeFromName("Nav") === null);
check("an unplaceable frame is skipped", sectionTypeFromName("Rectangle 41") === null);
check("an empty name is skipped", sectionTypeFromName("  ") === null);
check("every mapped type exists in our library", (() => {
  const types = new Set(SECTION_LIBRARY.map((s) => s.type));
  const samples = ["Hero", "About us", "Services", "Products", "Gallery", "Reviews", "FAQ", "Stats", "Why us", "Hours", "Blog", "Pay online", "Contact"];
  return samples.every((name) => {
    const type = sectionTypeFromName(name);
    return type === null || types.has(type);
  });
})());

const planned = planFromDesign(design, "seed-1");
check("the plan follows the file's order", planned.plan.map((p) => p.type).join("|") === "hero|services|gallery|cta", planned.plan.map((p) => p.type).join("|"));
check("the frames are reported", planned.frames.join("|") === "Hero|Services|Gallery|Contact", planned.frames.join("|"));
check("every planned section has a variant", planned.plan.every((p) => typeof p.variant === "string" && p.variant.length > 0));
check("reading the same file twice gives the same plan", JSON.stringify(planFromDesign(design, "seed-1")) === JSON.stringify(planned));
check("a file with one frame has no plan to apply", planFromDesign(readFigmaDesign({ document: { type: "PAGE", children: [{ name: "Hero", type: "FRAME" }] } }), "s").plan.length === 0);

/* -------------------------------------------------------------- recompose -- */

const site: SiteSection[] = [
  section("a", "hero", { headline: "Bijli ka kaam", variant: "image", image: "/api/art/x.svg" }),
  section("b", "services", { title: "Our services", variant: "cards" }),
  section("c", "testimonials", { title: "What clients say", variant: "cards" }),
  section("d", "contact", { title: "Reach us" }),
];
const plan: SectionChoice[] = [
  { type: "hero", variant: "centred" },
  { type: "services", variant: "list" },
  { type: "gallery", variant: "masonry" },
  { type: "products", variant: "grid" },
  { type: "contact", variant: "split" },
];
const composed = recompose(site, plan, { gallery: true, products: false });
check("sections are reordered to the file's layout", composed.sections.map((s) => s.type).join("|") === "hero|services|gallery|contact|testimonials", composed.sections.map((s) => s.type).join("|"));
check("a section with data is added", composed.added.join(",") === "gallery");
check("a section with no data is not added", composed.skipped.join(",") === "products");
check("the reorder is reported", composed.reordered === true);
check("the variant count is reported", composed.variants === 4, String(composed.variants));
check("the owner's own words survive", composed.sections.find((s) => s.type === "services")?.content.title === "Our services");
check("the owner's own image survives", composed.sections.find((s) => s.type === "hero")?.content.image === "/api/art/x.svg");
check("a section the design never mentioned stays", composed.sections.some((s) => s.type === "testimonials" && s.content.title === "What clients say"));
check("only the variant key moves", (() => {
  const before = site.find((s) => s.type === "services")!;
  const after = composed.sections.find((s) => s.id === before.id)!;
  const keys = new Set([...Object.keys(before.content), ...Object.keys(after.content)]);
  return [...keys].every((k) => k === "variant" || before.content[k] === after.content[k]);
})());
check("an added section carries only the design's arrangement, no invented copy", (() => {
  const added = composed.sections.find((s) => s.type === "gallery")!;
  const keys = Object.keys(added.content);
  return keys.length <= 1 && (keys.length === 0 || keys[0] === "variant");
})());
check("an empty plan changes nothing", recompose(site, [], {}).sections === site);
check("a plan that only renames variants reports no reorder", recompose([section("x", "hero", { variant: "centred" })], [{ type: "hero", variant: "centred" }], {}).reordered === false);

/* --------------------------------------------------------------- summary --- */

const summary = figmaChangeSummary({
  before: current,
  after: { ...current, radius: "pill", shadow: "dramatic" },
  palette: { primary: "#0a5fff" },
  paletteApplied: false,
  framePlan: ["Hero", "Services"],
  added: ["gallery"],
  skipped: ["products"],
  reordered: true,
  variants: 2,
});
const joined = summary.join("\n");
check("the summary says what moved", joined.includes("Corners: rounded → pill") && joined.includes("Shadows: soft → dramatic"));
check("the summary says the colours were left alone", joined.includes("not applied"));
check("the summary lists the file's frames", joined.includes("Hero → Services"));
check("the summary lists what was added", joined.includes("Added: gallery"));
check("the summary lists what was skipped", joined.includes("products"));
check("the summary mentions the reorder", joined.includes("reordered"));
check("a no-change import says so plainly", figmaChangeSummary({
  before: current, after: current, palette: {}, paletteApplied: false,
  framePlan: [], added: [], skipped: [], reordered: false, variants: 0,
}).join(" ").includes("nothing was touched"));

/* ---------------------------------------------------------------- tokens --- */

const studio = tokensToDesign({
  color: {
    primary: { value: "#0b5fff", type: "color" },
    ink: { value: "#101828", type: "color" },
    surface: { value: "#ffffff", type: "color" },
    border: { value: "#e4e7ec", type: "color" },
  },
  typography: { body: { value: { fontFamily: "Poppins", fontWeight: "400" }, type: "typography" } },
  radius: { card: { value: "16px" }, pill: { value: "999px" } },
  spacing: { md: { value: "24px" }, sm: { value: "8px" } },
});
check("token colours are read", studio.colors.some((c) => c.hex === "#0b5fff"));
check("white tokens are not treated as brand colours", !studio.colors.some((c) => c.hex === "#ffffff"));
check("token radii are read", studio.radii.includes(16) && studio.radii.includes(999));
check("token spacing is read", studio.spacing.includes(24) && studio.spacing.includes(8));
check("token type is read", studio.fonts.some((f) => f.family === "Poppins"), JSON.stringify(studio.fonts));
check("token style names are kept", studio.styleNames.some((n) => n.includes("primary")));
check("token colours go through the same palette mapper", figmaPalette(studio).primary === "#0b5fff");

const variables = tokensToDesign({
  Primary: { $type: "color", $value: "#1a73e8" },
  Radius: { $type: "number", $value: 12 },
  Spacing: { $type: "number", $value: 20 },
  Heading: { $type: "string", $value: "Georgia" },
});
check("a Figma Variables export is read too", variables.colors.some((c) => c.hex === "#1a73e8"));
check("variables radius is read", variables.radii.includes(12));
check("variables spacing is read", variables.spacing.includes(20));

const junk = tokensToDesign({ note: "hand-written", list: [1, 2, 3], nested: { deep: { value: "not a colour" } } });
check("junk tokens produce nothing", junk.colors.length === 0 && junk.fonts.length === 0 && junk.radii.length === 0);
check("junk tokens do not throw", tokensToDesign(null).colors.length === 0 && tokensToDesign("nope").colors.length === 0);

/* ------------------------------------------------------------- readDesign -- */

const strongRead = readDesign(design, current, "sharma");
check("a complete file reads as a strong source", strongRead.confidence === "strong", strongRead.confidence);
check("a strong read carries the palette as an offer", strongRead.palette.primary === "#0b5fff");
check("a strong read carries the page's own order", strongRead.sectionPlan.length >= 4);
check("a bare file reads as weak", readDesign(readFigmaDesign({ document: { type: "PAGE", children: [{ name: "Rectangle 1", type: "FRAME" }] } }), current, "s").confidence === "weak");
check("reading twice gives the same answer", JSON.stringify(readDesign(design, current, "sharma")) === JSON.stringify(strongRead));
check("a file that decides nothing leaves every decision alone", (() => {
  const thin = readDesign(readFigmaDesign({ document: { type: "PAGE", children: [{ name: "Rectangle 1", type: "FRAME" }] } }), current, "s");
  return thin.tokens.font === undefined && thin.tokens.radius === undefined && thin.tokens.spacing === undefined;
})());

console.log(`\nfigma: ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}

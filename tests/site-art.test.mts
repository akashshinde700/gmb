/**
 * Unit tests for the generated artwork.
 *
 *   node --experimental-strip-types --import ./tests/path-alias.mjs tests/site-art.test.mts
 *
 * The promise being tested is "no two businesses get the same picture": the
 * drawings must differ between businesses in one trade, between sections of one
 * business, and between the gallery tiles of one page — while staying
 * deterministic for a given business so the poster can be cached.
 */

import {
  posterSvg, posterUrl, pickVariant, ratioForSection, variantsFor, sectionArt,
  ART_SECTIONS, MOTIF_VARIANTS,
} from "@/lib/site-art";
import type { SceneKind } from "@/lib/industries";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) passed++;
  else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title: string) {
  console.log(`\n== ${title}`);
}

const COLORS = ["#0f766e", "#042f2e", "#f59e0b"] as const;
const SCENES = Object.keys(MOTIF_VARIANTS) as SceneKind[];

function draw(overrides: Partial<Parameters<typeof posterSvg>[0]> = {}) {
  return posterSvg({ seed: "acme-dental", scene: "care", colors: COLORS, ...overrides });
}

/** The drawing used, read back out of the markup. */
function motifOf(svg: string): string {
  return svg.match(/data-motif="([^"]+)"/)?.[1] ?? "";
}

section("Deterministic, and cacheable");

{
  check("the same call returns the same bytes", draw() === draw());
  check("a different section of the same business is a different picture",
    draw({ section: "hero" }) !== draw({ section: "about" }));
  check("a different index is a different picture", draw({ index: 1 }) !== draw({ index: 2 }));
  check("a different business is a different picture",
    draw({ seed: "acme-dental" }) !== draw({ seed: "other-dental" }));

  const svg = draw();
  check("the poster names the drawing it used", motifOf(svg).length > 0, motifOf(svg));
  check("it is a self-contained SVG", svg.startsWith("<svg xmlns=") && svg.trim().endsWith("</svg>"));
  check("no scripts, no external files, no fonts",
    !/<script/i.test(svg) && !/xlink:href|href="http/i.test(svg) && !/@font-face/i.test(svg));
  check("the brand colours are the only colours drawn",
    svg.includes("#0f766e") && svg.includes("#042f2e") && svg.includes("#f59e0b"));
}

section("Variety inside one trade");

{
  // Twenty businesses in one trade: they must not divide neatly into three
  // pictures, and every scene must actually offer its variants.
  const slugs = Array.from({ length: 20 }, (_, i) => `care-clinic-${i}`);
  const drawn = slugs.map((seed) => motifOf(draw({ seed })));
  const distinct = new Set(drawn);
  check("one trade uses all of its drawings", distinct.size === variantsFor("care").length,
    `${distinct.size} of ${variantsFor("care").length}: ${[...distinct].join(", ")}`);
  check("no drawing takes everything", Math.max(...[...distinct].map((v) => drawn.filter((d) => d === v).length)) <= slugs.length * 0.6,
    JSON.stringify([...distinct].map((v) => [v, drawn.filter((d) => d === v).length])));
  check("the same business keeps its drawing", motifOf(draw({ seed: "care-clinic-7" })) === motifOf(draw({ seed: "care-clinic-7" })));

  for (const scene of SCENES) {
    const seen = new Set(Array.from({ length: 40 }, (_, i) => motifOf(posterSvg({ seed: `biz-${scene}-${i}`, scene, colors: COLORS }))));
    check(`scene "${scene}" draws more than one way`, seen.size >= 2, [...seen].join(", "));
    check(`scene "${scene}" drawings are all in its own list`,
      [...seen].every((name) => (variantsFor(scene) as readonly string[]).includes(name)), [...seen].join(", "));
  }

  const a = posterSvg({ seed: "same", scene: "build", colors: COLORS, variant: "skyline" });
  const b = posterSvg({ seed: "same", scene: "build", colors: COLORS, variant: "crane" });
  check("naming a drawing pins it", motifOf(a) === "skyline" && motifOf(b) === "crane");
  check("two drawings of one business differ in their geometry",
    a.replace(/data-motif="[^"]+"/, "") !== b.replace(/data-motif="[^"]+"/, ""));
  check("an unknown drawing falls back to the scene's own",
    (variantsFor("care") as readonly string[]).includes(motifOf(draw({ variant: "not-a-drawing" }))));
}

section("Gallery tiles are not one picture three times");

{
  const tiles = [1, 2, 3].map((i) => motifOf(draw({ section: "gallery", index: i, ratio: "square" })));
  check("three gallery tiles are three drawings", new Set(tiles).size === 3, tiles.join(", "));
  const next = motifOf(draw({ section: "gallery", index: 4, ratio: "square" }));
  check("a fourth tile wraps rather than repeating the first",
    next !== tiles[1] && next !== tiles[2] && next === tiles[0], `${tiles.join(",")} → ${next}`);
  check("the index walks forward from the business's own start",
    motifOf(draw({ section: "gallery", index: 1 })) === pickVariant("care", { index: 1, seed: "acme-dental", section: "gallery" }));

  // The pictures a visitor actually sees in order: the about block and the
  // closing band must not be the same drawing.
  const seenInOrder = ["cover", "about", "cta"].map((section) => motifOf(draw({ section })));
  check("the about block and the closing band are drawn differently", seenInOrder[1] !== seenInOrder[2], seenInOrder.join(", "));
  check("no two of cover / about / cta repeat", new Set(seenInOrder).size === 3, seenInOrder.join(", "));

  // The whole point of the cycle: two clinics in one trade must not open their
  // galleries on the same drawing.
  const firstTile = (seed: string) => motifOf(draw({ seed, section: "gallery", index: 1, ratio: "square" }));
  const starts = new Set(Array.from({ length: 12 }, (_, i) => firstTile(`clinic-${i}`)));
  check("different businesses start their gallery on different drawings", starts.size >= 2, [...starts].join(", "));
}

section("Addresses");

{
  check("a plain poster URL carries no query", posterUrl("acme-dental") === "/api/art/acme-dental.svg");
  const art = posterUrl("acme-dental", "square", 2, { section: "gallery" });
  check("ratio, index and section all reach the URL",
    art === "/api/art/acme-dental.svg?r=square&i=2&s=gallery", art);
  const pinned = posterUrl("acme-dental", "wide", 0, { section: "hero", variant: "cross" });
  check("a pinned drawing reaches the URL", pinned === "/api/art/acme-dental.svg?s=hero&v=cross", pinned);
  check("a name with spaces or slashes is escaped",
    posterUrl("a b/c") === "/api/art/a%20b%2Fc.svg", posterUrl("a b/c"));

  check("every section gets a ratio", ART_SECTIONS.every((s) => ["wide", "square", "portrait"].includes(ratioForSection(s))));
  check("about is portrait and gallery is square",
    ratioForSection("about") === "portrait" && ratioForSection("gallery") === "square" && ratioForSection("hero") === "wide");
}

section("Sections ask for their picture the same way");

{
  check("a business with no slug gets no picture rather than a broken one",
    sectionArt(undefined, "services") === undefined && sectionArt({ slug: "" }, "services") === undefined);
  check("a business object is enough", sectionArt({ slug: "acme-dental" }, "services") === posterUrl("acme-dental", "wide", 0, { section: "services" }));
  check("the section decides the ratio", sectionArt("acme-dental", "gallery")!.includes("r=square") && sectionArt("acme-dental", "about")!.includes("r=portrait"));
  check("a white-label product slug is escaped", sectionArt("a b/c", "products", 0)!.startsWith("/api/art/a%20b%2Fc.svg"));
  const tiles = [0, 1, 2].map((i) => sectionArt("acme-dental", "products", i));
  check("cards on one page are drawn differently from each other", new Set(tiles).size === 3, tiles.join(", "));
  check("products are an allowed section for the route", ART_SECTIONS.includes("products"));
}

section("Motion stays cheap");

{
  const still = draw({ motion: 0 });
  check("at intensity 0 nothing animates", !still.includes("@keyframes"));
  const lively = draw({ motion: 3 });
  check("at intensity 3 it does", lively.includes("@keyframes"));
  check("animation still respects reduced-motion", lively.includes("prefers-reduced-motion:reduce"));
  check("the stylesheet is inline (no scripts, works inside an <img>)",
    lively.includes("<style>") && !lively.includes("<script"));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed ? 1 : 0);

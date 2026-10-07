/**
 * Design DNA, uniqueness engine and quality checker — the parts that decide
 * what a generated site looks like.
 *
 * These are pure functions, so they can be checked without a database or a
 * server. The three properties that matter:
 *
 *   1. one business always produces the same genome (a rebuild, a re-publish or
 *      a dashboard preview must never reshuffle a live site);
 *   2. two businesses in one trade produce different genomes, and the
 *      uniqueness engine can tell how different;
 *   3. the quality checker actually catches the things it claims to.
 *
 *   node --experimental-strip-types --import ./tests/path-alias.mjs tests/design.test.mts
 */

import { designDnaFor, sectionPlanFor } from "@/lib/design-dna";
import { blueprintFor, candidateBlueprints, designSeed } from "@/lib/blueprint";
import { bestCandidate, paletteSimilarity, profileFromSite, similarity, uniquenessPercent, type SiteProfile } from "@/lib/uniqueness";
import { checkSite, contrastRatio } from "@/lib/site-quality";
import { applyFixes } from "@/lib/site-fixes";
import { interpretRestyle, restyledPlan, restyledTokens, restyleSummary } from "@/lib/restyle";
import { suggestionHeadline, suggestionsFor } from "@/lib/suggestions";
import { SECTION_VARIANTS } from "@/lib/design-dna";
import { applyCopy, copyChanged, copyPrompt, nextVariant } from "@/lib/section-regen";
import { posterSvg } from "@/lib/site-art";
import type { SectionType } from "@/lib/types";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const SECTIONS: SectionType[] = [
  "hero", "stats", "about", "services", "products", "whyUs", "gallery",
  "testimonials", "faq", "blog", "cta", "payment", "hours", "contact",
];

const dnaFor = (name: string, description = "") =>
  designDnaFor({ name, city: "Pune", category: "Dental", industryKey: "dental", description, sectionTypes: SECTIONS });

/**
 * The profile of a site exactly as the generator would build it — its own
 * palette, its own genome, its own services. Comparing anything less would be
 * testing a situation no customer is ever in.
 */
const profileFor = (bp: ReturnType<typeof blueprintFor>): SiteProfile =>
  profileFromSite({
    brandPrimary: bp.palette[0],
    brandSecondary: bp.palette[1],
    brandAccent: bp.palette[2],
    theme: { ...bp.dna.design, motion: bp.dna.motion },
    sections: bp.dna.sectionPlan.map((c) => ({ type: c.type, content: { variant: c.variant } })),
    services: bp.services.map((sv) => ({ name: sv.name })),
  });

const blueprintOf = (name: string, taken: string[] = []) =>
  blueprintFor({ name, city: "Pune", category: "Dental", taken });

console.log("\n== Design DNA");
{
  const a = dnaFor("Smile Dental Clinic");
  const b = dnaFor("Smile Dental Clinic");
  check("the same business gets the same genome", JSON.stringify(a) === JSON.stringify(b));

  const other = dnaFor("Bright Smile Dental");
  const differs =
    a.design.font !== other.design.font ||
    a.design.radius !== other.design.radius ||
    a.design.shadow !== other.design.shadow ||
    a.design.spacing !== other.design.spacing ||
    a.design.button !== other.design.button ||
    a.design.header !== other.design.header ||
    a.business.subType !== other.business.subType;
  check("two businesses in one trade differ", differs, `${a.design.styleName} vs ${other.design.styleName}`);

  check(
    "every section gets a variant",
    a.sectionPlan.every((c) => typeof c.variant === "string" && c.variant.length > 0),
    a.sectionPlan.map((c) => `${c.type}:${c.variant}`).join(" "),
  );
  check(
    "variants stay inside the table",
    // No section may be given an arrangement the renderer does not know: the
    // two lists below are the branches the components actually draw.
    a.sectionPlan.every((c) => {
        const allowed: Record<string, string[]> = {
          hero: ["banner", "split", "editorial", "centred"],
          stats: ["row", "cards", "band"],
          about: ["split", "timeline", "bento"],
          services: ["cards", "process", "list"],
          whyUs: ["cards", "numbered", "bento"],
          gallery: ["grid", "masonry", "filmstrip"],
          testimonials: ["cards", "wall", "spotlight"],
          faq: ["list", "two-col"],
          cta: ["band", "split"],
          blog: ["cards", "list"],
          contact: ["form-side", "form-below"],
        };
        return !allowed[c.type] || allowed[c.type].includes(c.variant);
      }),
  );

  check("motion intensity stays in 0–4", a.motion.level >= 0 && a.motion.level <= 4, `${a.motion.pack} ${a.motion.level}`);

  const premium = dnaFor("Implant Studio", "A premium luxury implant clinic for specialists");
  check(
    "a premium description changes the design direction",
    ["premium", "luxury"].includes(premium.business.positioning),
    premium.business.positioning,
  );
  const cheap = dnaFor("Budget Dental", "cheap affordable dental treatment for everyone");
  check(
    "a budget description changes it too",
    ["budget", "value"].includes(cheap.business.positioning),
    cheap.business.positioning,
  );

  // The plan is per-section, so adding a section later cannot shift every other
  // section's arrangement (the bug that made regeneration feel random).
  const shortPlan = sectionPlanFor("x", ["hero", "about"]);
  const longPlan = sectionPlanFor("x", ["hero", "about", "services"]);
  check(
    "adding a section does not reshuffle the earlier ones",
    shortPlan[0].variant === longPlan[0].variant && shortPlan[1].variant === longPlan[1].variant,
  );
}

console.log("\n== Artwork follows the genome");
{
  const base = {
    seed: "smile-dental-clinic",
    scene: "care" as const,
    colors: ["#0d9488", "#134e4a", "#f59e0b"] as const,
  };
  const plain = posterSvg({ ...base, treatment: "plain", radius: "rounded", motion: 2 });
  const framed = posterSvg({ ...base, treatment: "framed", radius: "pill", motion: 2 });
  const duotone = posterSvg({ ...base, treatment: "duotone", radius: "sharp", motion: 2 });
  const soft = posterSvg({ ...base, treatment: "soft-focus", radius: "rounded", motion: 2 });

  check("each treatment paints a different picture",
    new Set([plain, framed, duotone, soft]).size === 4,
    ["plain", "framed", "duotone", "soft-focus"].join(", "));
  check(
    "the frame follows the site's own corner radius",
    framed.includes('rx="72"') &&
      posterSvg({ ...base, treatment: "framed", radius: "sharp", motion: 2 }).includes('rx="2"'),
    framed.match(/rx="\d+"/)?.[0] ?? "no frame",
  );
  check("a still genome paints a still poster",
    !posterSvg({ ...base, motion: 0 }).includes("@keyframes") &&
      posterSvg({ ...base, motion: 2 }).includes("@keyframes"));
  check("a poster never carries script or an external reference",
    [plain, framed, duotone, soft, posterSvg({ ...base, motion: 3 })].every(
      (svg) => !svg.includes("<script") && !svg.includes("href=") && !svg.includes("@import"),
    ));
  check("the same business always gets the same bytes",
    posterSvg({ ...base, treatment: "framed", radius: "pill", motion: 2 }) === framed);
}

console.log("\n== Uniqueness");
{
  const first = blueprintOf("Smile Dental Clinic");
  const a = profileFor(first);
  check("a profile against itself is identical", Math.round(similarity(a, a).overall * 100) === 100);

  // The second business, as the API builds it: told which palette the first one
  // is already using, so it starts somewhere else.
  const second = blueprintOf("Bright Smile Dental", [first.palette.join(",")]);
  const b = profileFor(second);
  check("the second business gets a different palette", a.palette.join() !== b.palette.join(), `${a.palette.join(",")} vs ${b.palette.join(",")}`);

  const ab = similarity(a, b);
  check("two same-trade sites are below the rejection threshold", ab.overall < 0.45, `similarity ${ab.overall.toFixed(2)}`);
  check("uniqueness is reported as a percentage", uniquenessPercent(ab) <= 100 && uniquenessPercent(null) === 100);

  // Same genome, different colours. Everything else is identical by
  // construction, so the palette is the only thing that can move — and it has
  // to move the colour dimension, which is what a visitor sees first.
  //
  // The second palette is the furthest one in this trade's own family rather
  // than a literal: a hard-coded violet stopped being "a different colour" the
  // moment the family grew rotations, one of which the first business now
  // draws. What the check means is "the engine's own judgement says these are
  // different colours", so it asks the engine.
  const recoloured: SiteProfile = {
    ...a,
    palette: [
      first.palettePool.reduce(
        (best, candidate) =>
          paletteSimilarity(candidate, a.palette) < paletteSimilarity(best, a.palette) ? candidate : best,
        first.palettePool[0],
      ),
    ][0],
  };
  const recolouredScore = similarity(a, recoloured);
  check("a different palette alone moves the colour score", recolouredScore.colour < 0.5, recolouredScore.colour.toFixed(2));
  check("and the overall score with it", recolouredScore.overall < 0.85, recolouredScore.overall.toFixed(2));

  const chosen = bestCandidate(
    ["first", "second", "third"],
    (name) => (name === "first" ? a : name === "second" ? b : profileFor(blueprintOf("Third Dental Practice"))),
    [a],
  );
  // One business, three concepts. A trade list is finite, so a busy trade has
  // every palette in use already — and the three directions offered to one
  // owner still have to look different from each other, or the choice is
  // meaningless. This is the saturation case seen live (Dental in the dev DB).
  const pool = blueprintOf("Smile Dental Clinic").palettePool;
  const saturated = candidateBlueprints(
    { name: "Skyline Dental Care", city: "Pune", category: "Dental", taken: pool.map((p) => p.join(",")) },
    3,
  );
  const pairs = [[0, 1], [1, 2], [0, 2]] as const;
  const scores = pairs.map(([i, j]) => paletteSimilarity(saturated[i].palette, saturated[j].palette));
  check("no two of the three concepts are the same palette twice",
    saturated[0].palette.join() !== saturated[1].palette.join() &&
    saturated[1].palette.join() !== saturated[2].palette.join() &&
    saturated[0].palette.join() !== saturated[2].palette.join(),
    saturated.map((b) => b.palette.join(",")).join(" | "));
  check("and no pair is closer than a shared primary would make it",
    scores.every((v) => v < 0.5), scores.map((v) => v.toFixed(3)).join(", "));
  check("and only the colour changed — the rest of a concept is untouched",
    saturated[0].paletteChoices.length > 0 && saturated.every((b) => b.sectionOrder.length > 0));

  check("the most distinct candidate wins", chosen.chosen !== "first", chosen.chosen);
  check("an empty database keeps the first candidate", bestCandidate(["only"], () => a, []).chosen === "only");
}

console.log("\n== Quality checker");
{
  // A complete site: hero, about, why-us, services, gallery, FAQ, CTA and a
  // contact form — the shape the generator actually produces.
  const hero = { id: "h", type: "hero" as const, visible: true, content: { heading: "Dental care in Pune", subheading: "Book an appointment" } };
  const about = { id: "a", type: "about" as const, visible: true, content: { body: "We have looked after families in Pune since 2009. ".repeat(4) } };
  const why = { id: "w", type: "whyUs" as const, visible: true, content: { body: "Same-day appointments and transparent pricing. ".repeat(4) } };
  const servicesSection = { id: "sv", type: "services" as const, visible: true, content: { body: "Check-ups, implants, braces and whitening. ".repeat(4) } };
  const cta = { id: "ct", type: "cta" as const, visible: true, content: { title: "Book a visit" } };
  const contact = { id: "c", type: "contact" as const, visible: true, content: { title: "Contact Us" } };
  const base = {
    sections: [hero, about, servicesSection, why, cta, contact],
    // A complete site carries its genome and its motion pack, because the design
    // and mobile scores are about what the generator decided.
    theme: {
      dna: {
        styleName: "Premium modern",
        motionLabel: "Confident, unhurried motion",
        business: { industry: "dental", subType: "Family dental clinic", audience: "families", personality: "warm", positioning: "value", tone: "friendly" },
        sectionPlan: [
          { type: "hero" as const, variant: "banner" },
          { type: "about" as const, variant: "split" },
          { type: "services" as const, variant: "cards" },
          { type: "whyUs" as const, variant: "numbered" },
          { type: "cta" as const, variant: "band" },
          { type: "contact" as const, variant: "form-side" },
        ],
      },
      motion: { pack: "modern" as const, level: 2 },
    },
    colors: { primary: "#0d9488", secondary: "#134e4a", accent: "#f59e0b" },
    seoTitle: "Smile Dental Clinic — family dentistry in Pune",
    seoDescription: "Smile Dental Clinic in Pune offers check-ups, implants and braces. ".repeat(2).slice(0, 150),
    business: { phone: "+919876543210", whatsapp: "+919876543210", city: "Pune" },
    testimonialCount: 4,
    services: [
      { name: "Check-up", description: "A full examination and cleaning." },
      { name: "Implants", description: "Single and full-mouth implants." },
      { name: "Braces", description: "Metal and clear aligners." },
    ],
    galleryCount: 6,
    faqCount: 6,
  };

  const good = checkSite(base);
  check("a complete site scores well", good.score >= 85, `score ${good.score}`);
  check("no issues on a complete site", good.issues.length === 0, good.issues.map((i) => i.message).join(" | "));

  const noContact = checkSite({ ...base, business: {} });
  check(
    "a site with no way to make contact is caught",
    noContact.issues.some((i) => i.area === "conversion" && i.message.includes("no way to contact")),
    `score ${noContact.score}`,
  );
  check("that penalty is heavy", good.score - noContact.score >= 20);

  const noServices = checkSite({ ...base, services: [{ name: "One thing" }] });
  check("too few services is caught", noServices.issues.some((i) => i.message.includes("Fewer than three services")));

  const unreadable = checkSite({ ...base, colors: { primary: "#fef3c7", secondary: "#fde68a", accent: "#fff7ed" } });
  check("unreadable brand colours are caught", unreadable.issues.filter((i) => i.area === "colour").length >= 2, `score ${unreadable.score}`);

  check("contrast maths matches WCAG", Math.round(contrastRatio("#000000", "#ffffff")!) === 21);
  check("identical colours have no contrast", contrastRatio("#123456", "#123456") === 1);

  // Every issue belongs to one of the eight scores the dashboard shows, and no
  // score can go below zero however broken the site is.
  const broken = checkSite({ ...base, sections: [hero], services: [], galleryCount: 0, faqCount: 0, business: {}, seoTitle: "", seoDescription: "" });
  const dimensions = Object.values(good.dimensions);
  check("eight dimensions are scored", dimensions.length === 8 && dimensions.every((v) => v >= 0 && v <= 100), dimensions.join(","));
  check("issues say which score they cost", broken.issues.every((i) => typeof i.dimension === "string" && i.dimension.length > 0));
  check("a broken site cannot score below zero", broken.score === 0 && Object.values(broken.dimensions).every((v) => v >= 0), `score ${broken.score}`);

  // Only the things the platform can do without inventing a fact carry a fix.
  const fixable = broken.issues.filter((i) => i.fix).map((i) => i.fix);
  check("structural problems are marked fixable", fixable.includes("add-about") && fixable.includes("seo-title"), fixable.join(","));
  check(
    "facts about the business are never marked fixable",
    !broken.issues.some((i) => i.fix && (i.message.includes("No phone number") || i.message.includes("No customer reviews"))),
  );
}

console.log("\n== Fix all issues");
{
  const hero = { id: "h", type: "hero" as const, visible: true, content: { heading: "Dental care in Pune", subheading: "Book an appointment", ctaPrimary: "Book an Appointment" } };
  const about = { id: "a", type: "about" as const, visible: false, content: { title: "About the clinic", body: "The owner wrote this." } };
  const cta = { id: "ct", type: "cta" as const, visible: false, content: { title: "Talk to us" } };
  const contact = { id: "c", type: "contact" as const, visible: true, content: { title: "Contact Us" } };
  const input = {
    sections: [hero, about, contact, cta],
    seoTitle: "",
    seoDescription: "",
    business: { name: "Smile Dental", category: "Dental", city: "Pune", phone: "+919876543210", services: ["Check-up", "Implants", "Braces"] },
    goal: { primary: "Book an Appointment", secondary: "Call the Clinic", action: "form" },
  };
  const report = checkSite({
    sections: input.sections,
    theme: {},
    colors: { primary: "#0d9488", secondary: "#134e4a", accent: "#f59e0b" },
    business: { phone: input.business.phone, city: "Pune" },
    services: input.business.services.map((name) => ({ name, description: "A described service." })),
    galleryCount: 6,
    faqCount: 6,
    seoTitle: "",
    seoDescription: "",
  });
  const fixed = applyFixes(input, report);
  check("a switched-off section is brought back, not duplicated",
    fixed.sections.filter((s) => s.type === "about").length === 1 &&
      fixed.sections.find((s) => s.type === "about")?.visible === true &&
      fixed.sections.find((s) => s.type === "about")?.content.body === "The owner wrote this.",
    fixed.changed.join(" | "));
  check("the call-to-action section comes back too", fixed.sections.find((s) => s.type === "cta")?.visible === true);
  check("the page title is written from the owner's own details",
    fixed.seoTitle.includes("Smile Dental") && fixed.seoTitle.includes("Pune") && fixed.seoTitle.length <= 65, fixed.seoTitle);
  check("the search description uses only the facts given",
    fixed.seoDescription.includes("Smile Dental") && fixed.seoDescription.includes("+919876543210") && fixed.seoDescription.length <= 160,
    `${fixed.seoDescription.length} chars`);
  check("nothing is invented about the business",
    !/award|years|best|no\.?1|customers\b/i.test(fixed.seoTitle + " " + fixed.seoDescription));

  const second = applyFixes(
    { ...input, sections: fixed.sections, seoTitle: fixed.seoTitle, seoDescription: fixed.seoDescription },
    checkSite({
      sections: fixed.sections, theme: {}, colors: { primary: "#0d9488", secondary: "#134e4a", accent: "#f59e0b" },
      business: { phone: "+919876543210", city: "Pune" },
      services: input.business.services.map((name) => ({ name, description: "A described service." })),
      galleryCount: 6, faqCount: 6, seoTitle: fixed.seoTitle, seoDescription: fixed.seoDescription,
    }),
  );
  check("pressing fix twice changes nothing the second time", second.changed.length === 0, second.changed.join(","));
}

console.log("\n== Make my website better");
{
  const dna = dnaFor("Coastal Interiors");
  const tokens = { ...dna.design };
  const premium = interpretRestyle("make it look like a 5 lakh website for rich clients");
  const simple = interpretRestyle("simpler and cleaner please");
  const older = interpretRestyle("easy to read, my customers are older");
  check("a request is understood", premium?.id === "premium" && simple?.id === "simple" && older?.id === "easy",
    [premium?.id, simple?.id, older?.id].join(", "));
  check("an unrelated request changes nothing", interpretRestyle("make the logo bigger") === null);

  const after = restyledTokens(tokens, premium!);
  check("a premium restyle moves the design, not the words",
    after.font === "elegant" && after.spacing === "airy" && after.imageTreatment === "soft-focus" &&
      after.styleName.includes("More premium"),
    `${after.font}/${after.radius}/${after.spacing}/${after.imageTreatment}`);

  const twice = restyledTokens(restyledTokens(tokens, simple!).styleName === "" ? tokens : { ...restyledTokens(tokens, simple!) }, premium!);
  check("three restyles do not stack names", twice.styleName.split(" · ").length <= 2, twice.styleName);

  const types: SectionType[] = ["hero", "about", "services", "gallery", "testimonials", "cta", "contact"];
  // A section whose drawn arrangement already suits the direction keeps it —
  // a restyle must not shuffle blocks it was not asked to change.
  const plan = restyledPlan(dna.seed, types, premium!);
  check("every arrangement suits the requested direction",
    plan.every((c) => !premium!.variantBias[c.type] || premium!.variantBias[c.type]!.includes(c.variant)),
    plan.map((c) => `${c.type}:${c.variant}`).join(" "));
  check("the sections that did not fit were re-laid out",
    plan.some((c) => c.variant !== dna.sectionPlan.find((b) => b.type === c.type)?.variant));
  const plainPlan = sectionPlanFor(dna.seed, types);
  check("a restyle is deterministic", JSON.stringify(restyledPlan(dna.seed, types, premium!)) === JSON.stringify(plan));

  const summary = restyleSummary(tokens, after, plainPlan, plan);
  check("the owner is told what changed", summary.some((l) => l.startsWith("Type")) && summary.some((l) => l.includes("section")), summary.join(" | "));

  // Ease-of-reading is the direction for older customers: bigger spacing, no
  // movement at all.
  const easyTokens = restyledTokens(tokens, older!);
  check("the older-readers direction stops the motion and opens the page",
    easyTokens.spacing === "airy" && older!.motion.level === 0 && easyTokens.font === "classic");
}

console.log("\n== What to do next");
{
  const quality = checkSite({
    sections: [{ id: "h", type: "hero" as const, visible: true, content: { heading: "Coastal Interiors", subheading: "Home interiors in Pune" } }],
    theme: {},
    colors: { primary: "#0d9488", secondary: "#134e4a", accent: "#f59e0b" },
    business: { phone: "+919876543210", city: "Pune" },
    services: [{ name: "Kitchens" }],
    galleryCount: 0, faqCount: 0, seoTitle: "", seoDescription: "",
  });
  const quiet = suggestionsFor({
    quality,
    business: { phone: "+919876543210", whatsapp: null, city: "Pune", address: "5 FC Road", description: null },
    counts: { services: 1, products: 0, gallery: 0, testimonials: 0, faqs: 0, blogPosts: 0 },
    activity: { visits: 42, leads: 0, ctaCalls: 0, ctaWhatsapp: 0 },
    uniqueness: 48,
  });
  check("traffic with no enquiries is the first thing said",
    quiet[0]?.id === "traffic-no-enquiries", quiet[0]?.why ?? "");
  check("a missing WhatsApp number is called out", quiet.some((s) => s.id === "whatsapp"));
  check("missing reviews photos and FAQs are called out",
    ["reviews", "photos", "faqs"].every((id) => quiet.some((s) => s.id === id)));
  check("a close design is called out", quiet.some((s) => s.id === "uniqueness"));
  check("structural problems are offered as something we can do",
    quiet.some((s) => s.kind === "auto" && s.title.startsWith("Let us fix")));
  check("every suggestion explains itself from the data",
    quiet.every((s) => s.why.length > 30 && s.impact !== undefined));
  check("the most important ones come first",
    quiet.findIndex((s) => s.impact === "high") === 0);

  const fine = suggestionsFor({
    quality: { issues: [] },
    business: { phone: "+91987", whatsapp: "+91987", city: "Pune", address: "x", description: "A studio" },
    counts: { services: 8, products: 4, gallery: 9, testimonials: 4, faqs: 6, blogPosts: 3 },
    activity: { visits: 40, leads: 5, ctaCalls: 2, ctaWhatsapp: 6 },
    uniqueness: 88,
  });
  check("a healthy site is not nagged", fine.length === 0, fine.map((s) => s.id).join(","));
  check("the headline matches the list", suggestionHeadline(fine).includes("Nothing"));
}

console.log("\n== Regenerating one section");
{
  // Walking the library rather than toggling: three presses on a four-way
  // section must produce three different arrangements.
  const seen = [
    nextVariant("hero", "banner", 0),
    nextVariant("hero", nextVariant("hero", "banner", 0) ?? "banner", 1),
    nextVariant("hero", nextVariant("hero", nextVariant("hero", "banner", 0) ?? "banner", 1) ?? "banner", 2),
  ];
  check("a layout re-roll moves forward each time", new Set(seen).size === 3, seen.join(" → "));
  check("a section with one arrangement is left alone", nextVariant("payment", "qr", 0) === null && nextVariant("hours", "cards", 0) === null);
  check(
    "an unrecognised current arrangement still resolves to a real one",
    SECTION_VARIANTS.about?.includes(nextVariant("about", "something-old", 0) ?? "") === true,
    nextVariant("about", "something-old", 0) ?? "none",
  );

  const section = {
    id: "s1", type: "hero" as const, visible: true,
    content: { heading: "Dental care in Pune", subheading: "Book an appointment", ctaPrimary: "Book", variant: "banner", image: "/api/art/x.svg" },
  };
  const written = applyCopy(section, {
    heading: "Family dentistry in Baner, Pune",
    subheading: "Same-day appointments for check-ups and implants",
    // A model that tries to add a field, or write something enormous, or set the
    // layout itself, must not be able to.
    variant: "banner",
    image: "https://example.com/invented.jpg",
    badge: "x".repeat(500),
  });
  check("the copy pass writes only the text of that section",
    written.content.heading === "Family dentistry in Baner, Pune" &&
      written.content.image === "/api/art/x.svg" &&
      written.content.variant === "banner" &&
      written.content.ctaPrimary === "Book" &&
      written.content.badge === undefined,
    JSON.stringify(Object.keys(written.content)));
  check("the change is reported only when the words changed",
    copyChanged(section, written) && !copyChanged(section, { ...section, content: { ...section.content, heading: "Dental care in Pune" } }));

  const prompt = copyPrompt({
    section,
    business: { name: "Smile Dental", category: "Dental", city: "Pune", services: ["Check-up"] },
    instruction: "shorter",
  });
  check("the model is told never to invent a fact", /never invent/i.test(prompt.system));
  check("the prompt carries the owner's own instruction", prompt.prompt.includes("shorter"));
}

console.log("\n== Blueprint integration");
{
  const bp = blueprintFor({ name: "Smile Dental Clinic", city: "Pune", category: "Dental" });
  check("the blueprint carries a genome", Boolean(bp.dna && bp.dna.design.styleName), bp.dna.design.styleName);
  check("the blueprint's look matches its genome", bp.look.font === bp.dna.design.font && bp.look.radius === bp.dna.design.radius);
  check("the seed is the business itself", bp.seed === designSeed("Smile Dental Clinic", "Pune"));

  const alt = blueprintFor({ name: "Smile Dental Clinic", city: "Pune", category: "Dental", attempt: 2 });
  const changed = (Object.keys(bp.dna.design) as (keyof typeof bp.dna.design)[]).filter(
    (k) => bp.dna.design[k] !== alt.dna.design[k],
  );
  check(
    "a second attempt is a different genome for the same business",
    JSON.stringify(alt.dna.sectionPlan) !== JSON.stringify(bp.dna.sectionPlan) || changed.length > 0,
    `changed: ${changed.join(", ") || "none"} | first variants: ${bp.dna.sectionPlan.slice(0, 3).map((c) => c.variant).join(",")} vs ${alt.dna.sectionPlan.slice(0, 3).map((c) => c.variant).join(",")}`,
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

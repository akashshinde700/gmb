/**
 * Unit tests for the A/B test engine.
 *
 *   node --experimental-strip-types --import ./tests/path-alias.mjs tests/experiments.test.mts
 *
 * The rules worth pinning: a visitor keeps their variant, the split is even,
 * variant A is the live page untouched, the result is a rate rather than a
 * count, and the verdict is honest about small numbers.
 */

import {
  alternativePrompt, applyVariant, cleanVariantContent, tallyExperiment, testableFields, variantFor, variantsDiffer,
  type Experiment,
} from "../src/lib/experiments.ts";
import type { SiteSection } from "../src/lib/types.ts";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title: string) {
  console.log(`\n== ${title}`);
}

const EXPERIMENT: Experiment = {
  key: "hero",
  status: "running",
  metric: "enquiries",
  startedAt: "2026-10-07T00:00:00.000Z",
  variants: [
    { id: "a", content: { heading: "Dental care in Baner" }, source: "site" },
    { id: "b", content: { heading: "Same-day appointments in Baner" }, source: "ai" },
  ],
};

const SECTIONS = [
  { id: "h", type: "hero" as const, visible: true, content: { heading: "Dental care in Baner", subheading: "Book online" } },
  { id: "s", type: "services" as const, visible: true, content: { title: "What we do" } },
  { id: "c", type: "cta" as const, visible: true, content: { title: "Call us" } },
];

section("Who sees what");

{
  const visitor = "vabcdef12345678";
  check("a visitor's variant is stable", variantFor(EXPERIMENT, visitor) === variantFor(EXPERIMENT, visitor));
  check("the same visitor in the same test always gets the same headline",
    new Set(Array.from({ length: 5 }, () => variantFor(EXPERIMENT, visitor))).size === 1);

  const many = Array.from({ length: 400 }, (_, i) => variantFor(EXPERIMENT, `visitor-${i}`));
  const bShare = many.filter((v) => v === "b").length / many.length;
  check("the split is roughly even", bShare > 0.42 && bShare < 0.58, `b share ${Math.round(bShare * 100)}%`);

  check("a new test re-randomises the split",
    Array.from({ length: 50 }, (_, i) => variantFor({ ...EXPERIMENT, startedAt: "2026-11-01T00:00:00.000Z" }, `visitor-${i}`)).join("")
      !== Array.from({ length: 50 }, (_, i) => variantFor(EXPERIMENT, `visitor-${i}`)).join(""));

  check("a visitor with no id is not split into anything", variantFor(EXPERIMENT, "") === "a");
}

section("What the page renders");

{
  const a = applyVariant(SECTIONS, EXPERIMENT, "visitor-that-hashes-to-a");
  const b = applyVariant(SECTIONS, EXPERIMENT, "visitor-that-hashes-to-b");
  const findVisitor = (wanted: "a" | "b") => {
    for (let i = 0; i < 200; i++) if (variantFor(EXPERIMENT, `x${i}`) === wanted) return `x${i}`;
    return "";
  };
  const aVisitor = findVisitor("a");
  const bVisitor = findVisitor("b");
  check("the two visitors land in different variants", aVisitor !== bVisitor);

  const seenA = applyVariant(SECTIONS, EXPERIMENT, aVisitor);
  const seenB = applyVariant(SECTIONS, EXPERIMENT, bVisitor);
  check("variant A is the owner's live page, untouched",
    JSON.stringify(seenA.sections) === JSON.stringify(SECTIONS), JSON.stringify(seenA.sections[0].content));
  check("variant B changes only the tested section's words",
    seenB.sections[0].content.heading === "Same-day appointments in Baner" &&
      seenB.sections[0].content.subheading === "Book online" &&
      JSON.stringify(seenB.sections[1]) === JSON.stringify(SECTIONS[1]) &&
      JSON.stringify(seenB.sections[2]) === JSON.stringify(SECTIONS[2]));
  check("the applied variant is reported for the analytics",
    seenB.applied?.variant === "b" && seenB.applied?.key === "hero");
  check("a stopped test changes nothing", applyVariant(SECTIONS, { ...EXPERIMENT, status: "stopped" }, bVisitor).applied === null);
  check("no test means no change at all", applyVariant(SECTIONS, null, bVisitor).sections === SECTIONS);
  void a; void b;
}

section("Reading the result honestly");

{
  const event = (variant: "a" | "b", type: string) => ({ type, variant, experiment: "hero" });

  const empty = tallyExperiment(EXPERIMENT, []);
  check("with no visitors it says so rather than picking a winner",
    empty.verdict.includes("Nobody has seen"), empty.verdict);

  const uneven = tallyExperiment(EXPERIMENT, [
    // 40 visitors on A with 2 enquiries; 40 on B with 9.
    ...Array.from({ length: 40 }, () => event("a", "VISIT")),
    ...Array.from({ length: 40 }, () => event("b", "VISIT")),
    event("a", "CTA_CALL"), event("a", "FORM_SUBMIT"),
    ...Array.from({ length: 8 }, () => event("b", "CTA_WHATSAPP")), event("b", "FORM_SUBMIT"),
  ]);
  const a = uneven.variants.find((v) => v.id === "a")!;
  const b = uneven.variants.find((v) => v.id === "b")!;
  check("per-variant tallies count visits and actions", a.visits === 40 && a.actions === 2 && b.visits === 40 && b.actions === 9,
    JSON.stringify(uneven.variants));
  check("the better variant is called out", uneven.leading === "b" && uneven.decided, JSON.stringify(uneven));
  check("the verdict names the winner in the owner's language", uneven.verdict.includes("winning"), uneven.verdict);
  check("the rate is per visitor, not a raw count", uneven.verdict.includes("5%") && uneven.verdict.includes("22.5%"), uneven.verdict);

  const thin = tallyExperiment(EXPERIMENT, [
    ...Array.from({ length: 6 }, () => event("a", "VISIT")),
    ...Array.from({ length: 6 }, () => event("b", "VISIT")),
    event("b", "CTA_CALL"),
  ]);
  check("with twelve visitors it refuses to call it", !thin.decided && thin.verdict.includes("Too early"), thin.verdict);

  const neck = tallyExperiment(EXPERIMENT, [
    ...Array.from({ length: 50 }, () => event("a", "VISIT")),
    ...Array.from({ length: 50 }, () => event("b", "VISIT")),
    ...Array.from({ length: 3 }, () => event("a", "CTA_CALL")),
    ...Array.from({ length: 3 }, () => event("b", "CTA_CALL")),
  ]);
  check("a tie is reported as a tie, not as a winner", !neck.decided && neck.verdict.includes("neck and neck"), neck.verdict);

  const otherTest = tallyExperiment(EXPERIMENT, [event("a", "VISIT"), { type: "VISIT", variant: "b", experiment: "cta" }]);
  check("events from another test are ignored", otherTest.variants[1].visits === 0);
  const noVariant = tallyExperiment(EXPERIMENT, [{ type: "VISIT" }, { type: "VISIT", variant: "c" }]);
  check("events with no variant are ignored", noVariant.variants.every((v) => v.visits === 0));
}

section("What may be tested, and what may be written");

{
  check("the headline can be tested", testableFields("hero").includes("heading"));
  check("a payment QR cannot", testableFields("payment").length === 0);
  check("only allowed fields survive from a model",
    JSON.stringify(cleanVariantContent("hero", { heading: "New", subheading: "Also new", variant: "banner", image: "x.jpg" })) ===
      JSON.stringify({ heading: "New", subheading: "Also new" }));
  check("an over-long value is dropped", cleanVariantContent("hero", { heading: "x".repeat(300) }).heading === undefined);
  check("identical variants are not a test",
    !variantsDiffer({ heading: "A" }, { heading: "A" }) && variantsDiffer({ heading: "A" }, { heading: "B" }));

  const prompt = alternativePrompt({
    sectionType: "hero",
    current: { heading: "Dental care in Baner" },
    business: { name: "Skyline Dental", category: "Dental", city: "Pune" },
    goal: "Appointments",
  });
  check("the model is asked for a different angle, not synonyms", /different angle/i.test(prompt.prompt));
  check("and told never to invent a fact", /never invent/i.test(prompt.system));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed ? 1 : 0);

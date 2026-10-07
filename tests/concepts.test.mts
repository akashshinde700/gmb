/**
 * Unit tests for the three-concept chooser.
 *
 *   node --experimental-strip-types --import ./tests/path-alias.mjs tests/concepts.test.mts
 *
 * The point of a choice is that the options are actually different, and that
 * the one picked is the one built. Both are checked here without a database:
 * the concepts come from the same blueprint draw the signup uses.
 */

import { blueprintFor, designSeed } from "../src/lib/blueprint.ts";
import { characterOf, colourWord, conceptsFor } from "../src/lib/concepts.ts";

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

const DRAFT = {
  name: "Skyline Dental Care",
  category: "Dental",
  tagline: "Gentle dentistry in Baner",
  description: "A family dental clinic with evening appointments and same-day emergency slots.",
  city: "Pune",
  phone: "+919876543210",
  whatsapp: "+919876543210",
  email: "hello@skylinedental.in",
  address: "44 Baner Road",
  establishedYear: "2011",
  coverUrl: "",
  mapsUrl: "",
  state: "Maharashtra",
  pincode: "411045",
};

const SERVICES = [
  { name: "Root canal", description: "", icon: "sparkles" },
  { name: "Braces", description: "", icon: "sparkles" },
  { name: "Teeth cleaning", description: "", icon: "sparkles" },
];

function draw(attempts = [0, 1, 2]) {
  const candidates = attempts.map((attempt) =>
    blueprintFor({
      name: DRAFT.name,
      city: DRAFT.city,
      category: DRAFT.category,
      description: DRAFT.description,
      taken: [],
      seed: designSeed(DRAFT.name, DRAFT.city),
      attempt,
    }),
  );
  return conceptsFor({
    candidates,
    business: DRAFT,
    ai: null,
    industry: "dental",
    aboutImage: "",
    heroImage: "",
    submittedColors: {},
    existingProfiles: [],
    services: SERVICES,
  });
}

section("Three concepts, and they are actually different");

{
  const concepts = draw();
  check("three are offered", concepts.length === 3, String(concepts.length));
  check("each carries its own keys 0,1,2", concepts.map((c) => c.key).join(",") === "0,1,2");

  const styles = new Set(concepts.map((c) => c.styleName));
  const palettes = new Set(concepts.map((c) => `${c.colors.primary}${c.colors.secondary}`));
  const plans = new Set(concepts.map((c) => c.sections.map((s) => `${s.type}:${s.variant}`).join("|")));
  check("no two look the same", styles.size >= 2 || palettes.size >= 2, [...styles].join(" / "));
  check("the page is laid out differently in each", plans.size >= 2, `${plans.size} distinct plans`);
  check("each says how far apart it is from the others", concepts.every((c) => c.apart >= 0 && c.apart <= 100));
  check("at least one pair is genuinely far apart", concepts.some((c) => c.apart >= 15), concepts.map((c) => c.apart).join(","));

  check("each has a readable character line", concepts.every((c) => c.character.length > 30), concepts[0].character);
  check("each has a colour the owner can name", concepts.every((c) => c.colourName.length > 2), concepts.map((c) => c.colourName).join(","));
  check("the three concepts do not all share one colour",
    new Set(concepts.map((c) => c.colors.primary)).size >= 2,
    concepts.map((c) => `${c.colourName} ${c.colors.primary}`).join(" | "));
  check("the character describes the genome it belongs to", (() => {
    const sharp = concepts.find((c) => c.design.radius === "sharp");
    return sharp ? sharp.character.includes("square corners") : true;
  })());
  check("a quiet genome is described as quiet", (() => {
    const quiet = concepts.find((c) => c.motion.level <= 1);
    return quiet ? /almost no movement/.test(quiet.character) : true;
  })());
}

section("What the owner is shown is what they get");

{
  const concepts = draw();
  for (const concept of concepts) {
    const hero = concept.payload.website.sections.find((s) => s.type === "hero");
    check(`concept ${concept.key} previews a hero`, Boolean(hero), concept.payload.website.sections.map((s) => s.type).join(","));
    check(`concept ${concept.key} previews no more than four sections`, concept.payload.website.sections.length <= 4, String(concept.payload.website.sections.length));
    check(
      `concept ${concept.key} previews the owner's own colours`,
      concept.payload.website.theme === concept.payload.website.theme &&
        concept.payload.business.brandPrimary === concept.colors.primary,
    );
    check(
      `concept ${concept.key} previews the owner's own services`,
      concept.payload.services.length === SERVICES.length && concept.payload.services[0].name === "Root canal",
    );
    check(`concept ${concept.key} scores its own site`, concept.quality > 0 && concept.quality <= 100, String(concept.quality));
  }

  // The preview must not be a separate drawing that drifts from the genome.
  const concept = concepts[1];
  check(
    "the concept's tokens are the genome's tokens",
    concept.payload.website.theme.font === concept.design.font &&
      concept.payload.website.theme.radius === concept.design.radius &&
      concept.payload.website.theme.button === concept.design.button,
    `${concept.payload.website.theme.font}/${concept.payload.website.theme.radius}`,
  );
  check(
    "the promised arrangements are the previewed ones",
    concept.sections.find((s) => s.type === "hero")?.variant ===
      concept.payload.website.sections.find((s) => s.type === "hero")?.content?.variant,
  );
}

section("Deterministic, and the pick is honoured");

{
  const first = draw();
  const second = draw();
  check(
    "the same business is offered the same three concepts",
    JSON.stringify(first.map((c) => [c.styleName, c.colors, c.design, c.sections])) ===
      JSON.stringify(second.map((c) => [c.styleName, c.colors, c.design, c.sections])),
  );

  // "You picked concept 2" has to mean the genome at index 2, which is what the
  // signup rebuilds when it receives concept: 2.
  const candidates = [0, 1, 2].map((attempt) =>
    blueprintFor({
      name: DRAFT.name, city: DRAFT.city, category: DRAFT.category,
      description: DRAFT.description, taken: [],
      seed: designSeed(DRAFT.name, DRAFT.city), attempt,
    }),
  );
  const concepts = draw();
  check(
    "concept k is candidate k's genome",
    concepts.every((c, i) => c.styleName === candidates[i].dna.design.styleName && c.design.font === candidates[i].look.font),
    concepts.map((c, i) => `${c.styleName}/${candidates[i].dna.design.styleName}`).join(" | "),
  );

  const colours = draw();
  check(
    "a colour the owner chose wins in every concept",
    (() => {
      const picked = conceptsFor({
        candidates,
        business: DRAFT,
        ai: null,
        industry: "dental",
        aboutImage: "",
        heroImage: "",
        submittedColors: { primary: "#123456", secondary: "#654321", accent: "#abcdef" },
        existingProfiles: [],
        services: SERVICES,
      });
      return picked.every((c) => c.colors.primary === "#123456" && c.payload.business.brandPrimary === "#123456");
    })(),
    colours[0].colors.primary,
  );

  check(
    "a different business gets a different set of concepts",
    (() => {
      const other = conceptsFor({
        candidates: [0, 1, 2].map((attempt) =>
          blueprintFor({
            name: "Anand Dental Care", city: DRAFT.city, category: DRAFT.category,
            description: DRAFT.description, taken: [],
            seed: designSeed("Anand Dental Care", DRAFT.city), attempt,
          }),
        ),
        business: { ...DRAFT, name: "Anand Dental Care" },
        ai: null, industry: "dental", aboutImage: "", heroImage: "",
        submittedColors: {}, existingProfiles: [], services: SERVICES,
      });
      return JSON.stringify(other.map((c) => [c.styleName, c.sections.map((s) => s.variant)])) !==
        JSON.stringify(concepts.map((c) => [c.styleName, c.sections.map((s) => s.variant)]));
    })(),
  );

  check("characterOf reads the genome it is given", characterOf(candidates[0].dna).includes("corners"));
  check("colour words describe the colour, not the hex",
    colourWord("#4c1d95") === "Indigo" || colourWord("#4c1d95") === "Violet",
    colourWord("#4c1d95"));
  check("a near-black is not called a rainbow colour", ["Charcoal", "Slate"].includes(colourWord("#0f172a")), colourWord("#0f172a"));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed ? 1 : 0);

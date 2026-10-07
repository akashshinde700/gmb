// WebSetu — regenerating one section.
//
// The whole site does not have to be rebuilt because one block is wrong. The
// genome is stored with the site, so a single section can be re-drawn (a
// different arrangement, from the same library the generator used) or
// re-written (the copy, from the same brief), and nothing else on the page
// moves. This is what the stored DNA was for.
//
// Two rules, both about trust:
//
//   - the layout re-roll is deterministic: the same section, asked twice, moves
//     forward through the arrangements rather than landing somewhere random, and
//     the previous state is already in the site's history.
//   - the copy pass never invents a fact. The model is given the business's own
//     details and told, explicitly, that anything it does not have must stay as
//     the owner wrote it.

import { SECTION_VARIANTS } from "@/lib/design-dna";
import type { SectionType, SiteSection } from "@/lib/types";

/**
 * The next arrangement for a section.
 *
 * `step` is how many times this section's layout has been re-drawn, so pressing
 * the button repeatedly walks through the library instead of alternating
 * between two options. Sections with a single arrangement (a payment QR, opening
 * hours) return null: there is nothing to re-draw, and pretending otherwise
 * would blank the section.
 */
export function nextVariant(type: SectionType, current: string | undefined, step: number): string | null {
  const options = SECTION_VARIANTS[type];
  if (!options || options.length <= 1) return null;
  const at = current ? options.indexOf(current) : -1;
  const base = at === -1 ? 0 : at;
  return options[(base + 1 + Math.abs(step)) % options.length] ?? null;
}

/** Which text fields of a section may be re-written by the copy pass. */
const CAMPOS: Partial<Record<SectionType, string[]>> = {
  hero: ["badge", "heading", "subheading"],
  about: ["title", "body"],
  services: ["title", "subtitle"],
  whyUs: ["title"],
  gallery: ["title", "subtitle"],
  testimonials: ["title", "subtitle"],
  faq: ["title"],
  cta: ["title", "subtitle"],
  blog: ["title", "subtitle"],
  contact: ["title", "subtitle"],
  products: ["title", "subtitle"],
  hours: ["title"],
  payment: ["title", "subtitle", "note"],
};

export function writableFields(type: SectionType): string[] {
  return CAMPOS[type] ?? ["title"];
}

export interface CopyRequest {
  section: SiteSection;
  business: {
    name: string;
    category?: string | null;
    city?: string | null;
    phone?: string | null;
    description?: string | null;
    services: string[];
  };
  /** The director's brief: what the site is for and who it speaks to. */
  brief?: { audience?: string; positioning?: string; goal?: string; tone?: string; content?: string } | null;
  /** The owner's own instruction: "shorter", "warmer", "more premium". */
  instruction?: string;
}

/** The prompt, kept in one place so the contract and the tests cannot drift. */
export function copyPrompt(req: CopyRequest): { system: string; prompt: string } {
  const fields = writableFields(req.section.type);
  const current: Record<string, string> = {};
  for (const key of fields) {
    const value = req.section.content?.[key];
    if (typeof value === "string" && value.trim()) current[key] = value;
  }
  const { business, brief } = req;
  return {
    system:
      "You are a senior conversion copywriter for Indian local businesses. You rewrite one section of an existing website. " +
      "You return JSON only, with exactly the keys you were given. " +
      "Absolute rule: never invent facts. No years in business, no number of customers, no awards, no prices, no certifications, no brand names, no guarantees that were not given to you. " +
      "If a line needs a fact you were not given, write the line without it. Keep it specific to this trade and this city, not generic filler. " +
      "Indian English, no exclamation marks, no emoji.",
    prompt: [
      `Business: ${business.name}${business.city ? `, ${business.city}` : ""}`,
      `Trade: ${business.category || "local business"}`,
      business.description ? `Owner's description: ${business.description}` : "",
      business.services.length ? `Services: ${business.services.join(", ")}` : "",
      brief?.audience ? `Audience: ${brief.audience}` : "",
      brief?.positioning ? `Positioning: ${brief.positioning}` : "",
      brief?.goal ? `The site's goal: ${brief.goal}` : "",
      brief?.tone ? `Tone: ${brief.tone}` : "",
      `Section: ${req.section.type}`,
      `Current text (JSON): ${JSON.stringify(current)}`,
      req.instruction ? `The owner asks: ${req.instruction}` : "Rewrite it better than it is now.",
      `Reply with JSON using exactly these keys: ${fields.join(", ")}.`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

/**
 * Keep only what the model may change, and only where it answered.
 *
 * A model that returns an extra key, or a key whose value is not a short string,
 * must not be able to write arbitrary data into the page: the section's other
 * content (items, images, CTAs, the variant) is the generator's and stays.
 */
export function applyCopy(section: SiteSection, written: Record<string, unknown>): SiteSection {
  const allowed = writableFields(section.type);
  const content: Record<string, unknown> = { ...section.content };
  for (const key of allowed) {
    const value = written[key];
    if (typeof value === "string" && value.trim() && value.trim().length <= 400) {
      content[key] = value.trim();
    }
  }
  return { ...section, content };
}

/**
 * Did the pass actually change the words?
 *
 * The provider chain happily returns the input unchanged when it has nothing to
 * add, and reporting "rewritten" for an identical section would be a lie.
 */
export function copyChanged(before: SiteSection, after: SiteSection): boolean {
  return writableFields(before.type).some((key) => before.content?.[key] !== after.content?.[key]);
}

/** What the owner sees when a section's copy could not be written. */
export const COPY_UNAVAILABLE =
  "No AI provider answered just now, so the wording is unchanged — try again in a few minutes, or edit it by hand.";

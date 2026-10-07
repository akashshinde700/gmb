// WebSetu — testing two versions of a page against each other.
//
// The product already writes a headline; the owner should be able to find out
// which of two headlines works, rather than being told one is better. What this
// deliberately is not: a general-purpose experimentation platform. One test at a
// time, on one section, with two variants, and a result measured in the same
// numbers the rest of the product already reports (visitors, calls, WhatsApp
// taps, enquiries).
//
// Assignments are stable per visitor and made by hash, not by a coin toss at
// request time: a visitor who saw headline B keeps seeing headline B on their
// next page view, which is what makes the comparison mean anything.

import { rng, seedFrom } from "@/lib/variants";
import type { SectionType, SiteSection } from "@/lib/types";

export type VariantId = "a" | "b";

export interface ExperimentVariant {
  id: VariantId;
  /** Only the text this variant changes; everything else comes from the section. */
  content: Record<string, string>;
  /** Who wrote it — shown beside the variant so the owner knows what they are comparing. */
  source: "site" | "owner" | "ai";
}

export interface Experiment {
  /** The section type under test: "hero" or "cta". */
  key: SectionType;
  status: "running" | "stopped";
  /** What the owner is trying to move. */
  metric: "enquiries";
  variants: ExperimentVariant[];
  startedAt: string;
  stoppedAt?: string;
}

/** Which text fields a section's experiment may change. */
export const EXPERIMENT_FIELDS: Partial<Record<SectionType, string[]>> = {
  hero: ["badge", "heading", "subheading"],
  cta: ["title", "subtitle"],
  about: ["title", "body"],
};

/** Sections that can be tested — the ones where a different sentence matters. */
export function testableFields(sectionType: SectionType): string[] {
  return EXPERIMENT_FIELDS[sectionType] ?? [];
}

/**
 * The variant a visitor sees.
 *
 * FNV-seeded from `experiment:visitor`, so it is uniform across visitors (a hash
 * of a random id), stable for one visitor, and identical on the server and the
 * client if both ever needed to know. Changing the experiment's start time
 * re-randomises the split, which is the honest behaviour: a new test is a new
 * test.
 */
export function variantFor(experiment: Pick<Experiment, "key" | "startedAt">, visitorId: string): VariantId {
  if (!visitorId) return "a";
  const draw = rng(seedFrom(`${experiment.key}:${experiment.startedAt}:${visitorId}`))();
  return draw < 0.5 ? "a" : "b";
}

/**
 * Apply the visitor's variant to the page.
 *
 * Returns the sections untouched when no experiment is running, so a site
 * without one behaves exactly as before — and the "a" variant is the section's
 * own content, which means the control is always the page the owner already
 * approved rather than a copy of it that could drift.
 */
export function applyVariant(
  sections: SiteSection[],
  experiment: Experiment | null | undefined,
  visitorId: string,
): { sections: SiteSection[]; applied: { key: SectionType; variant: VariantId } | null } {
  if (!experiment || experiment.status !== "running" || experiment.variants.length < 2) {
    return { sections, applied: null };
  }
  const variant = variantFor(experiment, visitorId);
  const chosen = experiment.variants.find((v) => v.id === variant) ?? experiment.variants[0];
  if (variant === "a" && chosen.source === "site") return { sections, applied: { key: experiment.key, variant: "a" } };

  return {
    sections: sections.map((section) =>
      section.type === experiment.key
        ? { ...section, content: { ...section.content, ...chosen.content } }
        : section,
    ),
    applied: { key: experiment.key, variant },
  };
}

/** Per-variant tallies, from the recorded events. */
export interface VariantTally {
  id: VariantId;
  visits: number;
  /** Calls, WhatsApp taps and enquiries — everything that is a step towards work. */
  actions: number;
  calls: number;
  whatsapp: number;
  enquiries: number;
}

export interface ExperimentResult {
  key: string;
  status: "running" | "stopped";
  variants: VariantTally[];
  /** The variant with the better action rate, when there is enough data to say. */
  leading: VariantId | null;
  /** True when the leader's rate is more than 30% better than the other's. */
  decided: boolean;
  /** What the owner should read: a sentence, not a p-value. */
  verdict: string;
}

const isAction = (type: string) => ["CTA_CALL", "CTA_WHATSAPP", "CTA_EMAIL", "CTA_DIRECTIONS", "FORM_SUBMIT"].includes(type);

/**
 * Turn the raw event stream into a result.
 *
 * Rates rather than counts: the two variants do not get the same number of
 * visitors, and comparing 20 actions out of 300 with 8 out of 90 is the mistake
 * this function exists to avoid.
 */
export function tallyExperiment(
  experiment: Experiment,
  events: { type: string; variant?: string; experiment?: string }[],
): ExperimentResult {
  const tallies: VariantTally[] = experiment.variants.map((v) => ({
    id: v.id, visits: 0, actions: 0, calls: 0, whatsapp: 0, enquiries: 0,
  }));
  const of = (id: string) => tallies.find((t) => t.id === id);

  for (const event of events) {
    if (event.experiment !== experiment.key) continue;
    const variant = event.variant === "b" ? "b" : event.variant === "a" ? "a" : null;
    if (!variant) continue;
    const tally = of(variant);
    if (!tally) continue;
    if (event.type === "VISIT") tally.visits++;
    else if (isAction(event.type)) {
      tally.actions++;
      if (event.type === "CTA_CALL") tally.calls++;
      else if (event.type === "CTA_WHATSAPP") tally.whatsapp++;
      else if (event.type === "FORM_SUBMIT") tally.enquiries++;
    }
  }

  const rate = (t: VariantTally) => (t.visits ? t.actions / t.visits : 0);
  const [a, b] = tallies;
  const enough = Boolean(a && b && a.visits >= 30 && b.visits >= 30 && a.actions + b.actions >= 3);
  const lead = a && b && rate(b) > rate(a) ? "b" : "a";
  const other = lead === "a" ? "b" : "a";
  const scores = tallies.map(rate);
  const decided = Boolean(enough && Math.max(...scores) > Math.min(...scores) * 1.3);

  const pct = (t: VariantTally | undefined) => (t && t.visits ? `${Math.round(rate(t) * 1000) / 10}%` : "—");
  let verdict: string;
  if (!a || !b || a.visits + b.visits === 0) {
    verdict = "Nobody has seen the test yet. The result appears as visitors arrive.";
  } else if (!enough) {
    verdict = `Too early to call: ${a.visits + b.visits} visitor(s), ${a.actions + b.actions} enquiries. Give it a few more days.`;
  } else if (decided) {
    verdict = `“${experiment.variants.find((v) => v.id === lead)?.content.heading ?? experiment.variants.find((v) => v.id === lead)?.content.title ?? lead}” is winning — ${pct(tallies.find((t) => t.id === lead))} enquire against ${pct(tallies.find((t) => t.id === other))}. Make it the only version.`;
  } else {
    verdict = `Running neck and neck (${pct(a)} against ${pct(b)}). Either one is fine — pick the one you prefer and stop the test.`;
  }

  return { key: experiment.key, status: experiment.status, variants: tallies, leading: enough ? lead : null, decided, verdict };
}

/**
 * The prompt for a second headline.
 *
 * An alternative that tests *angle* rather than wording: a different promise to
 * the same person, because "we rewrote your headline in synonyms" measures
 * nothing.
 */
export function alternativePrompt(input: {
  sectionType: SectionType;
  current: Record<string, string>;
  business: { name: string; category?: string | null; city?: string | null; description?: string | null };
  goal?: string | null;
}): { system: string; prompt: string } {
  const fields = Object.keys(input.current).filter((f) => input.current[f]);
  return {
    system:
      "You write two competing headlines for the same Indian local business, so the owner can test which one brings more enquiries. " +
      "Return JSON only, with exactly the keys you are given. " +
      "The second version must take a DIFFERENT ANGLE from the first — a different promise or a different reason to act — not the same sentence with synonyms. " +
      "Never invent facts: no years in business, no customer numbers, no awards, no prices, no guarantees that were not given. " +
      "Indian English, no exclamation marks, no emoji. Keep the same rough length so neither is helped by being longer.",
    prompt: [
      `Business: ${input.business.name}${input.business.city ? `, ${input.business.city}` : ""}`,
      `Trade: ${input.business.category || "local business"}`,
      input.business.description ? `Owner's description: ${input.business.description}` : "",
      input.goal ? `What the site is trying to get: ${input.goal}` : "",
      `Section: ${input.sectionType}`,
      `Version 1 (the one live now): ${JSON.stringify(input.current)}`,
      `Write version 2, a genuinely different angle. Reply with JSON using exactly these keys: ${fields.join(", ")}.`,
    ].filter(Boolean).join("\n"),
  };
}

/** Keep only the text fields an experiment may set, from whatever came back. */
export function cleanVariantContent(sectionType: SectionType, raw: Record<string, unknown>): Record<string, string> {
  const allowed = testableFields(sectionType);
  const out: Record<string, string> = {};
  for (const key of allowed) {
    const value = raw[key];
    if (typeof value === "string" && value.trim() && value.trim().length <= 200) out[key] = value.trim();
  }
  return out;
}

/** Two variants that say the same thing are not a test. */
export function variantsDiffer(a: Record<string, string>, b: Record<string, string>): boolean {
  return Object.keys({ ...a, ...b }).some((key) => (a[key] ?? "") !== (b[key] ?? ""));
}

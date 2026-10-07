import { db } from "@/lib/db";
import { parseJson } from "@/lib/sections";
import { serializeWebsite } from "@/lib/serialize";
import { generateJson } from "@/lib/llm";
import { recordVersion } from "@/lib/site-history";
import {
  alternativePrompt, cleanVariantContent, tallyExperiment, testableFields, variantsDiffer,
  type Experiment,
} from "@/lib/experiments";
import type { SectionType, SiteSection, SiteTheme } from "@/lib/types";
import { HttpError, ok, readJson, requireBusiness, requireUser, route, str } from "@/lib/api";

/** How far back an experiment's numbers are read. */
const WINDOW_DAYS = 30;

function currentExperiment(theme: Partial<SiteTheme>): Experiment | null {
  const raw = theme.experiments;
  if (!raw || !Array.isArray(raw.variants) || raw.variants.length < 2) return null;
  return raw as Experiment;
}

/**
 * GET /api/website/experiment — the test on this site and how it is doing.
 *
 * The numbers come from the same events the analytics tab reports: visitors,
 * calls, WhatsApp taps and enquiries, split by the headline they saw. No
 * separate measurement, so the two screens cannot disagree.
 */
export const GET = route(async (req: Request) => {
  const session = await requireUser(req);
  const business = await requireBusiness(session);
  const website = business.website;
  if (!website) throw new HttpError("Website not found", 404);
  const theme = parseJson<Partial<SiteTheme>>(website.themeJson, {});
  const experiment = currentExperiment(theme);

  if (!experiment) return ok({ experiment: null, result: null });

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const events = await db.analyticsEvent.findMany({
    where: { businessId: business.id, createdAt: { gte: since } },
    select: { type: true, meta: true },
    take: 20_000,
  });
  const parsed = events.map((e) => {
    const meta = parseJson<{ experiment?: string; variant?: string }>(e.meta, {});
    return { type: e.type, experiment: meta.experiment, variant: meta.variant };
  });

  return ok({ experiment, result: tallyExperiment(experiment, parsed), canTest: testableFields("hero") });
});

/**
 * POST /api/website/experiment — start the test, stop it, or keep the winner.
 *
 * One test at a time, and every state change records a version first: the losing
 * headline is one press away from coming back.
 */
export const POST = route(async (req: Request) => {
  const session = await requireUser(req);
  const business = await requireBusiness(session);
  const website = business.website;
  if (!website) throw new HttpError("Website not found", 404);

  const body = await readJson<Record<string, unknown>>(req);
  const action = str(body.action, 20);
  const theme = parseJson<Partial<SiteTheme>>(website.themeJson, {});
  const sections = parseJson<SiteSection[]>(website.sectionsJson, []);
  const existing = currentExperiment(theme);

  const save = async (experiments: Experiment | undefined, label: string, nextSections?: SiteSection[]) => {
    const updated = await db.website.update({
      where: { id: website.id },
      data: {
        themeJson: JSON.stringify({ ...theme, experiments }),
        ...(nextSections ? { sectionsJson: JSON.stringify(nextSections) } : {}),
        version: { increment: 1 },
      },
    });
    await recordVersion({ website: updated, label, actor: business.ownerName || "Owner" });
    return updated;
  };

  /* ---------------------------------------------------------- stop ------- */
  if (action === "stop") {
    if (!existing) throw new HttpError("No test is running", 422);
    const stopped: Experiment = { ...existing, status: "stopped", stoppedAt: new Date().toISOString() };
    const updated = await save(stopped, "Stopped the headline test");
    return ok({ experiment: stopped, website: serializeWebsite(updated) });
  }

  /* --------------------------------------------------------- start ------- */
  if (action === "start") {
    if (existing?.status === "running") {
      throw new HttpError("A test is already running — stop it, or keep one of its headlines", 409);
    }
    const sectionType = (str(body.sectionId, 40) || "hero") as SectionType;
    const fields = testableFields(sectionType);
    if (!fields.length) throw new HttpError("Only the headline, the call-to-action and the intro can be tested", 422);

    const section = sections.find((s) => s.type === sectionType);
    if (!section) throw new HttpError("That section is not on this page", 404);

    const variantA: Record<string, string> = {};
    for (const field of fields) {
      const value = section.content?.[field];
      if (typeof value === "string" && value.trim()) variantA[field] = value.trim();
    }
    if (!Object.keys(variantA).length) throw new HttpError("This section has no words to test yet", 422);

    // Variant B: whatever the owner typed, or one the model writes when asked.
    let variantB = cleanVariantContent(sectionType, (body.variantB ?? {}) as Record<string, unknown>);
    let source: Experiment["variants"][number]["source"] = "owner";
    if (!Object.keys(variantB).length) {
      const goal = theme.dna?.goal?.label ?? null;
      const written = await generateJson<Record<string, unknown>>({
        ...alternativePrompt({
          sectionType,
          current: variantA,
          business: {
            name: business.name, category: business.category, city: business.city,
            description: business.description,
          },
          goal,
        }),
        task: "copy",
        businessId: business.id,
      });
      if (!written) {
        throw new HttpError(
          "No AI provider answered, so we could not write a second version. Type one yourself — a different angle works better than different words.",
          503,
        );
      }
      variantB = cleanVariantContent(sectionType, written.content ?? {});
      source = "ai";
    }
    if (!Object.keys(variantB).length) throw new HttpError("That second version was empty", 422);
    if (!variantsDiffer(variantA, variantB)) {
      throw new HttpError("Both versions say the same thing — change the angle, not just the wording", 422);
    }

    const experiment: Experiment = {
      key: sectionType,
      status: "running",
      metric: "enquiries",
      variants: [
        { id: "a", content: variantA, source: "site" },
        { id: "b", content: variantB, source },
      ],
      startedAt: new Date().toISOString(),
    };
    const updated = await save(experiment, `Started a test of two ${sectionType === "hero" ? "headlines" : "versions"}`);
    return ok({ experiment, website: serializeWebsite(updated) });
  }

  /* -------------------------------------------------- keep the winner ---- */
  if (action === "keep") {
    if (!existing) throw new HttpError("No test to keep", 422);
    const winner = str(body.variant, 2) === "b" ? "b" : "a";
    const chosen = existing.variants.find((v) => v.id === winner);
    if (!chosen) throw new HttpError("That version is not part of the test", 404);

    const nextSections = sections.map((s) =>
      s.type === existing.key ? { ...s, content: { ...s.content, ...chosen.content } } : s,
    );
    const updated = await save(
      undefined,
      winner === "a" ? "Kept the current version" : "Kept the new version",
      nextSections,
    );
    return ok({ kept: winner, website: serializeWebsite(updated) });
  }

  throw new HttpError("Unknown action");
});

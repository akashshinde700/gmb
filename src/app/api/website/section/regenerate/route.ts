import { db } from "@/lib/db";
import { parseJson } from "@/lib/sections";
import { serializeWebsite } from "@/lib/serialize";
import { generateJson } from "@/lib/llm";
import { recordVersion } from "@/lib/site-history";
import { COPY_UNAVAILABLE, applyCopy, copyChanged, copyPrompt, nextVariant } from "@/lib/section-regen";
import type { SiteSection, SiteTheme } from "@/lib/types";
import { HttpError, ok, readJson, requireBusiness, requireUser, route, str } from "@/lib/api";

/**
 * POST /api/website/section/regenerate — re-draw or re-write one section.
 *
 * The whole site does not have to be rebuilt because one block is wrong. Two
 * modes, and both leave the rest of the page untouched:
 *
 *   layout — move to the next arrangement in the library (a wall of reviews
 *            becomes a spotlight, a process list becomes cards). Deterministic:
 *            asking again moves forward rather than landing at random.
 *   copy   — rewrite this section's text from the stored brief, with the model
 *            told explicitly never to invent a fact about the business.
 *
 * A version is recorded first, so either one can be undone from the history.
 */
export const POST = route(async (req: Request) => {
  const session = await requireUser(req);
  const business = await requireBusiness(session);
  const website = business.website;
  if (!website) throw new HttpError("Website not found", 404);

  const body = await readJson<{ sectionId?: string; mode?: string; instruction?: string }>(req);
  const sectionId = str(body.sectionId, 60);
  const mode = str(body.mode, 20) === "copy" ? "copy" : str(body.mode, 20) === "both" ? "both" : "layout";
  const instruction = str(body.instruction, 160).trim();
  if (!sectionId) throw new HttpError("Which section should we regenerate?");

  const theme = parseJson<Partial<SiteTheme>>(website.themeJson, {});
  const sections = parseJson<SiteSection[]>(website.sectionsJson, []);
  const at = sections.findIndex((s) => s.id === sectionId);
  if (at === -1) throw new HttpError("That section is not on this site", 404);

  const section = sections[at];
  const dna = theme.dna;
  const plan = dna?.sectionPlan ?? [];
  let next = section;
  const changed: string[] = [];

  /* --- layout ------------------------------------------------------------ */
  if (mode !== "copy") {
    // How many times this section's arrangement has already moved: the history
    // is the counter, so a later request continues from where the last one left
    // off rather than toggling between two options.
    const step = await db.auditLog.count({
      where: { entity: "Website", entityId: website.id, action: "SITE_VERSION" },
    });
    const variant = nextVariant(section.type, String(section.content?.variant ?? ""), step);
    if (!variant) throw new HttpError("There is only one way to draw this section.", 409);
    next = { ...next, content: { ...next.content, variant } };
    changed.push(`laid the ${section.type} section out as “${variant}”`);
  }

  /* --- copy -------------------------------------------------------------- */
  if (mode !== "layout") {
    const written = await generateJson<Record<string, unknown>>({
      ...copyPrompt({
        section: next,
        business: {
          name: business.name, category: business.category, city: business.city,
          phone: business.phone, description: business.description,
          services: (await db.service.findMany({ where: { businessId: business.id }, select: { name: true } })).map((s) => s.name),
        },
        brief: dna?.stages?.length
          ? { audience: dna.business?.audience, positioning: dna.business?.positioning, tone: dna.business?.tone, goal: dna.goal?.label, content: dna.stages.find((s) => s.name === "Content")?.detail }
          : null,
        instruction,
      }),
      maxTokens: 700,
    });
    if (!written) throw new HttpError(COPY_UNAVAILABLE, 503);
    const withCopy = applyCopy(next, written.content ?? {});
    if (!copyChanged(next, withCopy)) {
      // The model answered, but with the same words: say so rather than
      // reporting a change that did not happen.
      throw new HttpError("The wording came back unchanged — try a shorter instruction, or edit it by hand.", 422);
    }
    next = withCopy;
    changed.push(`rewrote the ${section.type} section's words`);
  }

  const nextSections = sections.map((s, i) => (i === at ? next : s));
  const variant = String(next.content?.variant ?? "");
  const nextPlan = plan.length
    ? plan.map((c) => (c.type === section.type ? { ...c, variant } : c))
    : plan;

  const updated = await db.website.update({
    where: { id: website.id },
    data: {
      sectionsJson: JSON.stringify(nextSections),
      themeJson: JSON.stringify({ ...theme, dna: dna ? { ...dna, sectionPlan: nextPlan } : dna }),
      version: { increment: 1 },
    },
  });

  await recordVersion({
    website: updated,
    label: `Regenerated the ${section.type} section`,
    actor: business.ownerName || "Owner",
  });

  return ok({ changed, sectionId, mode, website: serializeWebsite(updated) });
});

import { db } from "@/lib/db";
import { candidateBlueprints, designSeed } from "@/lib/blueprint";
import { conceptsFor, type ConceptBusiness } from "@/lib/concepts";
import { profileFromSite, type SiteProfile } from "@/lib/uniqueness";
import { resolveIndustry } from "@/lib/industries";
import { starterFaqs } from "@/lib/starter-content";
import { HttpError, ok, readJson, requireUser, route, str } from "@/lib/api";
import type { AiSiteContent } from "@/lib/sections";

/**
 * POST /api/onboarding/concepts — three websites, before there is an account.
 *
 * The wizard sends the details the owner has just typed; this builds the same
 * three genomes the generator would build, and returns each one with its own
 * colours, type, section plan and a trimmed payload the client renders with the
 * real site renderer. Nothing is written: choosing is what creates the site.
 */
export const POST = route(async (req: Request) => {
  const session = await requireUser(req);
  const body = await readJson<Record<string, unknown>>(req);

  const name = str(body.name, 150).trim();
  const category = str(body.category, 100).trim();
  if (!name || !category) throw new HttpError("Add your business name and type first");
  const city = str(body.city, 100).trim();
  const phone = str(body.phone, 20).trim();
  const whatsapp = str(body.whatsapp, 20).trim() || phone;

  const ai = (body.ai && typeof body.ai === "object" ? body.ai : null) as AiSiteContent | null;
  const industryKey = typeof ai?.industry === "string" ? ai.industry : undefined;

  // The same trade-avoidance the real signup uses, so a concept is judged
  // against what is actually live rather than against an empty list.
  const tradeMates = await db.business.findMany({
    where: { category },
    select: {
      brandPrimary: true, brandSecondary: true, brandAccent: true,
      website: { select: { themeJson: true, sectionsJson: true } },
    },
    take: 500,
  });
  const taken = tradeMates.map((b) => `${b.brandPrimary},${b.brandSecondary},${b.brandAccent}`);

  // The same call the signup makes, so the genome behind a concept is the
  // genome that gets built when it is picked.
  const candidates = candidateBlueprints({
    name, city, category, industryKey,
    description: str(body.description, 4000),
    taken,
    seed: designSeed(name, city),
  });

  // The same icons the signup would file: matched by name against the trade's
  // own list, so a preview's cards carry the artwork the real site will use.
  const submitted = (Array.isArray(body.services) ? body.services : [])
    .map((raw) => (raw || {}) as Record<string, unknown>)
    .map((row) => ({ name: str(row.name, 120).trim(), description: str(row.description, 300).trim() }))
    .filter((row) => row.name)
    .slice(0, 12);
  const withIcons = submitted.map((row) => ({
    ...row,
    icon:
      candidates[0].services.find((p) => p.name.toLowerCase() === row.name.toLowerCase())?.icon ??
      candidates[0].preset.motif.icons[0] ??
      "sparkles",
  }));
  const services = withIcons.length
    ? withIcons
    : candidates[0].services.slice(0, 6).map((s) => ({ ...s, icon: "sparkles" }));

  const existingProfiles: SiteProfile[] = tradeMates
    .map((b) => {
      try {
        const theme = b.website ? (JSON.parse(b.website.themeJson || "{}") as Record<string, never>) : {};
        const sections = b.website
          ? (JSON.parse(b.website.sectionsJson || "[]") as { type: string }[])
          : [];
        return profileFromSite({
          brandPrimary: b.brandPrimary, brandSecondary: b.brandSecondary, brandAccent: b.brandAccent,
          theme, sections,
        });
      } catch {
        return null;
      }
    })
    .filter((x): x is SiteProfile => x !== null);

  const business: ConceptBusiness = {
    name, category,
    tagline: str(body.tagline, 200).trim(),
    description: str(body.description, 4000).trim(),
    city, phone, whatsapp,
    email: str(body.email, 200).trim(),
    address: str(body.address, 300).trim(),
    establishedYear: str(body.establishedYear, 4).trim(),
    coverUrl: "",
    mapsUrl: str(body.mapsUrl, 1000).trim(),
    state: str(body.state, 100).trim(),
    pincode: str(body.pincode, 10).trim(),
  };

  const preset = resolveIndustry(category, industryKey);
  // Scored with the same starter content the signup adds a moment later — the
  // platform's own FAQs and the generated gallery — so the number beside a
  // concept is comparable with the score the finished site will show, rather
  // than being three points lower for reasons the owner cannot see.
  const starterFaqCount = starterFaqs({
    name, category, city, phone, services: services.map((s) => s.name), ai,
    industryFaqs: preset.faqs.map((f) => ({
      question: f.question.replace(/\{\{name\}\}/g, name).replace(/\{\{city\}\}/g, city),
      answer: f.answer.replace(/\{\{name\}\}/g, name).replace(/\{\{city\}\}/g, city),
    })),
  }).length;

  const concepts = conceptsFor({
    candidates,
    business,
    ai,
    industry: preset.key,
    aboutImage: "",
    heroImage: "",
    submittedColors: { primary: body.brandPrimary, secondary: body.brandSecondary, accent: body.brandAccent },
    existingProfiles,
    services,
    starterFaqCount,
    starterGalleryCount: 3,
  });

  return ok({
    conceptFor: session.id,
    drawnFor: `${name}${city ? `, ${city}` : ""}`,
    concepts,
  });
});

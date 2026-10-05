import { db } from "@/lib/db";
import type { AiSiteContent } from "@/lib/sections";
import { HttpError, limitSubjectOrThrow, ok, readJson, requireUser, route, str } from "@/lib/api";
import { activeProvider, generateJson } from "@/lib/llm";
import { fallbackServices, fillCopy, industryFor, INDUSTRY_KEYS } from "@/lib/industries";
import { pick, rng, seedFrom, variantsFor } from "@/lib/variants";
import { SITE_ICON_KEYS } from "@/lib/site-icon-keys";

const ICON_CHOICES = SITE_ICON_KEYS.join(", ");

/** Model output is untrusted: keep only well-formed, bounded fields. */
function cleanAi(raw: AiSiteContent): AiSiteContent {
  const out: AiSiteContent = { ...raw };
  out.services = (Array.isArray(raw.services) ? raw.services : [])
    .filter((x) => x && typeof x.name === "string" && x.name.trim())
    .slice(0, 8)
    .map((x) => ({
      name: String(x.name).trim().slice(0, 80),
      description: String(x.description ?? "").trim().slice(0, 300),
      icon: SITE_ICON_KEYS.includes(String(x.icon)) ? String(x.icon) : "sparkles",
    }));
  out.industry = INDUSTRY_KEYS.includes(String(raw.industry)) ? String(raw.industry) : undefined;
  out.imageQuery = typeof raw.imageQuery === "string" ? raw.imageQuery.replace(/[^\w\s-]/g, "").trim().slice(0, 60) : undefined;
  return out;
}

/** AI generations allowed per 30-day period when the tenant has no plan yet. */
const FREE_AI_CREDITS = 5;
const AI_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * POST /api/ai/generate — AI website content generator (USP feature).
 * Generates hero, about, stats, why-us, FAQs and SEO meta from minimal business info.
 * Falls back to smart template content if the AI service is unavailable.
 */
export const POST = route(async (req: Request) => {
  const session = await requireUser(req);
  // Each call costs money upstream, so it is throttled even before credits.
  limitSubjectOrThrow(`ai:${session.id}`, 10, 10 * 60 * 1000);

  const body = await readJson<{
    name?: string; category?: string; city?: string; services?: string[];
    description?: string; tone?: string;
  }>(req);

  const name = str(body.name, 150);
  const category = str(body.category, 100);
  const city = str(body.city, 100);
  const services = (Array.isArray(body.services) ? body.services : [])
    .filter(Boolean)
    .slice(0, 10)
    .map((s) => str(s, 100));
  if (!name || !category) throw new HttpError("Business name and category are required");

  // plan.aiCredits was read but never enforced, so generations were unlimited.
  // Onboarding runs before a business exists, hence the free allowance.
  const business = await db.business.findUnique({
    where: { userId: session.id },
    include: { subscription: { include: { plan: true } } },
  });
  // With no provider configured every request returns the deterministic
  // template, so charging a credit for it would bill the customer for nothing.
  const providerReady = activeProvider() !== "none";

  if (business && providerReady) {
    const allowance = business.subscription?.plan?.aiCredits ?? FREE_AI_CREDITS;
    const periodExpired = Date.now() - business.aiPeriodStart.getTime() >= AI_PERIOD_MS;
    const used = periodExpired ? 0 : business.aiUsedCount;

    // -1 (or any negative allowance) means unlimited on that plan.
    if (allowance >= 0 && used >= allowance) {
      throw new HttpError(
        `You have used all ${allowance} AI generations included in your plan this month. Upgrade for more.`,
        402,
      );
    }

    await db.business.update({
      where: { id: business.id },
      data: periodExpired
        ? { aiUsedCount: 1, aiPeriodStart: new Date() }
        : { aiUsedCount: { increment: 1 } },
    });
  }

  const tone = str(body.tone, 40) || "professional";
  const preset = industryFor(category);
  // Two businesses in one trade must not get the same copy, so the model is
  // pushed down a different angle for each — stable per business name+city.
  const r = rng(seedFrom(`${name}|${city}|${category}`));
  const angle = pick(r, variantsFor(preset.key).promises);
  const vars = { name, city, category };
  const fill = (t: string) => fillCopy(t, vars);
  const systemPrompt =
    "You are a senior conversion copywriter for Indian local businesses, expert in SEO and AEO (Answer Engine Optimization). " +
    "You know how the best-performing websites in each trade position themselves and you write to that standard. " +
    "Write clear, specific, trustworthy copy in the language of that trade — not generic filler that could fit any business. " +
    "Never invent awards, certifications, licences, client names, review counts, ratings, years in business or numeric claims the owner did not give. " +
    "Respond with valid JSON only — no markdown fences, no commentary.";

  const userPrompt = `Write website content for this business:
- Business name: ${name}
- Business type: ${category} (industry: ${preset.label})
- Location: ${city || "India"}
- Services/offerings: ${services.join(", ") || preset.services.map((s) => s.name).join(", ")}
- Owner's description: ${body.description || "none"}
- Tone: ${tone}
- Angle to lead with (use it, do not quote it verbatim): ${angle}

Industry brief — what buyers in this trade care about and what the top competitors' websites in ${city || "India"} emphasise:
${preset.aiBrief}

Before writing, think about how the 3-5 strongest ${category.toLowerCase()} businesses in ${city || "this market"} present themselves online: their headline promise, trust signals, the objections their customers raise and how they answer them. Then write copy that meets that standard AND gives ${name} a clear reason to be chosen over them — using only facts above, phrased as commitments ("we confirm a pickup slot") rather than invented statistics.

Return this exact JSON structure:
{
  "heroBadge": "short trust badge with an emoji, e.g. ${fill(preset.hero.badge)}",
  "heroHeading": "6-10 word headline with the business name and the main customer promise of this trade",
  "heroSubheading": "1-2 sentences (max 30 words) naming the key services and location",
  "ctaPrimary": "3-4 word action that fits this trade (e.g. '${preset.hero.ctaPrimary}')",
  "ctaSecondary": "2-3 word secondary action",
  "about": "2-3 paragraphs (120-180 words), specific to this trade, natural and human",
  "stats": [{"value": "short non-numeric or owner-given value e.g. '24/7'", "label": "2-3 words"}, ... 4 items],
  "whyUs": [{"title": "short differentiator", "description": "1 sentence"}, ... 4 items that answer this trade's top buyer concerns],
  "faqs": [{"question": "a real question buyers of this trade ask", "answer": "2-3 sentence factual answer"}, ... 6 items covering services, pricing, process, area served, timing and contact],
  "seoTitle": "max 60 chars: business name + main service + city",
  "seoDescription": "150-160 chars with service keywords, city and a call to action",
  "services": [{"name": "2-5 word service or product line this business really offers", "description": "1 sentence benefit", "icon": "one of: ${ICON_CHOICES}"}, ... 6 items],
  "industry": "the closest match for visual style, one of: ${INDUSTRY_KEYS.join(", ")}",
  "imageQuery": "3-5 word English stock-photo search that shows this trade (e.g. 'truck logistics highway')"
}`;

  // Whichever provider has a key configured (Gemini / Groq / Claude / Ollama).
  // With none configured this returns null and the industry preset copy below is
  // used — the wizard never blocks on the model being reachable.
  const generated = providerReady
    ? await generateJson<AiSiteContent>({ system: systemPrompt, prompt: userPrompt, maxTokens: 2400 })
    : null;
  const content: AiSiteContent | null = generated?.content ? cleanAi(generated.content) : null;

  // Deterministic fallback — trade-specific copy from the industry preset.
  const serviceList = services.length ? services : preset.services.map((s) => s.name);
  const fallback: AiSiteContent = {
    heroBadge: fill(preset.hero.badge),
    heroHeading: fill(preset.hero.heading),
    heroSubheading: fill(preset.hero.subheading),
    ctaPrimary: preset.hero.ctaPrimary,
    ctaSecondary: preset.hero.ctaSecondary,
    about: body.description ? `${body.description} ${fill(preset.about)}` : fill(preset.about),
    stats: preset.stats.map((x) => ({ value: fill(x.value), label: fill(x.label) })),
    whyUs: preset.whyUs.map((w) => ({ title: fill(w.title), description: fill(w.description) })),
    faqs: preset.faqs.map((f) => ({ question: fill(f.question), answer: fill(f.answer) })),
    seoTitle: `${name} | ${serviceList[0] || category} in ${city || "India"}`.slice(0, 60),
    seoDescription: `${name} — ${category.toLowerCase()}${city ? ` in ${city}` : ""}. ${serviceList.slice(0, 3).join(", ")}. Call now for a free quote.`.slice(0, 160),
    services: fallbackServices(category, vars),
    industry: preset.key,
    imageQuery: preset.key === "general" ? `${category} business` : pick(r, variantsFor(preset.key).imageQueries),
  };

  return ok({
    content: content ?? fallback,
    // The wizard shows a quieter label when this is a template rather than a
    // model result, so the product never claims AI wrote something it did not.
    generated: !!content,
  });
});

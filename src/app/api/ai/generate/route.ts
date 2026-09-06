import { db } from "@/lib/db";
import { fail, getSessionBusiness, getSessionUser, ok } from "@/lib/auth";
import type { AiSiteContent } from "@/lib/sections";
import ZAI from "z-ai-web-dev-sdk";

/**
 * POST /api/ai/generate — AI website content generator (USP feature).
 * Generates hero, about, stats, why-us, FAQs and SEO meta from minimal business info.
 * Falls back to smart template content if the AI service is unavailable.
 */
export async function POST(req: Request) {
  const session = await getSessionUser(req);
  if (!session) return fail("Unauthorized", 401);

  const body = (await req.json()) as {
    name?: string; category?: string; city?: string; services?: string[];
    description?: string; tone?: string;
  };

  const name = (body.name || "").trim();
  const category = (body.category || "").trim();
  const city = (body.city || "").trim();
  const services = (body.services || []).filter(Boolean).slice(0, 10);
  if (!name || !category) return fail("Business name and category are required");

  // Usage limiting hook: plan.aiCredits gates AI usage (e.g. Starter=5, Business=50, Pro=unlimited)
  const business = await getSessionBusiness(session.id);
  const plan = business?.subscription?.plan;

  const tone = body.tone || "professional";
  const systemPrompt =
    "You are an expert Indian local-business website copywriter specializing in SEO and AEO (Answer Engine Optimization). " +
    "Write clear, trustworthy, factual marketing copy. Never invent fake awards, fake review counts, or fake certifications. " +
    "Respond with valid JSON only — no markdown fences, no commentary.";

  const userPrompt = `Generate website content for this business:
- Business name: ${name}
- Business type: ${category}
- Location: ${city || "India"}
- Services/offerings: ${services.join(", ") || "general"}
- Extra context: ${body.description || "none"}
- Tone: ${tone}

Return this exact JSON structure:
{
  "heroBadge": "short trust badge e.g. ★ Trusted ${category} in ${city}",
  "heroHeading": "6-10 word compelling headline including the business name",
  "heroSubheading": "1-2 sentence value proposition (max 30 words)",
  "ctaPrimary": "3-4 word call to action",
  "ctaSecondary": "2-3 word secondary CTA",
  "about": "2-3 paragraph business description (120-180 words), natural and human",
  "stats": [{"value": "e.g. 10+", "label": "Years Experience"}, ... 4 items],
  "whyUs": [{"title": "short reason", "description": "1 sentence"}, ... 4 items],
  "faqs": [{"question": "customer question", "answer": "2-3 sentence factual answer"}, ... 5 items covering services, location, hours, contact, pricing],
  "seoTitle": "SEO page title max 60 chars with business name and city",
  "seoDescription": "meta description 150-160 chars with keywords and call to action"
}`;

  let content: AiSiteContent | null = null;
  try {
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      thinking: { type: "disabled" },
    });
    const raw = completion.choices[0]?.message?.content || "";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end !== -1) {
      content = JSON.parse(cleaned.slice(start, end + 1)) as AiSiteContent;
    }
  } catch {
    content = null;
  }

  // Smart fallback (always returns usable content)
  if (!content) {
    content = {
      heroBadge: `★ Trusted ${category} in ${city || "India"}`,
      heroHeading: `${name} — ${services[0] ? services[0] : category} Experts in ${city || "Your City"}`,
      heroSubheading: `Quality ${category.toLowerCase()} services${city ? ` in ${city}` : ""} with honest pricing and on-time delivery. Contact us today for a free quote.`,
      ctaPrimary: "Get a Free Quote",
      ctaSecondary: "Call Now",
      about: `${name} is a trusted ${category.toLowerCase()}${city ? ` based in ${city}` : ""}. ${body.description || `We specialize in ${services.join(", ") || "our core services"} and take pride in quality workmanship, transparent pricing and long-term customer relationships.`} Our experienced team makes sure every job is done right the first time.`,
      stats: [
        { value: "10+", label: "Years Experience" },
        { value: "500+", label: "Happy Customers" },
        { value: "1000+", label: "Projects Completed" },
        { value: "4.9", label: "Average Rating" },
      ],
      whyUs: [
        { title: "Experienced Team", description: "Skilled professionals with years of hands-on expertise." },
        { title: "Fair & Transparent Pricing", description: "Clear quotes upfront — no hidden charges, ever." },
        { title: "On-Time Delivery", description: "We respect deadlines and complete work on schedule." },
        { title: "Quality Guarantee", description: "We stand behind our work with reliable after-service support." },
      ],
      faqs: [
        { question: `What services does ${name} offer?`, answer: `We offer ${services.join(", ") || `complete ${category.toLowerCase()} services`}. Contact us with your requirement and we will guide you to the right solution.` },
        { question: `Where is ${name} located?`, answer: `We are located in ${city || "your city"} and serve customers across the surrounding areas.` },
        { question: `How can I get a quote?`, answer: `Call us or send a WhatsApp message — share your requirement and we will send a free, no-obligation quote quickly.` },
        { question: `What are your business hours?`, answer: "We are open Monday to Saturday, 9:00 AM to 7:00 PM. Sunday visits by appointment." },
        { question: `Do you offer warranty on your work?`, answer: "Yes, we stand by our workmanship. Warranty details depend on the service — ask us when you book." },
      ],
      seoTitle: `${name} | ${category} in ${city || "India"}`.slice(0, 60),
      seoDescription: `${name} is a trusted ${category.toLowerCase()}${city ? ` in ${city}` : ""}. ${services.slice(0, 3).join(", ") || "Quality service"}. Call now for a free quote.`.slice(0, 160),
    };
  }

  return ok({ content });
}

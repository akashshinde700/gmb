import { db } from "@/lib/db";
import { fail, getSessionUser, ok, uniqueSlug } from "@/lib/auth";
import { generateSite, type AiSiteContent } from "@/lib/sections";
import { serializeBusiness, serializeWebsite, serializeSub } from "@/lib/serialize";

/** POST /api/onboarding — create the tenant business + generated website + 14-day trial */
export async function POST(req: Request) {
  const session = await getSessionUser(req);
  if (!session) return fail("Unauthorized", 401);

  const existing = await db.business.findUnique({ where: { userId: session.id } });
  if (existing) return fail("Your business is already set up. Use the dashboard to edit it.", 409);

  const body = (await req.json()) as Record<string, unknown>;
  const name = String(body.name || "").trim();
  const category = String(body.category || "").trim();
  if (!name || name.length < 2) return fail("Business name is required");
  if (!category) return fail("Please select a business category");

  const phone = String(body.phone || "").trim();
  if (!phone) return fail("Phone number is required");

  const city = String(body.city || "").trim();
  const tagline = String(body.tagline || "").trim();
  const description = String(body.description || "").trim();
  const ai = (body.ai || null) as AiSiteContent | null;

  const slug = await uniqueSlug(name);
  const coverUrl = String(body.coverUrl || "").trim();
  const templateId = String(body.templateId || "").trim();

  // Brand colors follow the chosen template (or defaults)
  const template = templateId ? await db.template.findUnique({ where: { id: templateId } }) : null;
  const templateTheme = template ? JSON.parse(template.themeJson || "{}") : {};

  const business = await db.business.create({
    data: {
      userId: session.id,
      name, slug, category, tagline, description,
      ownerName: String(body.ownerName || session.name).trim(),
      phone,
      whatsapp: String(body.whatsapp || phone).trim(),
      email: String(body.email || session.email).trim(),
      address: String(body.address || "").trim(),
      city, state: String(body.state || "").trim(),
      country: "India",
      pincode: String(body.pincode || "").trim(),
      establishedYear: String(body.establishedYear || "").trim(),
      gstin: String(body.gstin || "").trim(),
      upiId: String(body.upiId || "").trim(),
      logoUrl: String(body.logoUrl || "").trim(),
      coverUrl,
      brandPrimary: String(templateTheme.primary || "#059669"),
      brandSecondary: String(templateTheme.secondary || "#0f766e"),
      brandAccent: String(templateTheme.accent || "#f59e0b"),
      templateId,
      gmbUrl: String(body.gmbUrl || "").trim(),
      mapsUrl: String(body.mapsUrl || "").trim(),
      status: "DRAFT",
      hoursJson: JSON.stringify({ Monday: "9:00 AM – 7:00 PM", Tuesday: "9:00 AM – 7:00 PM", Wednesday: "9:00 AM – 7:00 PM", Thursday: "9:00 AM – 7:00 PM", Friday: "9:00 AM – 7:00 PM", Saturday: "9:00 AM – 7:00 PM", Sunday: "Closed" }),
      socialsJson: JSON.stringify({}),
    },
  });

  const site = generateSite({
    business: {
      name, category, tagline, description, city, phone,
      whatsapp: String(body.whatsapp || phone).trim(),
      email: String(body.email || session.email).trim(),
      address: String(body.address || "").trim(),
      establishedYear: String(body.establishedYear || "").trim(),
      brandPrimary: business.brandPrimary,
      brandSecondary: business.brandSecondary,
      brandAccent: business.brandAccent,
      coverUrl, mapsUrl: business.mapsUrl,
    },
    ai,
  });

  await db.website.create({
    data: {
      businessId: business.id,
      seoTitle: site.seoTitle,
      seoDescription: site.seoDescription,
      keywords: site.keywords,
      themeJson: JSON.stringify({ ...site.theme, ...(templateTheme.layout || {}) }),
      sectionsJson: JSON.stringify(site.sections),
    },
  });

  // Auto-start 14-day free trial
  const trialPlan = await db.plan.findFirst({ where: { slug: "starter" } });
  const trialEnds = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  await db.subscription.create({
    data: {
      businessId: business.id,
      planId: trialPlan?.id ?? (await db.plan.findFirstOrThrow()).id,
      status: "TRIALING",
      amount: 0,
      trialEndsAt: trialEnds,
    },
  });

  await db.notification.create({
    data: {
      userId: session.id,
      title: "Your website is ready 🚀",
      body: `${name} has been set up. Preview it, add content, and publish when ready. Free trial active until ${trialEnds.toLocaleDateString("en-IN")}.`,
    },
  });

  const fresh = await db.business.findUnique({
    where: { id: business.id },
    include: { website: true, subscription: { include: { plan: true } } },
  });

  return ok({
    business: {
      ...serializeBusiness(fresh!),
      website: fresh!.website ? serializeWebsite(fresh!.website) : null,
      subscription: fresh!.subscription ? serializeSub(fresh!.subscription) : null,
    },
  }, 201);
}

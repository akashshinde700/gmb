import { db } from "@/lib/db";
import { trialEndsAt } from "@/lib/trial";
import { uniqueSlug } from "@/lib/auth";
import { generateSite, type AiSiteContent } from "@/lib/sections";
import { serializeBusiness, serializeWebsite, serializeSub } from "@/lib/serialize";
import { HttpError, isEmail, limitSubjectOrThrow, ok, readJson, requireUser, route, str } from "@/lib/api";
import { canPublish } from "@/lib/publish-rules";
import { tenantBaseUrl } from "@/lib/site-utils";
import { starterFaqs, starterPosts } from "@/lib/starter-content";
import { fallbackServices, fillCopy, industryServices, isPresetCategory, resolveIndustry } from "@/lib/industries";
import { fetchStockPhotos } from "@/lib/stock-images";
import { pick, pickN, stream, variantsFor } from "@/lib/variants";
import { SITE_ICON_KEYS } from "@/lib/site-icon-keys";

/** POST /api/onboarding — create the tenant business + generated website + free trial */
export const POST = route(async (req: Request) => {
  const session = await requireUser(req);
  // A double-submitted wizard used to race past the "already set up" check.
  limitSubjectOrThrow(`onboarding:${session.id}`, 5, 10 * 60 * 1000);

  const existing = await db.business.findUnique({ where: { userId: session.id } });
  if (existing) throw new HttpError("Your business is already set up. Use the dashboard to edit it.", 409);

  const body = await readJson<Record<string, unknown>>(req);
  const name = str(body.name, 150);
  const category = str(body.category, 100);
  const phone = str(body.phone, 20);
  if (!name || name.length < 2) throw new HttpError("Business name is required");
  if (!category) throw new HttpError("Please select a business category");
  if (!phone) throw new HttpError("Phone number is required");
  if (!/^[+\d][\d\s-]{6,19}$/.test(phone)) throw new HttpError("Please enter a valid phone number");

  const email = str(body.email, 200) || session.email;
  if (email && !isEmail(email)) throw new HttpError("Please enter a valid business email address");

  const city = str(body.city, 100);
  const address = str(body.address, 300);
  if (!address || address.length < 5) throw new HttpError("Please enter your full business address");
  if (!city) throw new HttpError("City is required");
  const tagline = str(body.tagline, 200);
  const description = str(body.description, 4000);
  const ai = (body.ai || null) as AiSiteContent | null;
  const whatsapp = str(body.whatsapp, 20) || phone;
  const coverUrl = str(body.coverUrl, 2000);
  const templateId = str(body.templateId, 60);
  const ownerName = str(body.ownerName, 120) || session.name;

  // The wizard makes services mandatory but the payload was being dropped, so
  // every new site opened with an empty Services section.
  // The slug is unique per business, so it is the seed that keeps two shops in
  // the same trade from getting the same colours, services and photos.
  const slug = await uniqueSlug(name);
  const draw = (label: string) => stream(slug, label);

  // The AI may have mapped an unlisted trade ("Event DJ") to the closest
  // preset; an unknown key from the client is simply ignored.
  const preset = resolveIndustry(category, ai?.industry);
  const variants = variantsFor(preset.key);
  const vars = { name, city, category };
  const aiServices = (Array.isArray(ai?.services) ? ai.services : [])
    .map((x) => ({
      name: str(x?.name, 120),
      description: str(x?.description, 600),
      icon: SITE_ICON_KEYS.includes(String(x?.icon)) ? String(x?.icon) : "",
    }))
    .filter((x) => x.name);
  // A trade the wizard lists uses its preset; a typed-in one uses what the AI
  // wrote for it, or a fallback that leads with the trade's own name.
  const presetServices = isPresetCategory(category)
    ? pickN(draw("services"), industryServices(category, vars), 6)
    : aiServices.length
    ? aiServices.map((x) => ({ ...x, icon: x.icon || preset.motif.icons[0] || "sparkles" }))
    : fallbackServices(category, vars);
  const iconFor = (svcName: string) =>
    presetServices.find((p) => p.name.toLowerCase() === svcName.toLowerCase())?.icon ?? "";
  const submitted = (Array.isArray(body.services) ? body.services : [])
    .map((raw) => {
      const row = (raw || {}) as Record<string, unknown>;
      return { name: str(row.name, 120), description: str(row.description, 600) };
    })
    .filter((sv) => sv.name)
    .slice(0, 24);
  // An empty list still gets a full, industry-appropriate services section.
  const services = (submitted.length ? submitted : presetServices).map((sv) => ({
    ...sv,
    icon: iconFor(sv.name) || preset.motif.icons[0] || "sparkles",
  }));
  const serviceNames = services.map((sv) => sv.name);


  // Brand colors follow the chosen template (or defaults)
  const template = templateId ? await db.template.findUnique({ where: { id: templateId } }) : null;
  const templateTheme = template ? (JSON.parse(template.themeJson || "{}") as Record<string, unknown>) : {};

  const trialPlan =
    (await db.plan.findFirst({ where: { slug: "standard", active: true } })) ??
    (await db.plan.findFirst({ where: { active: true }, orderBy: { sortOrder: "asc" } }));
  if (!trialPlan) {
    throw new HttpError("No subscription plans are configured yet. Please contact support.", 503);
  }

  // The colours the customer saw in the wizard (pre-filled from their
  // industry) win; then the template's; then the industry palette.
  const hex = (v: unknown) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : "");
  const palette = pick(draw("palette"), variants.palettes);
  const brandPrimary = hex(body.brandPrimary) || hex(templateTheme.primary) || palette[0];
  const brandSecondary = hex(body.brandSecondary) || hex(templateTheme.secondary) || palette[1];
  const brandAccent = hex(body.brandAccent) || hex(templateTheme.accent) || palette[2];
  const mapsUrl = str(body.mapsUrl, 1000);
  const trialEnds = trialEndsAt();

  // No photo of their own yet: start them with real photos of their trade —
  // a cover, one beside the About text, and a gallery — which they can swap.
  const imageQuery =
    str(ai?.imageQuery, 60).replace(/[^\w\s-]/g, "") ||
    (preset.key === "general" ? category : pick(draw("imgq"), variants.imageQueries));
  const photoPage = 1 + Math.floor(draw("page")() * 5);
  const stock = coverUrl ? [] : await fetchStockPhotos(imageQuery, 8, photoPage);
  // The hero keeps its animated industry scene unless the OWNER gave a photo:
  // a stock picture in the hero makes every site in a trade look alike, while
  // the scene is what reads as designed. Stock photos go to About and Gallery,
  // and the first one still backs link previews.
  const finalCover = coverUrl || stock[0]?.url || "";
  const aboutImage = stock[0]?.url;
  const galleryPhotos = stock.slice(1);

  const site = generateSite({
    business: {
      name, category, tagline, description, city, phone, whatsapp, email, address,
      establishedYear: str(body.establishedYear, 4),
      brandPrimary, brandSecondary, brandAccent, coverUrl, mapsUrl,
      state: str(body.state, 100),
      pincode: str(body.pincode, 10),
    },
    ai,
    industry: preset.key,
    aboutImage,
    seed: slug,
  });

  // Publish straight away when nothing is missing. The wizard already asked for
  // everything the publish rules need, and the customer just pressed a button
  // that says "Create My Website" — leaving it in a drawer marked DRAFT, with
  // no sign that a second, separate step exists, is how a free trial runs out
  // on a site nobody outside the account has ever been able to open.
  //
  // Same rules as POST /api/website/publish, from one module, so the two can
  // never disagree about what "ready" means. Address and city are optional in
  // this wizard but required to publish, so an incomplete one stays a draft and
  // the notification below says exactly what to add.
  const goLive = canPublish(
    { name, phone, address, city },
    {
      seoTitle: site.seoTitle,
      visibleSections: site.sections.filter((sec) => sec.visible).length,
    },
  );

  // Business + website + trial + welcome notice are one unit: a partial
  // onboarding left an account stuck with a business but no website to edit.
  const businessId = await db.$transaction(async (tx) => {
    const business = await tx.business.create({
      data: {
        userId: session.id,
        name, slug, category, tagline, description,
        ownerName,
        phone, whatsapp, email, address, city,
        state: str(body.state, 100),
        country: "India",
        pincode: str(body.pincode, 10),
        establishedYear: str(body.establishedYear, 4),
        gstin: str(body.gstin, 20),
        upiId: str(body.upiId, 100),
        logoUrl: str(body.logoUrl, 2000),
        coverUrl: finalCover,
        brandPrimary, brandSecondary, brandAccent,
        templateId,
        gmbUrl: str(body.gmbUrl, 1000),
        mapsUrl,
        // Set below, once the generated sections are known: a wizard whose last
        // button says "Create My Website" has to actually produce one. This was
        // always DRAFT, so every customer finished the wizard, saw a success
        // screen, and had nothing public — three of three trial customers on the
        // live system were stuck exactly there with a complete, publishable site.
        status: goLive ? "PUBLISHED" : "DRAFT",
        hoursJson: JSON.stringify({
          Monday: "9:00 AM – 7:00 PM", Tuesday: "9:00 AM – 7:00 PM", Wednesday: "9:00 AM – 7:00 PM",
          Thursday: "9:00 AM – 7:00 PM", Friday: "9:00 AM – 7:00 PM", Saturday: "9:00 AM – 7:00 PM",
          Sunday: "Closed",
        }),
        socialsJson: JSON.stringify({}),
      },
    });

    await tx.website.create({
      data: {
        businessId: business.id,
        publishedAt: goLive ? new Date() : null,
        seoTitle: site.seoTitle,
        seoDescription: site.seoDescription,
        keywords: site.keywords,
        themeJson: JSON.stringify({ ...site.theme, ...((templateTheme.layout as object) || {}) }),
        sectionsJson: JSON.stringify(site.sections),
      },
    });

    if (services.length) {
      await tx.service.createMany({
        data: services.map((sv, i) => ({
          businessId: business.id,
          name: sv.name,
          description: sv.description,
          icon: sv.icon,
          featured: i < 3,
          sortOrder: i + 1,
        })),
      });
    }

    if (galleryPhotos.length) {
      await tx.galleryItem.createMany({
        data: galleryPhotos.map((ph, i) => ({
          businessId: business.id,
          url: ph.url,
          alt: ph.alt,
          caption: "",
          sortOrder: i + 1,
        })),
      });
    }

    // FAQs and blog posts are created as real rows so the customer can edit
    // them later from their dashboard, and so the FAQ structured data has
    // something to describe on day one.
    const starter = {
      name, category, city, phone, services: serviceNames, ai,
      industryFaqs: preset.faqs.map((f) => ({ question: fillCopy(f.question, vars), answer: fillCopy(f.answer, vars) })),
    };
    await tx.faq.createMany({
      data: starterFaqs(starter).map((f) => ({ ...f, businessId: business.id })),
    });
    // Drafts on purpose: template copy should never go live under the owner's
    // name until they have read it.
    await tx.blogPost.createMany({
      data: starterPosts(starter).map((post) => ({
        ...post,
        businessId: business.id,
        author: ownerName,
        category,
        published: false,
      })),
    });

    await tx.subscription.create({
      data: {
        businessId: business.id,
        planId: trialPlan.id,
        status: "TRIALING",
        amount: 0,
        trialEndsAt: trialEnds,
      },
    });

    await tx.notification.create({
      data: {
        userId: session.id,
        title: goLive ? "Your website is live 🚀" : "Your website is ready 🚀",
        body: goLive
          ? `${name} is live at ${tenantBaseUrl(slug, null)} — share the link with your customers. Free trial active until ${trialEnds.toLocaleDateString("en-IN")}.`
          : `${name} has been set up, but it is not public yet — add your address and city in Business Profile, then press Publish. Free trial active until ${trialEnds.toLocaleDateString("en-IN")}.`,
      },
    });

    return business.id;
  });

  const fresh = await db.business.findUnique({
    where: { id: businessId },
    include: { website: true, subscription: { include: { plan: true } } },
  });
  if (!fresh) throw new HttpError("Could not load the business that was just created", 500);

  return ok(
    {
      business: {
        ...serializeBusiness(fresh),
        website: fresh.website ? serializeWebsite(fresh.website) : null,
        subscription: fresh.subscription ? serializeSub(fresh.subscription) : null,
      },
    },
    201,
  );
});

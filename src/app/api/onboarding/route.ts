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
import { fetchStockPhotos, searchesFor } from "@/lib/stock-images";
import { candidateBlueprints, resolveColors, designSeed } from "@/lib/blueprint";
import { bestCandidate, profileFromSite, uniquenessPercent, type SiteProfile } from "@/lib/uniqueness";
import { checkSite } from "@/lib/site-quality";
import { recordVersion } from "@/lib/site-history";
import { posterUrl } from "@/lib/site-art";
import { rng, seedFrom } from "@/lib/variants";
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
  const slug = await uniqueSlug(name);

  // The AI may have mapped an unlisted trade ("Event DJ") to the closest
  // preset; an unknown key from the client is simply ignored.
  const preset = resolveIndustry(category, ai?.industry);
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
    ? industryServices(category, vars)
    : aiServices.length
    ? aiServices.map((x) => ({ ...x, icon: x.icon || preset.motif.icons[0] || "sparkles" }))
    : fallbackServices(category, vars);

  /**
   * What this business gets, from one place.
   *
   * The wizard builds the same blueprint from the same seed to show the
   * customer their colours and services, so the preview and the site that gets
   * written cannot disagree — the divergence between two separate draws here is
   * exactly what made every business in a trade come out identical.
   */

  const iconFor = (svcName: string) =>
    presetServices.find((p) => p.name.toLowerCase() === svcName.toLowerCase())?.icon ??
    aiServices.find((p) => p.name.toLowerCase() === svcName.toLowerCase())?.icon ??
    "";

  const submitted = (Array.isArray(body.services) ? body.services : [])
    .map((raw) => {
      const row = (raw || {}) as Record<string, unknown>;
      return { name: str(row.name, 120), description: str(row.description, 600) };
    })
    .filter((sv) => sv.name)
    .slice(0, 24);
  // The sites already built in this trade. They decide two things below: which
  // palette this business starts on (so it is not the same as the last one),
  // and which of three candidate genomes is genuinely unlike the rest.
  const tradeMates = await db.business.findMany({
    where: { category },
    select: {
      brandPrimary: true, brandSecondary: true, brandAccent: true,
      website: { select: { themeJson: true, sectionsJson: true } },
    },
    take: 500,
  });
  const takenPalettes = tradeMates.map((b) => `${b.brandPrimary},${b.brandSecondary},${b.brandAccent}`);

  // Three genomes, from which the most distinct is kept (see the comparison
  // below). The first one also supplies the services and search terms used
  // before the winner is known.
  const candidates = candidateBlueprints({
    name,
    city,
    category,
    industryKey: ai?.industry,
    description,
    taken: takenPalettes,
    seed: designSeed(name, city),
  });

  const firstDraft = candidates[0];

  // An empty list still gets a full, industry-appropriate services section —
  // the blueprint's list for this business, which is not the same six rows the
  // next business in the trade will get.
  const services = (
    submitted.length ? submitted : firstDraft.services.length ? firstDraft.services : presetServices
  ).map((sv): { name: string; description: string; icon: string } => ({
    name: sv.name,
    description: sv.description,
    icon: (("icon" in sv && typeof sv.icon === "string" && sv.icon) || "") || iconFor(sv.name) || preset.motif.icons[0] || "sparkles",
  }));
  const serviceNames = services.map((sv) => sv.name);

  // Brand colours follow what the customer chose, else this business's own
  // blueprint. A chosen template can still contribute layout below, but it no
  // longer decides colours: one template shared by two customers is another way
  // for two sites to come out identical.
  const template = templateId ? await db.template.findUnique({ where: { id: templateId } }) : null;
  const templateTheme = template ? (JSON.parse(template.themeJson || "{}") as Record<string, unknown>) : {};

  const trialPlan =
    (await db.plan.findFirst({ where: { slug: "standard", active: true } })) ??
    (await db.plan.findFirst({ where: { active: true }, orderBy: { sortOrder: "asc" } }));
  if (!trialPlan) {
    throw new HttpError("No subscription plans are configured yet. Please contact support.", 503);
  }

  // What the customer chose in the wizard, kept raw until the genome is chosen
  // (below): their pick always wins, and anything they did not choose comes
  // from the winning candidate's own palette.
  const submittedColors = { primary: body.brandPrimary, secondary: body.brandSecondary, accent: body.brandAccent };

  const mapsUrl = str(body.mapsUrl, 1000);
  const trialEnds = trialEndsAt();

  // No photo of their own yet: start them with real photos of their trade —
  // a cover, one beside the About text, and a gallery — which they can swap.
  // Search terms put the owner's own words first — their description and the
  // service names they chose — before the trade's generic queries. Two
  // jewellers who described different specialities then search for different
  // things, instead of both getting "jewellery".
  const searches = searchesFor({
    category,
    description,
    services,
    curated: [...firstDraft.imageQueries.slice(0, 2), "business"],
  });
  const suggested = str(ai?.imageQuery, 60).replace(/[^\w\s-]/g, "");
  const photoPage = 1 + Math.floor(rng(seedFrom(`${firstDraft.seed}::imgpage`))() * 5);
  const stock = coverUrl ? [] : await fetchStockPhotos(searches[0], 8, photoPage, [...searches.slice(1), suggested], slug);

  // The hero always keeps its animated scene unless the OWNER uploaded a photo.
  // Putting a stock picture there was what made every site in a trade open with
  // the same image; stock photos belong in About and the gallery, where they
  // are one tile among several rather than the whole first impression.
  const heroImage = coverUrl;
  // A brand-new site with no photos still needs a cover for link previews, the
  // dashboard card and the OG tags — its own generated poster, which is
  // different for every business and matches the chosen palette.
  const finalCover = coverUrl || posterUrl(slug, "wide", 0, { section: "cover" });
  // Every image a generated page shows is its own drawing: the hero, the about
  // block and each gallery tile carry a different picture of the same business,
  // rather than one picture cropped four ways.
  const aboutImage = stock[0]?.url ?? posterUrl(slug, "portrait", 0, { section: "about" });
  // Gallery: real photos first, then generated posters of this business so a
  // thin photo search never leaves the section empty or repeated.
  const galleryPhotos = [
    ...stock.slice(1),
    ...Array.from({ length: Math.max(0, 3 - stock.slice(1).length) }, (_, i) => ({
      url: posterUrl(slug, "square", i + 1, { section: "gallery" }),
      alt: `${name} — ${category} in ${city || "India"}`.trim(),
    })),
  ];

  // The copy is written around the services the customer actually kept: the
  // model's original list must not reappear in the hero subheading after they
  // deleted or renamed rows on the services step.
  const siteAi: AiSiteContent | null = ai ? { ...ai, services } : null;

  // A first draft, built from the first candidate. Its only job is to let the
  // candidates be compared like-for-like (same copy, same photos, different
  // genome); the winner is rebuilt properly a few lines below.
  const draftSite = generateSite({
    business: {
      name, category, tagline, description, city, phone, whatsapp, email, address,
      establishedYear: str(body.establishedYear, 4),
      // The slug is what makes every generated picture this business's own: the
      // section artwork is addressed by it.
      slug,
      brandPrimary: firstDraft.palette[0], brandSecondary: firstDraft.palette[1], brandAccent: firstDraft.palette[2],
      coverUrl, mapsUrl,
      state: str(body.state, 100),
      pincode: str(body.pincode, 10),
    },
    ai: siteAi,
    industry: preset.key,
    aboutImage,
    heroImage,
    blueprint: firstDraft,
    seed: firstDraft.seed,
  });

  // Business + website + trial + welcome notice are one unit: a partial
  // onboarding left an account stuck with a business but no website to edit.
  /* --- pick the most distinct genome, then build the site from it ---------- */

  const existingProfiles: SiteProfile[] = tradeMates
    .map((b) => {
      try {
        const theme = b.website ? (JSON.parse(b.website.themeJson || "{}") as Record<string, never>) : {};
        const sections = b.website
          ? (JSON.parse(b.website.sectionsJson || "[]") as { type: string; content?: Record<string, unknown>; visible?: boolean }[])
          : [];
        return profileFromSite({
          brandPrimary: b.brandPrimary,
          brandSecondary: b.brandSecondary,
          brandAccent: b.brandAccent,
          theme,
          sections,
        });
      } catch {
        // A row with unreadable JSON must not stop a signup.
        return null;
      }
    })
    .filter((x): x is SiteProfile => x !== null);

  /** What a candidate would ship with, the customer's own choice included. */
  const coloursOf = (candidate: (typeof candidates)[number]) => resolveColors(submittedColors, candidate);

  const profileOf = (candidate: (typeof candidates)[number]): SiteProfile => {
    const colours = coloursOf(candidate);
    // Only the genome differs between candidates, so the draft's copy and
    // photos are used for all of them — the comparison is about design.
    const sections = draftSite.sections.map((sec) => {
      const planned = candidate.dna.sectionPlan.find((c) => c.type === sec.type);
      return {
        type: sec.type,
        visible: sec.visible,
        content: { visible: sec.visible, variant: planned?.variant ?? sec.content?.variant },
      };
    });
    return profileFromSite({
      brandPrimary: colours.primary,
      brandSecondary: colours.secondary,
      brandAccent: colours.accent,
      theme: {
        ...draftSite.theme,
        font: candidate.look.font,
        radius: candidate.look.radius,
        cardStyle: candidate.look.cardStyle,
        shadow: candidate.dna.design.shadow,
        spacing: candidate.dna.design.spacing,
        button: candidate.dna.design.button,
        header: candidate.dna.design.header,
        footer: candidate.dna.design.footer,
        imageTreatment: candidate.dna.design.imageTreatment,
        motion: candidate.dna.motion,
        ...((templateTheme.layout as object) || {}),
      },
      sections,
      services,
    });
  };

  // The wizard offers three concepts (see /api/onboarding/concepts) and the
  // owner picks one. When they did, that genome is used — a choice the owner
  // made outranks the similarity score, which only exists to pick a sensible
  // default when nobody is looking. Otherwise the most distinct one is kept.
  const chosenKey = Number(body.concept);
  const chosen = Number.isInteger(chosenKey) && candidates[chosenKey] ? candidates[chosenKey] : null;

  const picked = bestCandidate(candidates, profileOf, existingProfiles);

  // The winner is rebuilt properly — its own colours, section order and copy.
  const blueprint = chosen ?? picked.chosen;
  const selectedColors = coloursOf(blueprint);
  const brandPrimary = selectedColors.primary;
  const brandSecondary = selectedColors.secondary;
  const brandAccent = selectedColors.accent;
  const uniqueness = uniquenessPercent(picked.score);

  const site = generateSite({
    business: {
      name, category, tagline, description, city, phone, whatsapp, email, address,
      establishedYear: str(body.establishedYear, 4),
      slug,
      brandPrimary, brandSecondary, brandAccent, coverUrl, mapsUrl,
      state: str(body.state, 100),
      pincode: str(body.pincode, 10),
    },
    ai: siteAi,
    industry: preset.key,
    aboutImage,
    heroImage,
    blueprint,
    seed: blueprint.seed,
  });

  // The site is scored before it is saved: an unreadable headline, a page with
  // no way to make contact or a missing meta description are all detectable
  // without a model, and the owner is shown exactly what to fix rather than
  // being handed a site that only looks finished.
  const quality = checkSite({
    sections: site.sections,
    theme: site.theme,
    colors: { primary: brandPrimary, secondary: brandSecondary, accent: brandAccent },
    seoTitle: site.seoTitle,
    seoDescription: site.seoDescription,
    business: { phone, whatsapp, email, city, description },
    services,
    galleryCount: galleryPhotos.length,
    // The score is shown with the other eight, so the uniqueness the director
    // just measured is part of it rather than a number on a different screen.
    uniqueness,
    // The same FAQ rows the transaction is about to write, so the checker
    // scores what the site will actually contain.
    faqCount: starterFaqs({
      name, category, city, phone, services: serviceNames, ai,
      industryFaqs: preset.faqs.map((f) => ({ question: fillCopy(f.question, vars), answer: fillCopy(f.answer, vars) })),
    }).length,
  });
  const siteWithQuality = { ...site, theme: { ...site.theme, quality } };

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
        // Uniqueness is stored with the genome so the owner (and the dashboard)
        // can see how different this site is from the rest of its trade, and so
        // a later regeneration knows what to beat.
        themeJson: JSON.stringify({
          ...siteWithQuality.theme,
          ...((templateTheme.layout as object) || {}),
          uniqueness,
        }),
        sectionsJson: JSON.stringify(siteWithQuality.sections),
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

  // Version 1 of this site, so every later change — an edit, a restyle, an
  // automatic fix, a regenerated section — has something to go back to.
  if (fresh.website) {
    await recordVersion({ website: fresh.website, label: "Created by WebSetu" }).catch((e) => {
      // A site that was built successfully must not fail because its history
      // could not be written; the version is recoverable, the signup is not.
      console.error("[history] could not record the first version:", e instanceof Error ? e.message : e);
    });
  }

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

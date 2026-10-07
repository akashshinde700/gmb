import { db } from "@/lib/db";
import { parseJson } from "@/lib/sections";
import { serializeBusiness } from "@/lib/serialize";
import type { Facts } from "@/lib/places";
import {
  extractWebsiteImport, fetchSite, parseSiteUrl, tagImportedFacts, websiteImportOptions,
  websiteImportSummary, websitePatchFromOptions,
} from "@/lib/site-import";
import { HttpError, ok, readJson, requireBusiness, requireUser, route, str } from "@/lib/api";

/**
 * GET /api/business/website-import — what an earlier import brought over.
 *
 * Counts only: the dashboard badges the fields it wrote ("from your old site")
 * and shows how many services, questions and photos came with them.
 */
export const GET = route(async (req: Request) => {
  const session = await requireUser(req);
  const business = await requireBusiness(session);
  const facts = parseJson<Facts>(business.factsJson ?? "{}", {});
  const imported = Object.entries(facts)
    .filter(([, fact]) => fact.source === "website")
    .map(([field, fact]) => ({ field, value: fact.value, at: fact.at ?? null }));
  const [services, faqs, photos] = await Promise.all([
    db.service.count({ where: { businessId: business.id } }),
    db.faq.count({ where: { businessId: business.id } }),
    db.galleryItem.count({ where: { businessId: business.id } }),
  ]);
  return ok({ imported, services, faqs, photos });
});

/**
 * POST /api/business/website-import — read the owner's existing site, then keep
 * whichever parts of it they ticked.
 *
 *   { mode: "lookup", url }                                  → the offer
 *   { mode: "apply", url, fields, services?, faqs?, photos? } → write it
 *
 * Apply re-fetches the page instead of trusting what the browser sends back, so
 * nothing reaches the database that was not on the owner's own website a moment
 * ago. Everything written is tagged "website" in factsJson, which is how the
 * dashboard can say where a phone number came from.
 */
export const POST = route(async (req: Request) => {
  const session = await requireUser(req);
  const business = await requireBusiness(session);
  const body = await readJson<{
    mode?: string; url?: string; fields?: unknown;
    services?: unknown; faqs?: unknown; photos?: unknown;
  }>(req);

  const input = str(body.url, 600).trim();
  if (!input) throw new HttpError("Paste the address of your current website");

  let parsed;
  try {
    parsed = parseSiteUrl(input);
  } catch (error) {
    throw new HttpError((error as Error).message || "That does not look like a website address", 422);
  }

  let page;
  try {
    page = await fetchSite(parsed.url);
  } catch (error) {
    throw new HttpError((error as Error).message || "That website could not be read", 502);
  }

  const imported = extractWebsiteImport(page.html, page.url);
  const options = websiteImportOptions(imported, {
    name: business.name, phone: business.phone, address: business.address,
    city: business.city, pincode: business.pincode, hoursJson: business.hoursJson,
    mapsUrl: business.mapsUrl, gmbUrl: business.gmbUrl, placeId: business.placeId,
    tagline: business.tagline, description: business.description, email: business.email,
    whatsapp: business.whatsapp, logoUrl: business.logoUrl, coverUrl: business.coverUrl,
    state: business.state,
  });

  if (str(body.mode, 20) !== "apply") {
    return ok({
      url: page.url,
      followed: page.hops.length,
      title: imported.title,
      summary: websiteImportSummary(imported),
      missing: imported.missing,
      via: imported.via,
      options,
      services: imported.services,
      faqs: imported.faqs,
      photos: imported.images,
      social: imported.social,
      hourDays: Object.keys(imported.hours).length,
    });
  }

  /* ------------------------------------------------------------------ apply */

  const chosen = Array.isArray(body.fields)
    ? body.fields.filter((f): f is string => typeof f === "string").slice(0, 20)
    : [];
  const patch = websitePatchFromOptions(options, chosen);
  const wantServices = body.services === true && imported.services.length > 0;
  const wantFaqs = body.faqs === true && imported.faqs.length > 0;
  const wantPhotos = body.photos === true && imported.images.length > 0;

  if (!Object.keys(patch).length && !wantServices && !wantFaqs && !wantPhotos) {
    throw new HttpError("Nothing was ticked — pick at least one thing to bring over", 422);
  }

  // Hours replace wholesale here, unlike Google's partial view: the owner's own
  // site is the authority on when they are open.
  if (patch.hoursJson) {
    const incoming = parseJson<Record<string, string>>(patch.hoursJson, {});
    if (!Object.keys(incoming).length) delete patch.hoursJson;
  }
  if (patch.phone) {
    const digits = patch.phone.replace(/[^\d]/g, "").slice(-12);
    if (digits.length < 10) delete patch.phone;
  }

  const before = parseJson<Facts>(business.factsJson ?? "{}", {});
  const factsAfter = tagImportedFacts(before, imported, patch);

  let servicesAdded = 0;
  if (wantServices) {
    const existing = await db.service.findMany({ where: { businessId: business.id }, select: { name: true } });
    const seen = new Set(existing.map((s) => s.name.trim().toLowerCase()));
    const rows = imported.services
      .filter((s) => !seen.has(s.name.trim().toLowerCase()))
      .map((s, i) => ({
        businessId: business.id,
        name: s.name.slice(0, 120),
        description: s.description.slice(0, 600),
        sortOrder: existing.length + i + 1,
      }));
    if (rows.length) {
      await db.service.createMany({ data: rows });
      servicesAdded = rows.length;
    }
  }

  let faqsAdded = 0;
  if (wantFaqs) {
    const existing = await db.faq.findMany({ where: { businessId: business.id }, select: { question: true } });
    const seen = new Set(existing.map((f) => f.question.trim().toLowerCase()));
    const rows = imported.faqs
      .filter((f) => !seen.has(f.question.trim().toLowerCase()))
      .map((f, i) => ({
        businessId: business.id,
        question: f.question.slice(0, 300),
        answer: f.answer.slice(0, 1200),
        sortOrder: existing.length + i + 1,
      }));
    if (rows.length) {
      await db.faq.createMany({ data: rows });
      faqsAdded = rows.length;
    }
  }

  let photosAdded = 0;
  if (wantPhotos) {
    const existing = await db.galleryItem.findMany({ where: { businessId: business.id }, select: { url: true } });
    const seen = new Set(existing.map((g) => g.url));
    const rows = imported.images
      .filter((image) => !seen.has(image.url))
      .map((image, i) => ({
        businessId: business.id,
        url: image.url.slice(0, 1000),
        alt: (image.alt || business.name).slice(0, 200),
        caption: image.alt.slice(0, 200),
        sortOrder: existing.length + i + 1,
      }));
    if (rows.length) {
      await db.galleryItem.createMany({ data: rows });
      photosAdded = rows.length;
    }
  }

  const updated = await db.business.update({
    where: { id: business.id },
    data: {
      ...patch,
      factsJson: JSON.stringify(factsAfter).slice(0, 8000),
      ...(Object.keys(imported.hours).length && patch.hoursJson
        ? { hoursJson: JSON.stringify(imported.hours).slice(0, 4000) }
        : {}),
    },
  });

  return ok({
    applied: options
      .filter((option) => chosen.includes(option.id))
      .map((option) => ({ field: option.field, label: option.label, value: option.display })),
    servicesAdded,
    faqsAdded,
    photosAdded,
    via: imported.via,
    missing: imported.missing,
    facts: factsAfter,
    business: serializeBusiness(updated),
  });
});

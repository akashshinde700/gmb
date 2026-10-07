import { db } from "@/lib/db";
import { parseJson } from "@/lib/sections";
import { serializeBusiness } from "@/lib/serialize";
import {
  cleanPhone, factOptions, lookupPlace, parsePlaceLink, patchFromOptions, reviewRows, tagFacts,
  type BusinessSnapshot, type Facts, type PlaceFacts, type PlaceReview,
} from "@/lib/places";
import { HttpError, ok, readJson, requireBusiness, requireUser, route, str } from "@/lib/api";

/** Columns the owner's own data lives in, for the "what would change" preview. */
function snapshot(business: {
  name: string; phone: string; address: string; city: string; pincode: string;
  hoursJson: string; mapsUrl: string; gmbUrl: string; placeId: string;
}): BusinessSnapshot {
  return {
    name: business.name, phone: business.phone, address: business.address, city: business.city,
    pincode: business.pincode, hoursJson: business.hoursJson, mapsUrl: business.mapsUrl,
    gmbUrl: business.gmbUrl, placeId: business.placeId,
  };
}

/**
 * GET /api/business/google — what was imported, and what is still unverified.
 *
 * The dashboard uses this to badge fields ("Google", "you") and to show the
 * rating that came back with the profile.
 */
export const GET = route(async (req: Request) => {
  const session = await requireUser(req);
  const business = await requireBusiness(session);
  const facts = parseJson<Facts>(business.factsJson ?? "{}", {});
  return ok({
    facts,
    link: business.gmbUrl,
    reviewsCached: parseJson<PlaceReview[]>(business.googleReviewsJson, []).length,
    reviewsAt: business.googleReviewsAt?.toISOString() ?? null,
    hasPlacesKey: Boolean((process.env.GOOGLE_PLACES_API_KEY ?? "").trim()),
  });
});

/**
 * POST /api/business/google — look up a business, then apply what was ticked.
 *
 *   { mode: "lookup", input }                       → the offer, nothing written
 *   { mode: "apply", input, fields, reviews? }      → write the ticked lines only
 *
 * Apply re-runs the lookup on the server rather than trusting facts sent by the
 * browser: the data that reaches the database is always something a named source
 * actually said.
 */
export const POST = route(async (req: Request) => {
  const session = await requireUser(req);
  const business = await requireBusiness(session);
  const body = await readJson<{ mode?: string; input?: string; fields?: unknown; reviews?: unknown }>(req);

  const input = str(body.input, 600).trim();
  if (!input) throw new HttpError("Paste your Google link, or type your business name and city");
  const parsed = parsePlaceLink(input);

  const result = await lookupPlace(input);
  const facts = result.facts;

  if (str(body.mode, 20) !== "apply") {
    return ok({
      via: result.via,
      partial: result.partial,
      note: result.note ?? null,
      linkKind: parsed.kind,
      found: summarize(facts),
      options: factOptions(facts, snapshot(business)),
      reviews: reviewRows(facts),
      totalReviews: facts.reviewCount ?? 0,
      rating: facts.rating ?? null,
      photoCount: facts.photoCount ?? 0,
      categories: facts.categories ?? [],
    });
  }

  const chosen = Array.isArray(body.fields) ? body.fields.filter((f): f is string => typeof f === "string").slice(0, 20) : [];
  const options = factOptions(facts, snapshot(business));
  const patch = patchFromOptions(options, chosen);

  // Hours merge rather than replace: Google rarely knows about a break the owner
  // added, and a day Google omitted must not wipe the day the owner set.
  if (patch.hoursJson) {
    const existing = parseJson<Record<string, unknown>>(business.hoursJson, {});
    const incoming = parseJson<Record<string, string>>(patch.hoursJson, {});
    const merged: Record<string, unknown> = { ...existing };
    for (const [day, value] of Object.entries(incoming)) {
      if (!value || value === "Closed") continue;
      merged[day] = value;
    }
    patch.hoursJson = JSON.stringify(merged).slice(0, 4000);
  }
  if (patch.phone) {
    const phone = cleanPhone(patch.phone);
    if (!/^[+][\d]{10,14}$/.test(phone)) delete patch.phone;
    else patch.phone = phone;
  }

  const wantReviews = body.reviews === true && reviewRows(facts).length > 0;
  if (!Object.keys(patch).length && !wantReviews) {
    throw new HttpError("Nothing was ticked — pick at least one line to bring over", 422);
  }

  const before = parseJson<Facts>(business.factsJson ?? "{}", {});
  const factsAfter = tagFacts(before, facts, patch, result.via === "places-api" ? "google" : "link");

  /**
   * Google reviews become testimonials, credited to the reviewer and tagged so
   * the dashboard (and anybody reading the page) can tell they did not come from
   * the owner's memory. Re-applying does not duplicate them: an identical review
   * from the same author is skipped.
   */
  let reviewsAdded = 0;
  if (wantReviews) {
    const incoming = reviewRows(facts);
    const existing = await db.testimonial.findMany({
      where: { businessId: business.id, role: "Google review" },
      select: { name: true, content: true },
    });
    const seen = new Set(existing.map((t) => `${t.name}|${t.content}`));
    const rows = incoming
      .filter((r) => !seen.has(`${r.author}|${r.text}`))
      .map((r, i) => ({
        businessId: business.id,
        name: r.author,
        role: "Google review",
        content: r.text,
        rating: Math.min(5, Math.max(1, Math.round(r.rating) || 5)),
        sortOrder: existing.length + i + 1,
      }));
    if (rows.length) {
      await db.testimonial.createMany({ data: rows });
      reviewsAdded = rows.length;
    }
  }

  const updated = await db.business.update({
    where: { id: business.id },
    data: {
      ...patch,
      factsJson: JSON.stringify(factsAfter).slice(0, 8000),
      ...(wantReviews
        ? {
            googleReviewsJson: JSON.stringify(reviewRows(facts)).slice(0, 20000),
            googleReviewsAt: new Date(),
          }
        : {}),
    },
  });

  return ok({
    applied: options.filter((o) => chosen.includes(o.id)).map((o) => ({ field: o.field, label: o.label, value: o.display })),
    reviewsSaved: reviewsAdded,
    via: result.via,
    facts: factsAfter,
    business: serializeBusiness(updated),
  });
});

/** A couple of human lines for the "we found" heading. */
function summarize(facts: PlaceFacts): string[] {
  const lines: string[] = [];
  if (facts.name) lines.push(facts.name);
  if (facts.address) lines.push(facts.address);
  if (facts.phone) lines.push(facts.phone);
  if (facts.hours) lines.push("opening hours");
  if (typeof facts.rating === "number" && typeof facts.reviewCount === "number") {
    lines.push(`${facts.rating}★ from ${facts.reviewCount} Google reviews`);
  }
  if (facts.photoCount) lines.push(`${facts.photoCount} photos on your profile`);
  if (facts.categories?.length) lines.push(facts.categories.join(", "));
  return lines;
}

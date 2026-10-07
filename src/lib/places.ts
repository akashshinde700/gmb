// WebSetu — what Google knows about a business, and what it is allowed to do
// with it.
//
// The rule this file exists to enforce: a fact about somebody's business is
// either something the owner typed or something a named source said. Nothing is
// guessed, nothing is inferred from a template, and nothing Google did not
// actually return is written to a website.
//
// Two ways in, because most Indian small businesses do not have an API key and
// the product cannot require one:
//
//   1. the owner pastes their Google Maps / Business Profile link. The name, the
//      coordinates, the place id and the link itself are read out of the URL
//      itself — deterministic, offline, no key.
//   2. when GOOGLE_PLACES_API_KEY is configured, the same lookup also asks the
//      Places API for the address, the phone number, opening hours, the rating,
//      the categories and the reviews.
//
// Whatever comes back is a *proposal*. The owner ticks the lines they want, and
// only those are written — with the source recorded per field, which is what
// lets the dashboard say "this came from Google" instead of implying that we
// made it up.

export type FactSource = "google" | "owner" | "link" | "website";

/** One fact, and where it came from. */
export interface Fact {
  value: string;
  source: FactSource;
  /** ISO timestamp of when a source vouched for it. */
  at?: string;
}

/** Per-field provenance, stored on the business as factsJson. */
export type Facts = Record<string, Fact>;

export interface PlaceReview {
  author: string;
  text: string;
  rating: number;
  at?: string;
}

/** What a lookup found. Every field is optional: absence means "not told". */
export interface PlaceFacts {
  name?: string;
  address?: string;
  city?: string;
  pincode?: string;
  phone?: string;
  website?: string;
  categories?: string[];
  hours?: Record<string, string>;
  rating?: number;
  reviewCount?: number;
  reviews?: PlaceReview[];
  photoCount?: number;
  lat?: number;
  lng?: number;
  placeId?: string;
  /** The share link the owner pasted. */
  gmbUrl?: string;
  mapsUrl?: string;
}

/* ------------------------------- the link ---------------------------------- */

export interface ParsedPlaceLink {
  /** What kind of link it was, which decides whether a network call is needed. */
  kind: "place" | "search" | "coordinates" | "cid" | "short" | "unknown";
  name?: string;
  query?: string;
  lat?: number;
  lng?: number;
  placeId?: string;
  cid?: string;
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment.replace(/\+/g, " ")).trim();
  } catch {
    return segment.replace(/\+/g, " ").trim();
  }
}

function coordPair(text: string): { lat: number; lng: number } | null {
  const match = text.match(/(-?\d{1,3}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/**
 * Read a Google share link.
 *
 * Understood: /maps/place/<name>/@lat,lng, /maps/search/?query=, ?q=, ?ll=,
 * ?cid=, place_id:, and the app.goo.gl / g.page / g.co short forms (which are
 * only recognised, not resolved — resolving them needs the network, and a
 * lookup that quietly fails offline would be worse than being told).
 */
export function parsePlaceLink(raw: string): ParsedPlaceLink {
  const input = (raw || "").trim();
  if (!input) return { kind: "unknown" };

  // A bare name or "name, city" is a search, not a link.
  let url: URL | null = null;
  try {
    url = new URL(input.startsWith("http") ? input : `https://${input}`);
  } catch {
    url = null;
  }
  if (!url || !/(^|\.)(google\.[a-z.]+|goo\.gl|g\.page|g\.co)$/i.test(url.hostname)) {
    const looksLikeUrl = /^https?:\/\//i.test(input) || /^[a-z0-9-]+\.[a-z]{2,}\//i.test(input);
    return looksLikeUrl ? { kind: "unknown" } : { kind: "search", query: input };
  }

  const host = url.hostname.toLowerCase();
  const path = decodeURIComponent(url.pathname);
  const params = url.searchParams;

  // Short links: recognisable, not resolvable without the network.
  if (host.endsWith("goo.gl") || host.endsWith("g.page") || host.endsWith("g.co")) {
    return { kind: "short" };
  }

  const placeMatch = path.match(/\/maps\/place\/([^/@]+)/);
  const name = placeMatch ? decodeSegment(placeMatch[1]).replace(/_/g, " ") : undefined;

  const cid = params.get("cid") ?? undefined;
  // The id arrives as ?place_id=…, ?query=place_id:… or the classic ?q=place_id:…
  const placeIdParam =
    params.get("place_id") ??
    (params.get("query") || "").match(/place_id:([\w-]+)/)?.[1] ??
    (params.get("q") || "").match(/place_id:([\w-]+)/)?.[1] ??
    undefined;
  const coords = coordPair(url.href);

  if (placeIdParam || cid) {
    return {
      kind: cid ? "cid" : "place",
      ...(name ? { name } : {}),
      ...(placeIdParam ? { placeId: placeIdParam } : {}),
      ...(cid ? { cid } : {}),
      ...(coords ?? {}),
      query: name,
    };
  }
  if (name) {
    return { kind: "place", name, ...(coords ?? {}), query: name };
  }

  const query = params.get("query") ?? params.get("q") ?? "";
  if (query) {
    const asCoords = coordPair(query);
    if (asCoords && !/[a-z]{3,}/i.test(query)) return { kind: "coordinates", ...asCoords, query };
    return { kind: "search", query: decodeSegment(query), ...(coords ?? {}) };
  }
  const ll = params.get("ll") ?? "";
  const llCoords = coordPair(ll);
  if (llCoords) return { kind: "coordinates", ...llCoords, query: ll };
  if (coords) return { kind: "place", ...coords };
  return { kind: "unknown" };
}

/** What a parsed link alone can tell us. No network, no key, no invention. */
export function factsFromLink(parsed: ParsedPlaceLink, raw = ""): PlaceFacts {
  const facts: PlaceFacts = {};
  if (parsed.name) facts.name = parsed.name;
  if (typeof parsed.lat === "number" && typeof parsed.lng === "number") {
    facts.lat = parsed.lat;
    facts.lng = parsed.lng;
  }
  if (parsed.placeId) facts.placeId = parsed.placeId;
  const link = (raw || "").trim();
  if (/^https?:\/\//i.test(link)) {
    facts.gmbUrl = link;
    if (!parsed.name && parsed.query) {
      facts.mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parsed.query)}`;
    } else if (parsed.placeId) {
      facts.mapsUrl = `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${encodeURIComponent(parsed.placeId)}`;
    } else if (parsed.name) {
      facts.mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parsed.name)}`;
    }
  }
  return facts;
}

/* --------------------------- the Places API -------------------------------- */

/** Google returns weekday 0 = Sunday, 1 = Monday … 6 = Saturday. */
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

interface GooglePeriodPoint {
  day?: number;
  hour?: number;
  minute?: number;
}

function clock(hour: number, minute: number): string {
  const h24 = hour % 24;
  const suffix = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

/**
 * Turn Places API opening periods into the shape the hours section already
 * understands. A day Google did not list is "Closed" — that is what a missing
 * period means, and the hours module reads the word.
 */
export function hoursFromPeriods(periods: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(periods) || !periods.length) return out;
  for (const key of DAY_KEYS) out[key] = "Closed";

  for (const period of periods) {
    const open = (period as { open?: GooglePeriodPoint })?.open;
    const close = (period as { close?: GooglePeriodPoint })?.close;
    if (!open || typeof open.day !== "number") continue;
    const key = DAY_KEYS[open.day];
    if (!key) continue;
    const openHour = typeof open.hour === "number" ? open.hour : 0;
    const openMinute = typeof open.minute === "number" ? open.minute : 0;
    // Google expresses "open 24 hours" as a period that closes at 00:00 the
    // same day, which would otherwise read as a zero-length day.
    if (!close || (close.hour === 0 && (close.minute ?? 0) === 0 && close.day === open.day)) {
      out[key] = "24 hours";
      continue;
    }
    const closeHour = typeof close.hour === "number" ? close.hour : 0;
    const closeMinute = typeof close.minute === "number" ? close.minute : 0;
    out[key] = `${clock(openHour, openMinute)} – ${clock(closeHour, closeMinute)}`;
  }
  return out;
}

/** "+91 98765 43210", "098765 43210", "9876543210" → "+919876543210". */
export function cleanPhone(raw: unknown): string {
  const digits = String(raw ?? "").replace(/[^\d+]/g, "");
  const withoutCode = digits.replace(/^\+?91(?=\d{10}$)/, "").replace(/^0(?=\d{10}$)/, "");
  if (/^\+?\d{10}$/.test(withoutCode)) return `+91${withoutCode.replace(/^\+/, "")}`;
  return digits.startsWith("+") ? digits : digits ? `+${digits}` : "";
}

/** A 6-digit Indian pincode, if the address contains exactly one. */
export function pincodeFromAddress(address: string): string | undefined {
  const matches = address.match(/\b\d{6}\b/g);
  return matches && matches.length ? matches[matches.length - 1] : undefined;
}

/**
 * The city, from an address Google formatted as
 * "44, Baner Road, Baner, Pune, Maharashtra 411045, India".
 *
 * Deliberately conservative: the component before the one carrying the pincode,
 * or else the third from the end. When neither is convincing we return nothing —
 * a wrong city on a local business site is worse than an empty field the owner
 * will fill in.
 */
export function cityFromAddress(address: string): string | undefined {
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) return undefined;
  const withPincode = parts.findIndex((p) => /\b\d{6}\b/.test(p));
  if (withPincode > 0) {
    const candidate = parts[withPincode - 1];
    if (candidate && /^[A-Za-z][A-Za-z .'-]{2,}$/.test(candidate)) return candidate;
  }
  const candidate = parts[parts.length - 3];
  return candidate && /^[A-Za-z][A-Za-z .'-]{2,}$/.test(candidate) ? candidate : undefined;
}

interface GooglePlace {
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  types?: string[];
  primaryTypeDisplayName?: { text?: string };
  regularOpeningHours?: { periods?: unknown };
  rating?: number;
  userRatingCount?: number;
  photos?: unknown[];
  reviews?: {
    text?: { text?: string };
    rating?: number;
    relativePublishTimeDescription?: string;
    authorAttribution?: { displayName?: string };
  }[];
  id?: string;
  location?: { latitude?: number; longitude?: number };
}

/** What to ask Places for. Kept explicit so a field mask typo is a test failure. */
export const PLACES_FIELD_MASK = [
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.types",
  "places.primaryTypeDisplayName",
  "places.regularOpeningHours",
  "places.rating",
  "places.userRatingCount",
  "places.photos",
  "places.reviews",
  "places.id",
  "places.location",
].join(",");

/** Map one Places API record into our vocabulary. Pure, so it is unit-testable. */
export function placeFromApi(place: GooglePlace): PlaceFacts {
  const facts: PlaceFacts = {};
  const name = place.displayName?.text?.trim();
  if (name) facts.name = name;
  const address = place.formattedAddress?.trim();
  if (address) {
    facts.address = address;
    const city = cityFromAddress(address);
    if (city) facts.city = city;
    const pincode = pincodeFromAddress(address);
    if (pincode) facts.pincode = pincode;
  }
  const phone = cleanPhone(place.nationalPhoneNumber || place.internationalPhoneNumber || "");
  if (phone) facts.phone = phone;
  if (place.websiteUri) facts.website = place.websiteUri;
  const seenCategories = new Set<string>();
  const categories = [place.primaryTypeDisplayName?.text, ...(place.types ?? [])]
    .filter((c): c is string => typeof c === "string" && c.length > 0 && c !== "point_of_interest" && c !== "establishment")
    // "Dental clinic" as the primary type and "dental_clinic" in the list are
    // the same answer, and a business does not have two of them.
    .filter((c) => {
      const key = c.replace(/_/g, " ").toLowerCase();
      if (seenCategories.has(key)) return false;
      seenCategories.add(key);
      return true;
    })
    .map((c) => c.replace(/_/g, " "))
    .slice(0, 4);
  if (categories.length) facts.categories = categories;
  const hours = hoursFromPeriods(place.regularOpeningHours?.periods);
  if (Object.keys(hours).length) facts.hours = hours;
  if (typeof place.rating === "number") facts.rating = place.rating;
  if (typeof place.userRatingCount === "number") facts.reviewCount = place.userRatingCount;
  if (Array.isArray(place.photos)) facts.photoCount = place.photos.length;
  if (Array.isArray(place.reviews) && place.reviews.length) {
    facts.reviews = place.reviews
      .map((r) => ({
        author: (r.authorAttribution?.displayName || "Google user").trim(),
        text: (r.text?.text || "").trim().slice(0, 600),
        rating: typeof r.rating === "number" ? r.rating : 0,
      }))
      .filter((r) => r.text.length > 20);
  }
  if (place.id) facts.placeId = place.id;
  if (typeof place.location?.latitude === "number" && typeof place.location?.longitude === "number") {
    facts.lat = place.location.latitude;
    facts.lng = place.location.longitude;
  }
  return facts;
}

export interface LookupResult {
  facts: PlaceFacts;
  /** Which source answered, for the "how do you know this?" line. */
  via: "link" | "places-api";
  /** Set when a network lookup was expected but could not happen. */
  note?: string;
  /** True when the answer is partial and the owner should type the rest. */
  partial: boolean;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Look up a business.
 *
 * A pasted link is always read; the API is consulted only when it is configured
 * and the link could not answer on its own (a short link, or a name search).
 */
export async function lookupPlace(
  input: string,
  options: { apiKey?: string; fetchImpl?: FetchLike; timeoutMs?: number } = {},
): Promise<LookupResult> {
  const parsed = parsePlaceLink(input);
  const fromLink = factsFromLink(parsed, input);
  const apiKey = (options.apiKey ?? process.env.GOOGLE_PLACES_API_KEY ?? "").trim();
  const needsApi = parsed.kind === "short" || parsed.kind === "search" || parsed.kind === "cid" || !fromLink.name;
  const searchText = parsed.query || parsed.name || input.trim();

  if (!apiKey) {
    return {
      facts: fromLink,
      via: "link",
      partial: true,
      // Say plainly what is missing and why, rather than presenting a link's
      // worth of information as if it were the whole profile.
      note:
        parsed.kind === "short"
          ? "Short Google links cannot be read without the Places API — paste the full link (it has your name and coordinates in it), or type your business name and city."
          : "The address, opening hours, rating and reviews need a Google Places API key, which this installation does not have. What is below was read from the link itself.",
    };
  }

  if (!needsApi && fromLink.name) {
    // A full link already answered; the extra details are still worth having.
  }

  // The base URL is overridable so an installation behind a proxy — or a test
  // suite — can point the lookup somewhere else without touching this code.
  const base = (process.env.GOOGLE_PLACES_BASE_URL || "https://places.googleapis.com").replace(/\/$/, "");
  const fetchImpl: FetchLike = options.fetchImpl ?? ((url, init) => fetch(url, init));
  try {
    const res = await fetchImpl(`${base}/v1/places:searchText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": PLACES_FIELD_MASK,
      },
      body: JSON.stringify({ textQuery: searchText, maxResultCount: 1, regionCode: "IN", languageCode: "en" }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 8_000),
    });
    if (!res.ok) {
      return {
        facts: fromLink,
        via: "link",
        partial: true,
        note: `Google answered ${res.status}, so only the link was used.`,
      };
    }
    const body = (await res.json()) as { places?: GooglePlace[] };
    const place = body.places?.[0];
    if (!place) {
      return {
        facts: fromLink,
        via: "link",
        partial: true,
        note: "Google did not return a matching business — check the name and city, or type the details in by hand.",
      };
    }
    const facts = { ...fromLink, ...placeFromApi(place) };
    return { facts, via: "places-api", partial: false };
  } catch (e) {
    return {
      facts: fromLink,
      via: "link",
      partial: true,
      note: `Google could not be reached (${e instanceof Error ? e.message : "network error"}), so only the link was used.`,
    };
  }
}

/* ------------------------------ what changes -------------------------------- */

export interface FactOption {
  /** Stable key the client sends back to apply this fact. */
  id: string;
  /** The column it would be written to. */
  field: string;
  label: string;
  /** What the business has now (empty when nothing is set). */
  current: string;
  /** What Google says. */
  next: string;
  source: FactSource;
  /** Human-readable preview, e.g. "Mon 9:00 AM – 7:00 PM". */
  display: string;
}

export interface BusinessSnapshot {
  name: string;
  phone: string;
  address: string;
  city: string;
  pincode: string;
  hoursJson: string;
  mapsUrl: string;
  gmbUrl: string;
  placeId: string;
}

function summarizeHours(hours: Record<string, string>): string {
  const rows = DAY_KEYS.filter((d) => hours[d]).map((d) => `${d[0].toUpperCase()}${d.slice(1, 3)} ${hours[d]}`);
  return rows.length > 4 ? `${rows[0]} … ${rows[rows.length - 1]}` : rows.join(", ");
}

/**
 * The lines the owner will be shown, and only the ones that would actually
 * change something. A fact that matches what is already stored is not an offer.
 */
export function factOptions(facts: PlaceFacts, business: BusinessSnapshot): FactOption[] {
  const options: FactOption[] = [];
  const add = (id: string, field: string, label: string, next: string, current: string, display?: string, source: FactSource = "google") => {
    if (!next || next.trim() === (current || "").trim()) return;
    options.push({ id, field, label, current: current || "", next, source, display: display ?? next });
  };

  add("name", "name", "Business name", facts.name ?? "", business.name);
  add("phone", "phone", "Phone number", facts.phone ?? "", business.phone);
  add("address", "address", "Address", facts.address ?? "", business.address);
  add("city", "city", "City", facts.city ?? "", business.city);
  add("pincode", "pincode", "Pincode", facts.pincode ?? "", business.pincode);

  if (facts.hours && Object.keys(facts.hours).length) {
    const next = JSON.stringify(facts.hours);
    add("hours", "hoursJson", "Opening hours", next, business.hoursJson, summarizeHours(facts.hours));
  }
  if (facts.mapsUrl) add("mapsUrl", "mapsUrl", "Directions link", facts.mapsUrl, business.mapsUrl, "Google Maps directions", "link");
  if (facts.gmbUrl) add("gmbUrl", "gmbUrl", "Google profile link", facts.gmbUrl, business.gmbUrl, facts.gmbUrl, "link");
  if (facts.placeId) add("placeId", "placeId", "Google place id", facts.placeId, business.placeId);

  return options;
}

/** Columns that carry a plain string and may be written straight from a fact. */
const WRITABLE = new Set(["name", "phone", "address", "city", "pincode", "hoursJson", "mapsUrl", "gmbUrl", "placeId"]);

/**
 * The update to store, from the fields the owner ticked.
 *
 * Field names arrive from the client, so they are checked against the list
 * above: a request cannot write to a column that is not in it, whatever it
 * sends.
 */
export function patchFromOptions(options: FactOption[], chosen: string[]): Record<string, string> {
  const wanted = new Set(chosen);
  const patch: Record<string, string> = {};
  for (const option of options) {
    if (!wanted.has(option.id)) continue;
    if (!WRITABLE.has(option.field)) continue;
    patch[option.field] = option.next;
  }
  return patch;
}

/** Record the provenance of what was just written. */
export function tagFacts(
  existing: Facts,
  facts: PlaceFacts,
  written: Record<string, string>,
  source: FactSource,
  at = new Date().toISOString(),
): Facts {
  const next: Facts = { ...existing };
  for (const [field, value] of Object.entries(written)) {
    next[field] = { value, source, at };
  }
  // The rating and review count are worth keeping even though they are not
  // columns of their own: the dashboard shows them beside the profile link.
  if (typeof facts.rating === "number") next.rating = { value: String(facts.rating), source, at };
  if (typeof facts.reviewCount === "number") next.reviews = { value: String(facts.reviewCount), source, at };
  return next;
}

/** Where a stored fact came from, for the badge beside the field. */
export function sourceOf(facts: Facts, field: string): FactSource | null {
  return facts[field]?.source ?? null;
}

/** Reviews worth offering to the testimonials section, newest first. */
export function reviewRows(facts: PlaceFacts): { author: string; text: string; rating: number }[] {
  return (facts.reviews ?? [])
    .filter((r) => r.text.trim().length > 20)
    .slice(0, 10)
    .map((r) => ({ author: r.author, text: r.text, rating: r.rating }));
}

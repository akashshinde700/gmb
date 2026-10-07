// WebSetu — bring an owner's existing website across.
//
// The owner already has a website. It says what they do, where they are, what
// they charge and what they sound like — and none of that should have to be
// retyped into a wizard. This module fetches that page and reads it, the way a
// careful person would: whatever is actually written there, tagged with where
// it came from, and a plain statement of what was *not* found.
//
// Two rules hold everywhere below.
//
//   1. Never invent. Every value returned here was present in the page's own
//      markup — JSON-LD, meta tags, links or visible text. Where a page hides
//      its phone number behind a script, the answer is "not found", not a
//      guess. There is no model anywhere in this file.
//   2. Never copy the design. We take the content and leave the layout: the
//      point of WebSetu is that the new site does not look like the old one,
//      and does not look like the eleven other plumbers in the same city.
//
// The page is fetched from the server, on a URL the owner typed, which makes
// this the one place in the codebase where a user can steer our outbound
// requests. `assertPublicHost` is therefore not optional.

import { dnsLookup, type LookupAddress } from "@/lib/net";
import type { BusinessSnapshot, FactOption, Facts, FactSource } from "@/lib/places";

/** Columns a website import is allowed to write. */
const WRITABLE = new Set([
  "name", "tagline", "description", "phone", "whatsapp", "email",
  "address", "city", "state", "pincode", "hoursJson", "logoUrl", "coverUrl",
]);

const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 3;
const MAX_IMAGES = 12;
const MAX_SERVICES = 12;
const MAX_FAQS = 12;

const USER_AGENT =
  "Mozilla/5.0 (compatible; WebSetuBot/1.0; +https://websetu.in/bot) AppleWebKit/537.36 Chrome/120 Safari/537.36";

export interface ImportedImage {
  url: string;
  alt: string;
}

export interface ImportedService {
  name: string;
  description: string;
}

export interface ImportedFaq {
  question: string;
  answer: string;
}

export interface WebsiteImport {
  /** The URL that actually answered, after redirects. */
  url: string;
  title: string;
  name: string | null;
  tagline: string | null;
  description: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  hours: Record<string, string>;
  logoUrl: string | null;
  coverUrl: string | null;
  images: ImportedImage[];
  services: ImportedService[];
  faqs: ImportedFaq[];
  social: string[];
  /** Which parts of the page answered: "JSON-LD", "meta tags", "the page itself". */
  via: string[];
  /** What was looked for and is not on the page — said out loud, never filled in. */
  missing: string[];
}

/* -------------------------------------------------------------------------- */
/*  the URL                                                                    */
/* -------------------------------------------------------------------------- */

export interface ParsedSiteUrl {
  url: string;
  host: string;
  kind: "website";
}

/**
 * Read a URL out of whatever the owner pasted: a bare domain, a full link, a
 * link with tracking junk on it. Anything that is not http(s) is refused rather
 * than coerced.
 */
export function parseSiteUrl(input: string): ParsedSiteUrl {
  const raw = input.trim().replace(/\s+/g, "");
  if (!raw) throw new Error("Paste the address of your current website");

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new Error("That does not look like a website address");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https links can be read");
  }
  if (!url.hostname.includes(".") || url.hostname.endsWith(".")) {
    throw new Error("That address is missing a domain name");
  }
  // Tracking parameters are stripped so the same page is one page.
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid|ref|source)/i.test(key)) url.searchParams.delete(key);
  }
  url.hash = "";
  return { url: url.toString(), host: url.hostname, kind: "website" };
}

const PRIVATE_V4 = [
  /^0\./, /^10\./, /^127\./, /^169\.254\./, /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

function isPrivateAddress(address: string, family: number): boolean {
  if (family === 6) {
    const value = address.toLowerCase();
    if (value === "::" || value === "::1") return true;
    if (value.startsWith("fe80") || value.startsWith("fc") || value.startsWith("fd")) return true;
    // ::ffff:127.0.0.1 and friends
    const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return PRIVATE_V4.some((re) => re.test(mapped[1]));
    return false;
  }
  return PRIVATE_V4.some((re) => re.test(address));
}

/**
 * Refuse to fetch anything that points back inside the network.
 *
 * The owner types a URL, our server fetches it: without this, "http://
 * 192.168.1.1/admin" would be a way to read our own infrastructure through the
 * importer. Look-alike hostnames resolve first and are checked as addresses, so
 * "localhost.example.com" pointing at 127.0.0.1 is caught too.
 */
export async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("That address is on a private network");
  }
  // The dev server has to be able to read a page off the machine it runs on;
  // production never does. NODE_ENV is "production" for every real deployment.
  if (process.env.NODE_ENV !== "production" && (process.env.IMPORT_ALLOW_PRIVATE ?? "") === "1") return;

  let addresses: LookupAddress[];
  try {
    addresses = await dnsLookup(host);
  } catch {
    throw new Error("That website could not be reached — check the address");
  }
  if (!addresses.length) throw new Error("That website could not be reached — check the address");
  for (const entry of addresses) {
    if (isPrivateAddress(entry.address, entry.family)) {
      throw new Error("That address is on a private network");
    }
  }
}

/** The fuller of two owner-written strings; either may be missing. */
function richer(a: string | null, b: string | null): string | null {
  const first = (a ?? "").trim();
  const second = (b ?? "").trim();
  if (!first) return second || null;
  if (!second) return first;
  return second.length > first.length ? second : first;
}

/* -------------------------------------------------------------------------- */
/*  the fetch                                                                  */
/* -------------------------------------------------------------------------- */

export interface FetchedPage {
  html: string;
  url: string;
  /** Redirect hops, for the "we followed your link" note. */
  hops: string[];
}

/** Fetch one page, politely: bounded time, bounded size, bounded redirects. */
export async function fetchSite(url: string): Promise<FetchedPage> {
  const hops: string[] = [];
  let current = url;

  for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt++) {
    const target = new URL(current);
    await assertPublicHost(target.hostname);

    let response: Response;
    try {
      response = await fetch(current, {
        redirect: "manual",
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      const name = (error as { name?: string })?.name;
      throw new Error(name === "TimeoutError" ? "That website took too long to answer" : "That website could not be reached");
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("That website redirected us somewhere we could not follow");
      const next = new URL(location, current);
      if (next.protocol !== "http:" && next.protocol !== "https:") throw new Error("That website redirected us somewhere unsafe");
      hops.push(next.toString());
      current = next.toString();
      continue;
    }

    if (!response.ok) {
      throw new Error(
        response.status === 404
          ? "That page does not exist any more (404)"
          : `That website answered with an error (${response.status})`,
      );
    }

    const type = (response.headers.get("content-type") ?? "").toLowerCase();
    if (type && !/text\/html|application\/xhtml|text\/plain|text\/xml/.test(type)) {
      throw new Error("That link is not a web page");
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("That website sent nothing back");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        size += value.byteLength;
        if (size > MAX_BYTES) {
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
    }
    const html = new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
    return { html, url: current, hops };
  }

  throw new Error("That website redirected in a loop");
}

/* -------------------------------------------------------------------------- */
/*  reading the page                                                           */
/* -------------------------------------------------------------------------- */

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", middot: "·", rupee: "₹",
  copy: "©", reg: "®", trade: "™", deg: "°", times: "×",
};

export function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeChar(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeChar(Number(dec)))
    .replace(/&([a-z]+);/gi, (whole, name) => ENTITIES[String(name).toLowerCase()] ?? whole);
}

function safeChar(code: number): string {
  if (!Number.isFinite(code) || code < 9 || code > 0x10ffff) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

/** Visible text of a fragment: tags out, entities decoded, whitespace folded. */
export function textOf(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function attr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i"));
  if (!match) return null;
  const value = match[2] ?? match[3] ?? match[4] ?? "";
  return decodeEntities(value).trim();
}

/** All `<meta>` tags, keyed by property/name — both spellings, lowercased. */
function metaTags(html: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const tag of html.match(/<meta\s+[^>]*>/gi) ?? []) {
    const key = (attr(tag, "property") ?? attr(tag, "name") ?? attr(tag, "itemprop") ?? "").toLowerCase();
    const content = attr(tag, "content");
    if (key && content && !map.has(key)) map.set(key, content);
  }
  return map;
}

function jsonLdBlocks(html: string): Record<string, unknown>[] {
  const blocks = html.match(
    /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  ) ?? [];
  const nodes: Record<string, unknown>[] = [];
  for (const block of blocks) {
    const body = block.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    // Some sites concatenate two objects, or leave a stray semicolon.
    for (const candidate of splitJson(body)) {
      try {
        for (const node of flattenJsonLd(JSON.parse(candidate))) nodes.push(node);
      } catch {
        // A malformed block is skipped, not guessed at.
      }
    }
  }
  return nodes;
}

function splitJson(body: string): string[] {
  const trimmed = body.replace(/;\s*$/, "").trim();
  if (!trimmed) return [];
  try {
    JSON.parse(trimmed);
    return [trimmed];
  } catch {
    const parts: string[] = [];
    let depth = 0;
    let start = -1;
    let inString = false;
    let escaped = false;
    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === "{" || ch === "[") {
        if (depth === 0) start = i;
        depth++;
      } else if (ch === "}" || ch === "]") {
        depth--;
        if (depth === 0 && start >= 0) {
          parts.push(trimmed.slice(start, i + 1));
          start = -1;
        }
      }
    }
    return parts;
  }
}

function flattenJsonLd(value: unknown, out: Record<string, unknown>[] = [], depth = 0): Record<string, unknown>[] {
  if (depth > 6 || value === null || typeof value !== "object") return out;
  if (Array.isArray(value)) {
    for (const item of value) flattenJsonLd(item, out, depth + 1);
    return out;
  }
  const node = value as Record<string, unknown>;
  out.push(node);
  if (node["@graph"]) flattenJsonLd(node["@graph"], out, depth + 1);
  if (node.mainEntity) flattenJsonLd(node.mainEntity, out, depth + 1);
  return out;
}

function typesOf(node: Record<string, unknown>): string[] {
  const raw = node["@type"];
  if (typeof raw === "string") return [raw.toLowerCase()];
  if (Array.isArray(raw)) return raw.filter((t): t is string => typeof t === "string").map((t) => t.toLowerCase());
  return [];
}

function str(value: unknown): string | null {
  if (typeof value === "string") {
    const text = textOf(value);
    return text || null;
  }
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = str(item);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    const node = value as Record<string, unknown>;
    return str(node.name) ?? str(node.url) ?? str(node["@value"]) ?? str(node.text);
  }
  return null;
}

const DAY_KEY: Record<string, string> = {
  monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday", thursday: "Thursday",
  friday: "Friday", saturday: "Saturday", sunday: "Sunday",
  mon: "Monday", tue: "Tuesday", tues: "Tuesday", wed: "Wednesday", weds: "Wednesday",
  thu: "Thursday", thur: "Thursday", thurs: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday",
};

function dayKey(raw: unknown): string | null {
  const value = String(raw ?? "").split("/").pop() ?? "";
  return DAY_KEY[value.trim().toLowerCase()] ?? null;
}

/** "09:00" → "9:00 AM". Anything unreadable is dropped rather than shown raw. */
function to12Hour(raw: unknown): string | null {
  const text = String(raw ?? "").trim();
  const match = text.match(/^(\d{1,2}):?(\d{2})?$/);
  if (!match) return /am|pm/i.test(text) ? text : null;
  let hour = Number(match[1]);
  const minute = match[2] ?? "00";
  if (hour > 23) return null;
  const suffix = hour >= 12 ? "PM" : "AM";
  if (hour === 0) hour = 12;
  else if (hour > 12) hour -= 12;
  return `${hour}:${minute} ${suffix}`;
}

function hoursFromSpecification(nodes: Record<string, unknown>[]): Record<string, string> {
  const hours: Record<string, string> = {};
  for (const node of nodes) {
    const spec = node.openingHoursSpecification;
    const list = Array.isArray(spec) ? spec : spec ? [spec] : [];
    for (const entry of list) {
      if (!entry || typeof entry !== "object") continue;
      const item = entry as Record<string, unknown>;
      const days = Array.isArray(item.dayOfWeek) ? item.dayOfWeek : [item.dayOfWeek];
      const opens = to12Hour(item.opens);
      const closes = to12Hour(item.closes);
      const value = opens && closes ? `${opens} – ${closes}` : opens ? `From ${opens}` : null;
      if (!value) continue;
      for (const day of days) {
        const key = dayKey(day);
        if (key && !hours[key]) hours[key] = value;
      }
    }
    // The string form: {"openingHours": "Mo-Fr 09:00-18:00"} — only the plain
    // "Mo 09:00-18:00" shape is read; ranges across days are left alone.
    const plain = node.openingHours;
    for (const entry of Array.isArray(plain) ? plain : plain ? [plain] : []) {
      const match = String(entry).match(/^([A-Za-z]{2,3})\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
      if (!match) continue;
      const key = dayKey(match[1]);
      const open = to12Hour(match[2]);
      const close = to12Hour(match[3]);
      if (key && open && close && !hours[key]) hours[key] = `${open} – ${close}`;
    }
  }
  return hours;
}

function addressFrom(node: Record<string, unknown>): { street: string | null; city: string | null; state: string | null; pincode: string | null } {
  const raw = node.address;
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (typeof first === "string") {
    return { street: textOf(first) || null, city: null, state: null, pincode: null };
  }
  if (first && typeof first === "object") {
    const item = first as Record<string, unknown>;
    const street = [str(item.streetAddress), str(item.addressLine1), str(item.addressLine2)]
      .filter(Boolean).join(", ") || null;
    return {
      street,
      city: str(item.addressLocality),
      state: str(item.addressRegion),
      pincode: str(item.postalCode),
    };
  }
  return { street: null, city: null, state: null, pincode: null };
}

/** Image-ish URL, cleaned of srcset descriptors and sized thumbnails we cannot use. */
function imageUrl(raw: string | null, base: string): string | null {
  if (!raw) return null;
  const first = raw.split(",")[0]?.trim().split(/\s+/)[0] ?? "";
  if (!first || first.startsWith("data:") || first.startsWith("blob:")) return null;
  try {
    const url = new URL(first, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (/\.svg(z)?$/i.test(url.pathname)) return null;
    if (/(sprite|placeholder|pixel|spacer|blank|1x1)/i.test(url.pathname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function absoluteLink(raw: string | null, base: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw, base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

const NAV_WORDS = /^(home|menu|about( us)?|contact( us)?|blog|news|gallery|services|products|shop|cart|login|sign ?in|sign ?up|privacy|terms|faq|reviews?|testimonials?|book now|enquire|call( us)?|more|read more|learn more|get a quote|our team|careers?)$/i;

/**
 * Read a business out of one page.
 *
 * Order matters: JSON-LD is what the owner told search engines, so it is
 * believed first; meta tags are what they told social networks; the visible page
 * is the last resort. Nothing is merged across sources for the same field — the
 * first source that has it wins, so a value can always be traced.
 */
export function extractWebsiteImport(html: string, pageUrl: string): WebsiteImport {
  const via = new Set<string>();
  const meta = metaTags(html);
  const nodes = jsonLdBlocks(html);
  const title = textOf((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ?? [])[1] ?? "");

  /* --- the business node ------------------------------------------------ */
  const businessNodes = nodes.filter((node) => {
    const types = typesOf(node);
    if (types.some((t) => /faqpage|breadcrumblist|website|webpage|person|itemlist/.test(t))) return false;
    return Boolean(str(node.name)) && Boolean(node.telephone ?? node.address ?? node.openingHours ?? node.openingHoursSpecification ?? node.email);
  });
  const business = businessNodes[0] ?? null;
  if (business) {
    via.add("the page's structured data");
  }

  const address = business ? addressFrom(business) : { street: null, city: null, state: null, pincode: null };
  const hours = business ? hoursFromSpecification([business]) : {};
  if (Object.keys(hours).length) via.add("structured opening hours");

  let name = business ? str(business.name) : null;
  let description = business ? str(business.description) : null;
  let phone = business ? str(business.telephone) ?? str(business.phone) : null;
  let email = business ? str(business.email) : null;

  /* --- meta tags -------------------------------------------------------- */
  if (meta.size) via.add("the page's meta tags");
  const siteName = meta.get("og:site_name") ?? null;
  name = name ?? siteName ?? meta.get("og:title") ?? null;
  // Both are the owner's own words, so the fuller one wins: a structured-data
  // description is often a three-word label ("Family dental clinic") while the
  // meta description is the sentence they actually wrote for people.
  const metaDescription = meta.get("og:description") ?? meta.get("description") ?? null;
  description = richer(description, metaDescription);

  /* --- the visible page ------------------------------------------------- */
  const h1 = textOf((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ?? [])[1] ?? "");
  name = name ?? (h1 && h1.length <= 80 ? h1 : null) ?? (title ? title.split(/[|–—-]/)[0].trim() : null);

  const telLinks = [...html.matchAll(/href\s*=\s*["']tel:([^"']+)["']/gi)].map((m) => m[1]);
  phone = phone ?? telLinks[0] ?? null;

  const mailLinks = [...html.matchAll(/href\s*=\s*["']mailto:([^"'?]+)/gi)].map((m) => m[1]);
  email = email ?? mailLinks[0] ?? null;

  const whatsappRaw =
    html.match(/https?:\/\/(?:api\.)?wa\.me\/(\d{6,15})/i)?.[1] ??
    html.match(/https?:\/\/(?:web\.)?whatsapp\.com\/send\?phone=(\d{6,15})/i)?.[1] ??
    null;
  const whatsapp = whatsappRaw ? `+${whatsappRaw.replace(/\D/g, "")}` : null;

  if (telLinks.length || mailLinks.length || whatsappRaw) via.add("the contact links on the page");

  /* --- where it is ------------------------------------------------------ */
  let street = address.street;
  const city = address.city;
  const state = address.state;
  let pincode = address.pincode;
  if (!street) {
    const block = html.match(/<address[^>]*>([\s\S]*?)<\/address>/i)?.[1];
    const text = block ? textOf(block) : "";
    if (text && text.length >= 8 && text.length <= 240) street = text;
  }
  if (city || street) via.add("the address on the page");

  const pin = pincode ?? street?.match(/\b(\d{6})\b/)?.[1] ?? null;
  if (!pincode && pin) pincode = pin;

  /* --- words an owner actually wrote ------------------------------------ */
  const paragraphs = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => textOf(m[1]))
    .filter((text) => text.length >= 70 && text.length <= 400 && !/cookie|subscribe|©|all rights reserved/i.test(text));
  const about = description ?? paragraphs.sort((a, b) => b.length - a.length)[0] ?? null;
  const tagline = meta.get("og:title") && h1 && meta.get("og:title") !== h1 ? meta.get("og:title") : null;

  /* --- services: structured first, then the page's own headings ---------- */
  const services: ImportedService[] = [];
  const seenServices = new Set<string>();
  const addService = (rawName: string | null, rawDescription: string | null) => {
    if (!rawName) return;
    const clean = rawName.replace(/\s+/g, " ").replace(/[.:;,–—-]+$/, "").trim();
    if (clean.length < 3 || clean.length > 70) return;
    if (NAV_WORDS.test(clean)) return;
    const key = clean.toLowerCase();
    if (seenServices.has(key) || services.length >= MAX_SERVICES) return;
    seenServices.add(key);
    services.push({ name: clean, description: (rawDescription ?? "").slice(0, 200) });
  };
  for (const node of nodes) {
    const types = typesOf(node);
    if (!types.some((t) => /^(service|offer|individualproduct)$/.test(t))) continue;
    addService(str(node.name) ?? str(node.serviceType), str(node.description));
  }
  for (const node of nodes) {
    const catalog = node.hasOfferCatalog ?? node.itemListElement;
    const entries = Array.isArray(catalog) ? catalog : catalog ? [catalog] : [];
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;
      const item = entry as Record<string, unknown>;
      addService(str(item.name) ?? str(item.item), str(item.description));
    }
  }
  for (const match of html.matchAll(/<(h2|h3|h4)[^>]*>([\s\S]*?)<\/\1>/gi)) {
    addService(textOf(match[2]), null);
  }
  if (services.length) via.add("the service names on the page");

  /* --- questions the page already answers -------------------------------- */
  const faqs: ImportedFaq[] = [];
  for (const node of nodes) {
    if (!typesOf(node).some((t) => t === "faqpage")) continue;
    const entities = Array.isArray(node.mainEntity) ? node.mainEntity : node.mainEntity ? [node.mainEntity] : [];
    for (const entity of entities) {
      if (!entity || typeof entity !== "object") continue;
      const item = entity as Record<string, unknown>;
      const question = str(item.name);
      const answer = str(item.acceptedAnswer) ?? str(item.text);
      if (question && answer && faqs.length < MAX_FAQS) faqs.push({ question: question.slice(0, 200), answer: answer.slice(0, 600) });
    }
  }
  if (faqs.length) via.add("the FAQ on the page");

  /* --- pictures the owner owns ------------------------------------------ */
  const images: ImportedImage[] = [];
  const seenImages = new Set<string>();
  const imageKey = (url: string) => {
    // The same photo is often served twice — a thumbnail path and a full path.
    // Keying on the file name as well keeps the gallery from filling with the
    // same picture at two sizes.
    const name = url.split("?")[0].split("/").pop() ?? url;
    return name.toLowerCase();
  };
  const addImage = (rawSrc: string | null, alt: string): string | null => {
    const url = imageUrl(rawSrc, pageUrl);
    if (!url) return null;
    const key = imageKey(url);
    if (seenImages.has(url) || seenImages.has(key) || images.length >= MAX_IMAGES) return null;
    seenImages.add(url);
    seenImages.add(key);
    images.push({ url, alt: alt.slice(0, 160) });
    return url;
  };
  const cover = imageUrl(meta.get("og:image") ?? null, pageUrl);
  if (cover) addImage(cover, name ?? "");

  // The logo is the one image that has a home of its own, so it is taken out of
  // the photo run rather than repeated in the gallery.
  let logoCandidate: string | null = imageUrl(meta.get("og:logo") ?? null, pageUrl);
  const headerLogo = html.match(/<img[^>]+(?:class|id)\s*=\s*["'][^"']*logo[^"']*["'][^>]*>/i)?.[0];
  if (!logoCandidate && headerLogo) logoCandidate = imageUrl(attr(headerLogo, "src") ?? attr(headerLogo, "data-src"), pageUrl);

  for (const tag of html.match(/<img\s+[^>]*>/gi) ?? []) {
    const className = (attr(tag, "class") ?? "").toLowerCase();
    const alt = attr(tag, "alt") ?? "";
    const src = attr(tag, "srcset") ? (attr(tag, "srcset") ?? "").split(",").pop()?.trim().split(/\s+/)[0] ?? null : attr(tag, "src") ?? attr(tag, "data-src") ?? attr(tag, "data-lazy-src");
    const raw = src ?? attr(tag, "src") ?? attr(tag, "data-src") ?? attr(tag, "data-lazy-src");
    if (/icon|sprite|badge|payment|social|whatsapp-?icon|trust|logo|brand/.test(className) || /logo|brand/i.test(alt)) {
      logoCandidate = logoCandidate ?? imageUrl(raw, pageUrl);
      continue;
    }
    if (/icon|sprite|badge|payment|social|whatsapp-?icon|trust/.test(className)) continue;
    addImage(raw, alt);
  }
  if (images.length) via.add("the photos on the page");

  const logo =
    imageUrl(business ? str(business.logo) : null, pageUrl) ??
    logoCandidate ??
    imageUrl(attr(html.match(/<link[^>]+rel\s*=\s*["']apple-touch-icon[^"']*["'][^>]*>/i)?.[0] ?? "", "href"), pageUrl);

  const social = (business ? (Array.isArray(business.sameAs) ? business.sameAs : [business.sameAs]) : [])
    // sameAs entries are sometimes a bare handle ("not-a-link"); resolving that
    // against the page would invent a profile that does not exist.
    .filter((entry) => /^https?:\/\//i.test(typeof entry === "string" ? entry.trim() : ""))
    .map((entry) => absoluteLink(str(entry), pageUrl))
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, 6);

  const missing: string[] = [];
  if (!phone) missing.push("phone number");
  if (!email) missing.push("email address");
  if (!street && !city) missing.push("address");
  if (!Object.keys(hours).length) missing.push("opening hours");
  if (!services.length) missing.push("service list");
  if (!images.length) missing.push("photos");

  return {
    url: pageUrl,
    title,
    name,
    tagline: tagline ?? null,
    description: about,
    phone,
    whatsapp,
    email,
    address: street,
    city,
    state,
    pincode,
    hours,
    logoUrl: logo,
    coverUrl: cover,
    images,
    services,
    faqs,
    social,
    via: [...via],
    missing,
  };
}

/* -------------------------------------------------------------------------- */
/*  applying it                                                               */
/* -------------------------------------------------------------------------- */

/** Human phone shape is not our business here — the answers route cleans it. */
function cleanImportedPhone(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  const normalised = digits.startsWith("+") ? digits : digits.length === 10 ? `+91${digits}` : `+${digits}`;
  return /^[+]\d{10,14}$/.test(normalised) ? normalised : null;
}

export function websiteImportOptions(imported: WebsiteImport, business: BusinessSnapshot & {
  tagline?: string; description?: string; email?: string; whatsapp?: string; logoUrl?: string; coverUrl?: string;
  state?: string;
}): FactOption[] {
  const options: FactOption[] = [];
  const add = (id: string, field: string, label: string, next: string | null, current: string, display?: string) => {
    if (!next || !next.trim() || next.trim() === (current ?? "").trim()) return;
    options.push({
      id, field, label, current: current ?? "", next: next.trim(),
      source: "website" as FactSource, display: display ?? next.trim(),
    });
  };

  add("name", "name", "Business name", imported.name, business.name);
  add("tagline", "tagline", "Tagline", imported.tagline, business.tagline ?? "");
  add("description", "description", "About your business", imported.description, business.description ?? "",
    imported.description ? `${imported.description.slice(0, 90)}${imported.description.length > 90 ? "…" : ""}` : "");
  add("phone", "phone", "Phone", cleanImportedPhone(imported.phone), business.phone);
  add("whatsapp", "whatsapp", "WhatsApp", cleanImportedPhone(imported.whatsapp), business.whatsapp ?? "");
  add("email", "email", "Email", imported.email, business.email ?? "");
  add("address", "address", "Address", imported.address, business.address);
  add("city", "city", "City", imported.city, business.city);
  add("state", "state", "State", imported.state, business.state ?? "");
  add("pincode", "pincode", "PIN code", imported.pincode, business.pincode);
  add("logoUrl", "logoUrl", "Logo", imported.logoUrl, business.logoUrl ?? "");
  add("coverUrl", "coverUrl", "Cover photo", imported.coverUrl, business.coverUrl ?? "");

  const hourCount = Object.keys(imported.hours).length;
  if (hourCount) {
    options.push({
      id: "hours", field: "hoursJson", label: "Opening hours", current: "",
      next: JSON.stringify(imported.hours),
      source: "website" as FactSource,
      display: Object.entries(imported.hours).map(([day, value]) => `${day.slice(0, 3)} ${value}`).join(" · "),
    });
  }
  return options;
}

/** The update to store, from the lines the owner ticked. */
export function websitePatchFromOptions(options: FactOption[], chosen: string[]): Record<string, string> {
  const wanted = new Set(chosen);
  const patch: Record<string, string> = {};
  for (const option of options) {
    if (!wanted.has(option.id)) continue;
    if (!WRITABLE.has(option.field)) continue;
    patch[option.field] = option.next;
  }
  return patch;
}

/** Provenance for the columns this import wrote. */
export function tagImportedFacts(existing: Facts, imported: WebsiteImport, written: Record<string, string>): Facts {
  const at = new Date().toISOString();
  const next: Facts = { ...existing };
  for (const field of Object.keys(written)) {
    const value = field === "hoursJson" ? `${Object.keys(imported.hours).length} days of hours` : written[field];
    next[field] = { value: String(value).slice(0, 200), source: "website" as FactSource, at };
  }
  return next;
}

/** A short, checkable list of what the page gave us. */
export function websiteImportSummary(imported: WebsiteImport): string[] {
  const lines: string[] = [];
  if (imported.via.length) lines.push(`Read ${imported.via.join(", ")}`);
  if (imported.services.length) lines.push(`${imported.services.length} services`);
  if (imported.faqs.length) lines.push(`${imported.faqs.length} questions already answered`);
  if (imported.images.length) lines.push(`${imported.images.length} photos`);
  return lines;
}

export type { LookupAddress };

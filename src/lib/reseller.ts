// WebSetu — reseller (white-label) brands and API keys.
//
// Two promises live here, and both are enforced in code rather than in a
// setting somewhere:
//
//   1. A reseller's customer never sees the platform's name. The brand is
//      resolved from the hostname the request arrived on, so the same code
//      serves the platform's own domain and an agency's branded domain without
//      either page knowing which one it is rendering for.
//   2. An API key is a key, not a password: the caller gets it once, the
//      database keeps only a hash, and a revoked key stops working on the next
//      call — no cache to wait out.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/api";
import { normalizeHost } from "@/lib/domains";

/** Shown once, at creation. The prefix is a brand, not a secret. */
const KEY_PREFIX = "wsk";
const KEY_BODY_BYTES = 24;

export interface Brand {
  /** What the visitor sees. Always non-empty: the platform's name is the fallback. */
  name: string;
  logoUrl: string;
  supportEmail: string;
  /** Empty when the reseller has no colour of their own. */
  primaryColor: string;
  /** The reseller's own domain; empty for the platform. */
  hostname: string;
  /** True when this brand belongs to a reseller rather than the platform. */
  whiteLabel: boolean;
}

export const PLATFORM_BRAND: Brand = {
  name: "WebSetu",
  logoUrl: "",
  supportEmail: "",
  primaryColor: "",
  hostname: "",
  whiteLabel: false,
};

/** A new plaintext key. Only the caller of this ever sees it. */
export function createApiKey(): { key: string; hash: string; prefix: string } {
  const key = `${KEY_PREFIX}_${randomBytes(KEY_BODY_BYTES).toString("base64url")}`;
  return { key, hash: hashApiKey(key), prefix: key.slice(0, 12) };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key.trim()).digest("hex");
}

/** Is this shaped like one of our keys at all? Cheap gate before a database hit. */
export function looksLikeApiKey(value: unknown): value is string {
  return typeof value === "string" && /^wsk_[A-Za-z0-9_-]{20,80}$/.test(value.trim());
}

/** Constant-time compare, so a row's hash cannot be probed a byte at a time. */
export function hashMatches(candidateHash: string, storedHash: string): boolean {
  const a = Buffer.from(candidateHash, "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

/**
 * Which brand this hostname belongs to.
 *
 * Never throws and never returns an empty name: a database blip on the landing
 * page must show the platform's own brand, not a blank header. Hostnames are
 * normalised the same way the customer-domain lookup normalises them, so
 * "App.TheAgency.com" and "app.theagency.com" cannot resolve differently.
 */
/**
 * Per-request memo for {@link readBrand}.
 *
 * The layout (metadata), the page and the platform theme all need to know the
 * brand for the same host on the same request. React's cache scopes this to the
 * request, so that is one database read rather than four.
 */
export const brandForHost = cache((host: string | null | undefined) => readBrand(host));

export async function readBrand(host: string | null | undefined): Promise<Brand> {
  const hostname = normalizeHost(host);
  if (!hostname) return PLATFORM_BRAND;
  try {
    const reseller = await db.reseller.findFirst({
      where: { hostname },
      select: { brandName: true, logoUrl: true, supportEmail: true, primaryColor: true, hostname: true },
    });
    if (!reseller) return PLATFORM_BRAND;
    return {
      name: reseller.brandName.trim() || PLATFORM_BRAND.name,
      logoUrl: reseller.logoUrl.trim(),
      supportEmail: reseller.supportEmail.trim(),
      primaryColor: /^#[0-9a-f]{6}$/i.test(reseller.primaryColor) ? reseller.primaryColor.toLowerCase() : "",
      hostname: reseller.hostname,
      whiteLabel: true,
    };
  } catch {
    return PLATFORM_BRAND;
  }
}

/** The brand for a business, which is its reseller's when it has one. */
export async function brandForBusiness(resellerId: string | null | undefined): Promise<Brand> {
  if (!resellerId) return PLATFORM_BRAND;
  try {
    const reseller = await db.reseller.findUnique({
      where: { id: resellerId },
      select: { brandName: true, logoUrl: true, supportEmail: true, primaryColor: true, hostname: true },
    });
    if (!reseller) return PLATFORM_BRAND;
    return {
      name: reseller.brandName.trim() || PLATFORM_BRAND.name,
      logoUrl: reseller.logoUrl.trim(),
      supportEmail: reseller.supportEmail.trim(),
      primaryColor: /^#[0-9a-f]{6}$/i.test(reseller.primaryColor) ? reseller.primaryColor.toLowerCase() : "",
      hostname: reseller.hostname,
      whiteLabel: true,
    };
  } catch {
    return PLATFORM_BRAND;
  }
}

/** Fields a reseller may set, with the shape the API will accept. */
export interface BrandInput {
  brandName?: string;
  logoUrl?: string;
  supportEmail?: string;
  primaryColor?: string;
  hostname?: string;
}

export function cleanBrandInput(input: BrandInput): Partial<Record<keyof BrandInput, string>> {
  const out: Partial<Record<keyof BrandInput, string>> = {};
  if (typeof input.brandName === "string") out.brandName = input.brandName.trim().slice(0, 60);
  if (typeof input.logoUrl === "string") {
    const url = input.logoUrl.trim();
    out.logoUrl = /^https?:\/\/\S+$/.test(url) ? url.slice(0, 300) : "";
  }
  if (typeof input.supportEmail === "string") {
    const email = input.supportEmail.trim().toLowerCase();
    out.supportEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.slice(0, 200) : "";
  }
  if (typeof input.primaryColor === "string") {
    const colour = input.primaryColor.trim();
    out.primaryColor = /^#[0-9a-f]{6}$/i.test(colour) ? colour.toLowerCase() : "";
  }
  if (typeof input.hostname === "string") {
    // The field is filled by pasting the domain out of a browser bar as often as
    // it is typed, so accept a whole URL and keep its host. normalizeHost itself
    // deliberately only sanitises a Host header — it does not strip a scheme.
    const raw = normalizeHost(
      input.hostname.trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/\/.*$/, ""),
    ).replace(/^www\./, "");
    out.hostname = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(raw) ? raw : "";
  }
  return out;
}

/** One site as the API and the reseller's own dashboard report it. */
export interface ResellerSite {
  slug: string;
  name: string;
  status: string;
  url: string;
  editUrl: string;
  apiRef: string;
  createdAt: string;
  leads: number;
}

/** Where a business's website actually lives, on the platform or its own domain. */
export function siteUrls(slug: string, primaryHost?: string | null, origin = "https://app.websetu.in") {
  const host = (primaryHost || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const base = host ? `https://${host}` : `${origin.replace(/\/$/, "")}/s/${slug}`;
  return { url: base, editUrl: `${origin.replace(/\/$/, "")}/dashboard` };
}

/**
 * The profile an API caller sends to have a site built.
 *
 * Validated the same way the wizard's own fields are: what the caller does not
 * state stays empty and is filled by the owner later, never invented here.
 */
export interface SiteRequest {
  name: string;
  category: string;
  /** The caller's own id for this site. Empty means "no idempotency". */
  apiRef: string;
  city?: string;
  phone?: string;
  address?: string;
  description?: string;
  ownerName?: string;
  ownerEmail?: string;
  publish: boolean;
}

export function readSiteRequest(body: Record<string, unknown>): SiteRequest {
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  return {
    name: str(body.name, 120),
    category: str(body.category, 80),
    city: str(body.city, 80),
    phone: str(body.phone, 25),
    address: str(body.address, 300),
    description: str(body.description, 2000),
    ownerName: str(body.ownerName, 120),
    ownerEmail: str(body.ownerEmail, 200).toLowerCase(),
    apiRef: str(body.apiRef, 80),
    publish: body.publish !== false,
  };
}

/** What is missing for a site to be buildable — reported, never guessed at. */
export function siteRequestProblems(input: SiteRequest): string[] {
  const problems: string[] = [];
  if (!input.name) problems.push("name");
  if (!input.category) problems.push("category");
  if (input.ownerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.ownerEmail)) problems.push("ownerEmail");
  if (input.phone && !/^[+\d][\d\s-]{6,19}$/.test(input.phone)) problems.push("phone");
  return problems;
}

/** An account email for a client site the caller did not name an owner for. */
export function generatedOwnerEmail(slug: string, hostname: string): string {
  const domain = normalizeHost(hostname).replace(/^www\./, "") || "clients.websetu.in";
  return `${slug}@${domain}`;
}

/**
 * The reseller a request's API key belongs to.
 *
 * Throws 401 for a missing, malformed, unknown or revoked key — and 401 rather
 * than 403 on purpose: from the caller's side, a revoked key and a wrong key
 * are the same situation, and telling them apart tells an attacker which one
 * they hold. The last-used stamp is written without being awaited, so a slow
 * database never slows down a site creation.
 */
export async function requireApiKey(req: Request): Promise<{ resellerId: string; keyId: string; hostname: string }> {
  const header = req.headers.get("authorization") || "";
  const raw = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!looksLikeApiKey(raw)) throw new HttpError("Missing or malformed API key", 401);

  const row = await db.apiKey.findUnique({
    where: { hash: hashApiKey(raw) },
    select: {
      id: true, revokedAt: true, resellerId: true,
      reseller: { select: { hostname: true } },
    },
  });
  if (!row || row.revokedAt) throw new HttpError("This API key is not valid", 401);

  void db.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return { resellerId: row.resellerId, keyId: row.id, hostname: row.reseller?.hostname ?? "" };
}

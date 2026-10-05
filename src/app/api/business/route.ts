import { db } from "@/lib/db";
import { serializeBusiness } from "@/lib/serialize";
import { HttpError, isEmail, ok, readJson, requireBusiness, requireUser, route, safeUrl, str } from "@/lib/api";
import { consumeThemeChange } from "@/lib/appearance";

/** Plain text fields with their max lengths. */
const TEXT_FIELDS: [string, number][] = [
  ["name", 150], ["tagline", 200], ["description", 4000], ["ownerName", 120],
  ["phone", 20], ["whatsapp", 20], ["email", 200], ["address", 300],
  ["city", 100], ["state", 100], ["pincode", 10], ["establishedYear", 4],
  ["gstin", 20], ["brandPrimary", 20], ["brandSecondary", 20], ["brandAccent", 20],
  ["templateId", 60], ["placeId", 200], ["upiId", 100],
];

/** URL-ish fields — sanitized so a stored "javascript:" value can never render. */
const URL_FIELDS = ["logoUrl", "coverUrl", "gmbUrl", "mapsUrl", "paymentQrUrl"];

const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;

export const GET = route(async (req: Request) => {
  const session = await requireUser(req);
  const business = await requireBusiness(session);
  return ok(serializeBusiness(business));
});

export const PUT = route(async (req: Request) => {
  const session = await requireUser(req);
  const business = await requireBusiness(session);

  const body = await readJson<Record<string, unknown>>(req);
  const data: Record<string, string> = {};

  for (const [field, max] of TEXT_FIELDS) {
    if (body[field] === undefined) continue;
    data[field] = str(body[field], max);
  }
  for (const field of URL_FIELDS) {
    if (body[field] === undefined) continue;
    // Legacy rows may still hold large data: URLs, so the cap stays generous.
    data[field] = safeUrl(body[field], 2_600_000);
  }

  if (data.name !== undefined && !data.name) throw new HttpError("Business name cannot be empty");
  if (data.address !== undefined && data.address.length < 5) throw new HttpError("Business address is required");
  if (data.city !== undefined && !data.city) throw new HttpError("City is required");
  if (data.email && !isEmail(data.email)) throw new HttpError("Please enter a valid email address");
  if (data.phone && !/^[+\d][\d\s-]{6,19}$/.test(data.phone)) {
    throw new HttpError("Please enter a valid phone number");
  }
  if (data.whatsapp && !/^[+\d][\d\s-]{6,19}$/.test(data.whatsapp)) {
    throw new HttpError("Please enter a valid WhatsApp number");
  }
  if (data.pincode && !/^\d{4,10}$/.test(data.pincode)) throw new HttpError("Please enter a valid pincode");
  if (data.establishedYear && !/^\d{4}$/.test(data.establishedYear)) {
    throw new HttpError("Established year must be a 4-digit year");
  }
  for (const key of ["brandPrimary", "brandSecondary", "brandAccent"]) {
    if (data[key] && !HEX_COLOR.test(data[key])) throw new HttpError("Brand colours must be hex values like #059669");
  }

  if (body.hours !== undefined) {
    if (typeof body.hours !== "object" || body.hours === null) throw new HttpError("Invalid business hours");
    data.hoursJson = JSON.stringify(body.hours).slice(0, 4000);
  }
  if (body.socials !== undefined) {
    if (typeof body.socials !== "object" || body.socials === null) throw new HttpError("Invalid social links");
    data.socialsJson = JSON.stringify(body.socials).slice(0, 4000);
  }

  if (!Object.keys(data).length) throw new HttpError("Nothing to update");

  // Brand colours are appearance too, so they draw on the same allowance —
  // otherwise the limit could be walked around by restyling from this endpoint.
  const BRAND_KEYS = ["brandPrimary", "brandSecondary", "brandAccent"] as const;
  const brandChanged = BRAND_KEYS.some(
    (key) => data[key] !== undefined && data[key] !== (business as Record<string, unknown>)[key],
  );
  if (brandChanged) await consumeThemeChange(business.id);

  const updated = await db.business.update({ where: { id: business.id }, data });
  return ok(serializeBusiness(updated));
});

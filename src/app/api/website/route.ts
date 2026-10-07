import { db } from "@/lib/db";
import { serializeWebsite } from "@/lib/serialize";
import { parseJson, SECTION_LIBRARY } from "@/lib/sections";
import type { SiteSection, SiteTheme } from "@/lib/types";
import { HttpError, ok, readJson, requireBusiness, requireUser, route, safeUrl, str } from "@/lib/api";
import { allowanceFor, consumeThemeChange } from "@/lib/appearance";
import { INDUSTRY_KEYS } from "@/lib/industries";

const SECTION_TYPES = new Set(SECTION_LIBRARY.map((s) => s.type as string));
const MAX_SECTIONS = 40;
const MAX_SECTIONS_JSON = 400_000;

/**
 * Values the Theme panel may set. The Design DNA keys (shadow, spacing, header,
 * footer, image treatment) are accepted so the dashboard can offer them, but
 * `motion`, `dna`, `quality` and `uniqueness` are deliberately absent: those are
 * written by the generator and the checker, and a client-supplied value for them
 * would let a customer's browser claim a uniqueness score or an animation it
 * never had.
 */
type ThemeKey = Exclude<keyof SiteTheme, "motion" | "dna" | "quality" | "uniqueness">;

const THEME_VALUES: Record<ThemeKey, string[]> = {
  font: ["modern", "classic", "elegant"],
  radius: ["sharp", "rounded", "pill"],
  heroStyle: ["image", "gradient", "split"],
  cardStyle: ["flat", "shadow", "outline"],
  containerWidth: ["normal", "wide"],
  motif: ["auto", "none"],
  industry: [...INDUSTRY_KEYS],
  shadow: ["none", "soft", "lifted", "dramatic"],
  button: ["solid", "outline", "soft", "gradient", "square"],
  spacing: ["tight", "normal", "airy"],
  header: ["sticky", "minimal", "topbar", "centred"],
  footer: ["columned", "compact", "statement"],
  imageTreatment: ["plain", "duotone", "framed", "soft-focus"],
};

export const GET = route(async (req: Request) => {
  const session = await requireUser(req);
  const business = await requireBusiness(session);
  if (!business.website) throw new HttpError("Website not found", 404);
  return ok(serializeWebsite(business.website));
});

export const PUT = route(async (req: Request) => {
  const session = await requireUser(req);
  const business = await requireBusiness(session);
  if (!business.website) throw new HttpError("Website not found", 404);

  const body = await readJson<{
    sections?: SiteSection[]; theme?: Partial<SiteTheme>;
    seoTitle?: string; seoDescription?: string; keywords?: string; ogImage?: string;
  }>(req);

  const data: Record<string, unknown> = {};

  if (body.sections !== undefined) {
    if (!Array.isArray(body.sections)) throw new HttpError("Sections must be a list");
    if (body.sections.length > MAX_SECTIONS) throw new HttpError(`A page can hold at most ${MAX_SECTIONS} sections`);

    // Unknown section types used to be stored happily and then render as a blank
    // gap on the published site.
    const clean = body.sections
      .filter((s) => s && typeof s.type === "string" && SECTION_TYPES.has(s.type))
      .map((s) => ({
        id: str(s.id, 40) || `s_${Math.random().toString(36).slice(2, 10)}`,
        type: s.type,
        visible: s.visible !== false,
        content: typeof s.content === "object" && s.content !== null && !Array.isArray(s.content) ? s.content : {},
      }));
    if (!clean.length && body.sections.length) throw new HttpError("None of the sections were recognised");

    const json = JSON.stringify(clean);
    if (json.length > MAX_SECTIONS_JSON) throw new HttpError("This page is too large to save — remove some content");
    data.sectionsJson = json;
    data.version = { increment: 1 };
  }

  if (body.theme !== undefined) {
    if (typeof body.theme !== "object" || body.theme === null) throw new HttpError("Invalid theme");
    // Merge onto what is stored: a partial theme payload must not silently
    // reset the settings it does not mention.
    const theme: Record<string, string> = {
      ...parseJson<Record<string, string>>(business.website.themeJson, {}),
    };
    for (const [key, allowed] of Object.entries(THEME_VALUES)) {
      const value = (body.theme as Record<string, unknown>)[key];
      if (value === undefined) continue;
      if (!allowed.includes(String(value))) throw new HttpError(`Invalid ${key} value`);
      theme[key] = String(value);
    }
    const nextThemeJson = JSON.stringify(theme);
    // Saving the same look again is not a change, so it costs nothing.
    if (nextThemeJson !== business.website.themeJson) {
      await consumeThemeChange(business.id);
    }
    data.themeJson = nextThemeJson;
  }

  if (body.seoTitle !== undefined) data.seoTitle = str(body.seoTitle, 200);
  if (body.seoDescription !== undefined) data.seoDescription = str(body.seoDescription, 400);
  if (body.keywords !== undefined) data.keywords = str(body.keywords, 500);
  if (body.ogImage !== undefined) data.ogImage = safeUrl(body.ogImage, 2_600_000);

  if (!Object.keys(data).length) throw new HttpError("Nothing to update");

  const updated = await db.website.update({ where: { businessId: business.id }, data });

  const fresh = await db.business.findUnique({
    where: { id: business.id },
    select: {
      themeChangesUsed: true,
      subscription: {
        select: {
          status: true,
          plan: { select: { maxThemeChanges: true, priceMonthly: true, priceYearly: true } },
        },
      },
    },
  });

  return ok({
    ...serializeWebsite(updated),
    appearance: fresh ? allowanceFor(fresh) : undefined,
  });
});

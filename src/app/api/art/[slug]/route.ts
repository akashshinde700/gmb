import { db } from "@/lib/db";
import {
  posterSvg, variantsFor, ART_SECTIONS, ratioForSection,
  type ArtRadius, type ArtRatio, type ArtSection, type ArtTreatment,
} from "@/lib/site-art";
import { industryFor } from "@/lib/industries";

/**
 * GET /api/art/<slug>.svg — the generated poster for a business.
 *
 * Deliberately public and unauthenticated: it is the hero background and the
 * link-preview image of a published site, so it has to load for a crawler and
 * for a visitor with no session. It reveals nothing — the colours and the
 * industry are already on the site's own page.
 *
 * A slug that does not exist is a flat 404 with no artwork: this must not become
 * a free SVG generator for anyone who guesses a name.
 *
 * Only DRAFT/PUBLISHED businesses are drawn for. A suspended or expired tenant
 * keeps its page dark; handing out artwork for it would be a small leak of
 * something that is meant to be off.
 */
export const dynamic = "force-dynamic";

// One day at the CDN, an hour in the browser: long enough that a busy site is
// not re-rendering this per view, short enough that a palette change shows up
// the same day. The response carries an ETag of its inputs, so a conditional
// request is a cheap 304.
function notFound() {
  return new Response("not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug: raw } = await params;
  const slug = decodeURIComponent(raw || "").replace(/\.svg$/i, "");
  if (!slug || !/^[a-z0-9-]{1,80}$/.test(slug)) return notFound();

  const url = new URL(req.url);
  // Where the picture is used, and which drawing to use, are both validated
  // against fixed lists: they end up in the seed (so the same URL always draws
  // the same picture) and this route is public, so an open-ended value would be
  // an unbounded number of cacheable posters.
  const sectionParam = url.searchParams.get("s") || "";
  const section = (ART_SECTIONS as readonly string[]).includes(sectionParam)
    ? (sectionParam as ArtSection)
    : undefined;
  const askedVariant = (url.searchParams.get("v") || "").slice(0, 20);
  const ratioParam = url.searchParams.get("r") || (section ? ratioForSection(section) : "wide");
  const ratio: ArtRatio = ratioParam === "square" || ratioParam === "portrait" ? ratioParam : "wide";
  const index = Math.min(9, Math.max(0, Number(url.searchParams.get("i") || 0) || 0));

  const business = await db.business.findUnique({
    where: { slug },
    select: {
      slug: true,
      category: true,
      brandPrimary: true,
      brandSecondary: true,
      brandAccent: true,
      status: true,
      website: { select: { themeJson: true, updatedAt: true } },
      updatedAt: true,
    },
  });
  if (!business) return notFound();

  // An explicit industry override lives in the theme (the wizard can map an
  // unlisted trade to the closest preset); otherwise the category decides. The
  // same theme carries the Design DNA, which is what finishes the picture: a
  // poster is often the only image a generated site has, so the image
  // treatment, the corner radius and the motion intensity the genome chose have
  // to show up here or they would be settings that change nothing.
  let scene = industryFor(business.category).motif.scene;
  let treatment: ArtTreatment = "plain";
  let radius: ArtRadius = "rounded";
  let motion = 2;
  try {
    const theme = JSON.parse(business.website?.themeJson || "{}") as {
      industry?: string;
      imageTreatment?: ArtTreatment;
      radius?: ArtRadius;
      motion?: { level?: number };
    };
    if (theme.industry) scene = industryFor(theme.industry).motif.scene;
    if (theme.imageTreatment) treatment = theme.imageTreatment;
    if (theme.radius) radius = theme.radius;
    // The renderer caps intensity at 3; the poster follows the same rule.
    if (typeof theme.motion?.level === "number") motion = Math.min(3, theme.motion.level);
  } catch {
    // unreadable theme — the category's scene and the plain finish are fine
  }

  // A variant that belongs to another scene is still drawn (both are abstract
  // geometry), but anything unknown falls back to this scene's own drawings.
  const variant = variantsFor(scene).includes(askedVariant) ? askedVariant : undefined;

  const svg = posterSvg({
    seed: business.slug,
    scene,
    colors: [business.brandPrimary, business.brandSecondary, business.brandAccent],
    ratio,
    index,
    treatment,
    radius,
    motion,
    variant,
    section,
  });

  // The inputs that change the picture, so a palette edit invalidates it.
  const etag = `W/"${business.updatedAt.getTime()}-${business.website?.updatedAt?.getTime() ?? 0}-${ratio}-${index}-${scene}-${treatment}-${radius}-${motion}-${section ?? ""}-${variant ?? ""}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": "public, max-age=3600, s-maxage=86400" } });
  }

  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      ETag: etag,
      // Inline so it renders as an image; the SVG has no script and no external
      // references, and is served under the same strict CSP as the rest of the
      // app. `sandbox` stops it being treated as a document if opened directly.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

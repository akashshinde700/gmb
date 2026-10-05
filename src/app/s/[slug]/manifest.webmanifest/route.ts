import { loadPublishedSite } from "@/lib/site-payload";
import { tenantBaseUrl, usableTagline } from "@/lib/site-utils";

/**
 * GET /s/<slug>/manifest.webmanifest — one customer's site as an installable app.
 *
 * This is worth more here than it sounds. A regular customer of a local shop
 * puts the shop on their home screen and opens it the way they open any other
 * app — no typing a URL, no hunting through browser history — and the shop gets
 * its own icon sitting next to WhatsApp. The colours and the name come from
 * what the owner already configured.
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  const payload = await loadPublishedSite(slug);
  if (!payload) return new Response("Not found", { status: 404 });

  const { business } = payload;
  const base = tenantBaseUrl(business.slug, payload.primaryDomain);
  const icon = business.logoUrl || business.coverUrl || "";

  return Response.json(
    {
      name: business.name,
      short_name: business.name.slice(0, 12),
      description: usableTagline(business.tagline) || business.description || business.name,
      start_url: base + "/",
      scope: base + "/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: business.brandPrimary || "#059669",
      lang: "en-IN",
      ...(icon
        ? { icons: [{ src: icon, sizes: "512x512", type: "image/png", purpose: "any" }] }
        : {}),
    },
    {
      headers: {
        "Content-Type": "application/manifest+json",
        "Cache-Control": "public, max-age=300",
      },
    },
  );
}

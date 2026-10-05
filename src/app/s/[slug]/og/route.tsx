import { ImageResponse } from "next/og";
import { loadPublishedSite } from "@/lib/site-payload";
import { usableTagline } from "@/lib/site-utils";

/**
 * GET /s/<slug>/og — the link preview card for one customer's website.
 *
 * Used when the business has not uploaded a cover image of its own. Without it
 * their site shared on WhatsApp was a blank grey box with a URL under it, which
 * is exactly the moment a shop owner is trying to look like a real business.
 *
 * Drawn from what they have already told us — name, tagline, city, and the
 * palette they picked — so it looks like their site rather than like ours.
 */
export const runtime = "nodejs";
export const revalidate = 3600;

type Params = { params: Promise<{ slug: string }> };

/** Readable text colour for a background, by relative luminance. */
function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  return lum > 0.45 ? "#111827" : "#ffffff";
}

export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  const payload = await loadPublishedSite(slug);

  // An unpublished or unknown slug still has to answer with an image: a crawler
  // handed a 404 here caches "no preview" for the URL.
  const name = payload?.business.name || "WebSetu";
  const tagline = usableTagline(payload?.business.tagline) || payload?.business.description || "";
  const city = payload?.business.city || "";
  const category = payload?.business.category || "";
  const primary = payload?.business.brandPrimary || "#059669";
  const secondary = payload?.business.brandSecondary || "#064e3b";
  const ink = readableOn(secondary);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: `linear-gradient(135deg, ${secondary} 0%, ${primary} 100%)`,
          color: ink,
          fontFamily: "sans-serif",
        }}
      >
        {category || city ? (
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              padding: "10px 22px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.18)",
              fontSize: 26,
            }}
          >
            {[category, city].filter(Boolean).join(" · ").slice(0, 60)}
          </div>
        ) : (
          <div style={{ display: "flex" }} />
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.05, letterSpacing: -1.5 }}>
            {name.slice(0, 46)}
          </div>
          {tagline ? (
            <div style={{ fontSize: 30, lineHeight: 1.35, opacity: 0.85 }}>
              {tagline.slice(0, 120)}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 22, opacity: 0.75 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "rgba(255,255,255,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              fontWeight: 700,
            }}
          >
            W
          </div>
          Powered by WebSetu
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}

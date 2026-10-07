import { headers } from "next/headers";
import { ImageResponse } from "next/og";
import { SITE_DESCRIPTION } from "@/lib/marketing-flags";
import { brandForHost } from "@/lib/reseller";

/**
 * GET /og — the link preview card for WebSetu's own pages.
 *
 * Every page had `og:image` missing entirely, which meant the platform's own
 * link pasted into WhatsApp, Facebook or LinkedIn rendered as a blank grey box.
 * For a product whose customers are Indian local businesses — where a link is
 * shared by being forwarded in a WhatsApp group — that blank box is most of the
 * distribution channel.
 *
 * Generated rather than a static file so the copy stays in step with the site
 * and nobody has to keep a 1200x630 PNG in sync by hand.
 */
export const runtime = "nodejs";
// This used to be cached hard, because the card only changed when this file
// did. It is per-host now — a reseller's link preview carries the reseller's
// name, never the platform's — so it is rendered per request instead.

const WIDTH = 1200;
const HEIGHT = 630;

export async function GET() {
  const brand = await brandForHost((await headers()).get("host"));
  const name = brand.whiteLabel ? brand.name : "WebSetu";
  const accent = brand.whiteLabel && brand.primaryColor ? brand.primaryColor : "#059669";
  const site = brand.whiteLabel ? brand.hostname : "websetu.instantqr.tech";

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
          background: `linear-gradient(135deg, #0b1220 0%, ${accent} 100%)`,
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 20,
              background: "white",
              color: accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 44,
              fontWeight: 700,
            }}
          >
            {name.slice(0, 1).toUpperCase()}
          </div>
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -0.5 }}>{name}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1, letterSpacing: -1.5 }}>
            Your Business, Online in 15 Minutes
          </div>
          <div style={{ fontSize: 28, lineHeight: 1.4, color: "rgba(255,255,255,0.85)" }}>
            {brand.whiteLabel
              ? `${name} builds and runs websites for local businesses.`
              : SITE_DESCRIPTION.slice(0, 140)}
          </div>
        </div>

        <div style={{ fontSize: 24, color: "rgba(255,255,255,0.75)" }}>
          {site}
        </div>
      </div>
    ),
    { width: WIDTH, height: HEIGHT },
  );
}

import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION } from "@/lib/marketing-flags";

/**
 * The platform's web app manifest. /manifest.json used to 404.
 *
 * Modest but not pointless: it is what lets an owner keep WebSetu on their
 * phone's home screen, and it is where Android takes the icon and theme colour
 * for the task switcher.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WebSetu — Your Business, Online in 15 Minutes",
    short_name: "WebSetu",
    description: SITE_DESCRIPTION,
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#059669",
    lang: "en-IN",
    icons: [{ src: "/logo.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}

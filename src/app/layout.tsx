import type { Metadata } from "next";
import { headers } from "next/headers";
import localFont from "next/font/local";
import "./globals.css";
import { SITE_DESCRIPTION } from "@/lib/marketing-flags";
import { siteOrigin } from "@/lib/site-utils";
import { brandForHost } from "@/lib/reseller";
import { Toaster } from "@/components/ui/toaster";

/**
 * The typeface is served from this repository, not from Google.
 *
 * `next/font/google` downloads the font files at BUILD time and embeds them in
 * the output — so `npm run build` needed an HTTPS connection to
 * fonts.googleapis.com to succeed. That turned a third-party outage, a
 * firewalled VPS or a CI runner without egress into "the deploy does not
 * build", for a product whose whole pitch is that a customer's site stays up.
 * Vercel's own guidance for this case is to self-host.
 *
 * Geist and Geist Mono are SIL Open Font License 1.1 (see ./fonts/OFL.txt),
 * which permits redistribution. Only the variable weights are vendored: 117 KB
 * for both files, against the ten static weights per family the package ships.
 */
const geistSans = localFont({
  src: "./fonts/Geist-Variable.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: "swap",
  fallback: ["system-ui", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
});

const geistMono = localFont({
  src: "./fonts/GeistMono-Variable.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
});

export async function generateMetadata(): Promise<Metadata> {
  // A reseller's domain must not tell the world it is running on the platform:
  // search results, chat previews and the browser tab all carry this name.
  const brand = await brandForHost((await headers()).get("host"));
  const name = brand.whiteLabel ? brand.name : "WebSetu";
  const tagline = `${name} — Your Business, Online in 15 Minutes`;
  return {
  /**
   * Without this, Next resolves every relative Open Graph and Twitter image
   * against the server's own address — so a customer's uploaded cover went out
   * to WhatsApp and Facebook as http://localhost:4400/api/uploads/… and no
   * preview ever loaded. It also emitted the build warning nobody chased down.
   */
  metadataBase: new URL(siteOrigin()),
  title: tagline,
  description: brand.whiteLabel ? `${brand.name} builds and runs websites for local businesses.` : SITE_DESCRIPTION,
  keywords: brand.whiteLabel
    ? ["business website", "website builder India", "local business SaaS"]
    : ["business website", "website builder India", "local business SaaS", "WebSetu", "WaaS"],
  // No `icons` here on purpose. The icons come from the file convention —
  // src/app/icon.svg, apple-icon.png and favicon.ico — which Next serves at
  // hashed URLs like /icon?<hash>.
  //
  // That hash is the point. This used to point at the fixed path /logo.svg, and
  // the tab still showed the Z mark from the template this project was
  // scaffolded from: browsers cache a favicon against its URL and never look
  // again while the URL is unchanged, so replacing the file changed nothing for
  // anyone who had already visited. A content-hashed URL refetches on its own.
  //
  // favicon.ico is there for the callers that request /favicon.ico directly and
  // ignore <link> — crawlers, feed readers, saved shortcuts. That path used to
  // 404.
  openGraph: {
    title: tagline,
    description: "Give us your business details, we create and operate your complete online presence.",
    siteName: name,
    type: "website",
    locale: "en_IN",
    // A generated card rather than nothing. Pasted into a WhatsApp group this
    // is the difference between a blank grey box and something that looks like
    // a product.
    images: [{ url: "/og", width: 1200, height: 630, alt: name }],
  },
  twitter: {
    card: "summary_large_image",
    title: tagline,
    description: "Give us your business details, we create and operate your complete online presence.",
    images: ["/og"],
  },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}

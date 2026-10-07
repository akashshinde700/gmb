import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SITE_DESCRIPTION } from "@/lib/marketing-flags";
import { siteOrigin } from "@/lib/site-utils";
import { brandForHost } from "@/lib/reseller";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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

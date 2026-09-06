import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WebSetu — Your Business, Online in 15 Minutes",
  description:
    "WebSetu is India's complete Website-as-a-Service platform for local businesses. Website + Google presence + SEO + Leads + WhatsApp + Analytics — without any coding.",
  keywords: ["business website", "website builder India", "local business SaaS", "WebSetu", "WaaS"],
  icons: { icon: "/logo.svg" },
  openGraph: {
    title: "WebSetu — Your Business, Online in 15 Minutes",
    description: "Give us your business details, we create and operate your complete online presence.",
    siteName: "WebSetu",
    type: "website",
  },
};

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

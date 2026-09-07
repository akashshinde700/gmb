// WebSetu — Website health / completeness scoring
import { parseJson } from "@/lib/sections";
import type { Business, HealthCheck, HealthReport, WebsiteData } from "@/lib/types";

interface ContentCounts {
  services: number; products: number; gallery: number; testimonials: number; faqs: number; blogPosts: number;
}

export function computeHealth(
  business: Business,
  website: WebsiteData | null,
  counts: ContentCounts,
): HealthReport {
  const hours = parseJson<Record<string, string>>(business.hours as unknown as string, {});
  const socials = parseJson<Record<string, string>>(business.socials as unknown as string, {});

  const checks: HealthCheck[] = [
    { key: "logo", label: "Logo uploaded", pass: !!business.logoUrl, weight: 6 },
    { key: "cover", label: "Cover image set", pass: !!business.coverUrl, weight: 4 },
    { key: "description", label: "Business description", pass: business.description.length >= 40, weight: 8 },
    { key: "phone", label: "Phone number", pass: !!business.phone, weight: 8 },
    { key: "whatsapp", label: "WhatsApp number", pass: !!business.whatsapp, weight: 5 },
    { key: "email", label: "Email address", pass: !!business.email, weight: 5 },
    { key: "address", label: "Complete address", pass: !!business.address && !!business.city, weight: 8 },
    { key: "hours", label: "Business hours", pass: Object.keys(hours).length > 0, weight: 5 },
    { key: "services", label: "At least 3 services", pass: counts.services >= 3, weight: 10 },
    { key: "content", label: "Gallery / testimonials added", pass: counts.gallery >= 2 || counts.testimonials >= 2, weight: 6 },
    { key: "faq", label: "FAQs added (AEO)", pass: counts.faqs >= 3, weight: 7 },
    { key: "seoTitle", label: "SEO title", pass: !!website?.seoTitle, weight: 8 },
    { key: "seoDesc", label: "Meta description", pass: (website?.seoDescription?.length ?? 0) >= 80, weight: 8 },
    { key: "keywords", label: "Local keywords", pass: !!website?.keywords, weight: 4 },
    { key: "gmb", label: "Google Business Profile linked", pass: !!business.gmbUrl || !!business.mapsUrl, weight: 8 },
    { key: "social", label: "Social profiles linked", pass: Object.keys(socials).length > 0, weight: 4 },
  ];

  const total = checks.reduce((s, c) => s + c.weight, 0);
  const earned = checks.reduce((s, c) => s + (c.pass ? c.weight : 0), 0);
  const score = Math.round((earned / total) * 100);

  const recommendations: string[] = [];
  for (const c of checks) {
    if (!c.pass) {
      const fix: Record<string, string> = {
        logo: "Upload your logo for stronger branding.",
        cover: "Add a cover photo — sites with images get 2× more enquiries.",
        description: "Write a 2–3 line business description (or use AI Generate).",
        phone: "Add your phone number so customers can call you.",
        whatsapp: "Add a WhatsApp number — most local leads come via WhatsApp.",
        email: "Add an email address for enquiries.",
        address: "Add your full address for Google Maps & local SEO.",
        hours: "Set your business hours to build trust.",
        services: "Add at least 3 services — this is what customers search for.",
        content: "Add gallery photos or customer testimonials for social proof.",
        faq: "Add FAQs — they power AI answer engines (AEO) and Google rich results.",
        seoTitle: "Set an SEO title (or auto-generate it).",
        seoDesc: "Write a longer meta description (80+ characters).",
        keywords: "Add local keywords like your category + city.",
        gmb: "Link your Google Business Profile / Maps listing.",
        social: "Link your social media profiles.",
      };
      recommendations.push(fix[c.key] || c.label);
    }
  }
  if (!recommendations.length) recommendations.push("Excellent! Your website is fully optimized. Keep adding fresh content weekly.");

  return { score, checks, recommendations };
}

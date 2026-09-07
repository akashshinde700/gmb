// WebSetu — Theme + Section + Content engine helpers
import type { SiteSection, SectionType, SiteTheme, Business } from "@/lib/types";

export const SECTION_LIBRARY: {
  type: SectionType; name: string; description: string; icon: string;
}[] = [
  { type: "hero", name: "Hero Banner", description: "Headline, subheading, CTAs & cover image", icon: "layout-template" },
  { type: "about", name: "About Us", description: "Business story & description", icon: "info" },
  { type: "stats", name: "Statistics", description: "Experience, customers & projects counters", icon: "chart-bar" },
  { type: "services", name: "Services", description: "Grid of your services with CTAs", icon: "briefcase" },
  { type: "products", name: "Products", description: "Product catalogue with enquiry", icon: "package" },
  { type: "whyUs", name: "Why Choose Us", description: "Key differentiators & highlights", icon: "star" },
  { type: "gallery", name: "Gallery", description: "Photo showcase of your work", icon: "image" },
  { type: "testimonials", name: "Testimonials", description: "Customer reviews & ratings", icon: "quote" },
  { type: "faq", name: "FAQ", description: "Answer engine optimized questions", icon: "help-circle" },
  { type: "cta", name: "CTA Banner", description: "Call / WhatsApp conversion banner", icon: "phone" },
  { type: "payment", name: "Payment QR", description: "Scan & Pay with UPI — QR code + pay link", icon: "qr-code" },
  { type: "hours", name: "Business Hours", description: "Weekly opening hours", icon: "clock" },
  { type: "contact", name: "Contact & Map", description: "Enquiry form, map & details", icon: "map-pin" },
];

export const DEFAULT_THEME: SiteTheme = {
  font: "modern",
  radius: "rounded",
  heroStyle: "gradient",
  cardStyle: "shadow",
  containerWidth: "normal",
};

function sid(): string {
  return `s_${Math.random().toString(36).slice(2, 10)}`;
}

export interface GeneratedSite {
  sections: SiteSection[];
  theme: SiteTheme;
  seoTitle: string;
  seoDescription: string;
  keywords: string;
}

interface BuildInput {
  business: {
    name: string; category: string; tagline: string; description: string; city: string;
    phone: string; whatsapp: string; email: string; address: string; establishedYear: string;
    brandPrimary: string; brandSecondary: string; brandAccent: string; coverUrl: string; mapsUrl: string;
    upiId?: string; paymentQrUrl?: string;
    state?: string; pincode?: string;
  };
  ai?: AiSiteContent | null;
}

export interface AiSiteContent {
  heroBadge?: string;
  heroHeading?: string;
  heroSubheading?: string;
  ctaPrimary?: string;
  ctaSecondary?: string;
  about?: string;
  stats?: { label: string; value: string }[];
  whyUs?: { title: string; description: string }[];
  faqs?: { question: string; answer: string }[];
  seoTitle?: string;
  seoDescription?: string;
}

/** Generate the initial website (sections + theme + SEO) from business info + optional AI content. */
export function generateSite({ business, ai }: BuildInput): GeneratedSite {
  const tagline = business.tagline || `Trusted ${business.category.toLowerCase()} in ${business.city || "your city"}`;
  const heroHeading = ai?.heroHeading || business.name;
  const heroSubheading = ai?.heroSubheading ||
    tagline + (business.description ? ` — ${business.description.slice(0, 110)}` : "");
  const stats = ai?.stats?.length ? ai.stats : [
    { value: business.establishedYear ? `${new Date().getFullYear() - Number(business.establishedYear)}+` : "10+", label: "Years Experience" },
    { value: "500+", label: "Happy Customers" },
    { value: "1000+", label: "Projects Done" },
    { value: "24/7", label: "Support" },
  ];
  const faqs = ai?.faqs?.length ? ai.faqs : [
    { question: `What services does ${business.name} provide?`, answer: business.description || `We provide trusted ${business.category.toLowerCase()} services in ${business.city}.` },
    { question: `Where is ${business.name} located?`, answer: `${business.address}, ${business.city}, ${business.state} ${business.pincode}`.replace(/^,\s*/, "") },
    { question: `How can I contact ${business.name}?`, answer: `Call us on ${business.phone} or WhatsApp us anytime — we reply quickly.` },
    { question: `What are your business hours?`, answer: "We are open Monday to Saturday, 9:00 AM – 7:00 PM. Sunday by appointment." },
  ];

  const sections: SiteSection[] = [
    {
      id: sid(), type: "hero", visible: true,
      content: {
        badge: ai?.heroBadge || `★ Trusted in ${business.city || "India"}`,
        heading: heroHeading,
        subheading: heroSubheading,
        ctaPrimary: ai?.ctaPrimary || "Get a Free Quote",
        ctaSecondary: ai?.ctaSecondary || "Call Now",
        image: business.coverUrl,
      },
    },
    { id: sid(), type: "stats", visible: true, content: { items: stats } },
    {
      id: sid(), type: "about", visible: true,
      content: {
        title: `About ${business.name}`,
        body: ai?.about || business.description || `${business.name} is a trusted ${business.category.toLowerCase()} based in ${business.city}. We believe in honest pricing, quality work and long-term customer relationships.`,
        image: business.coverUrl,
      },
    },
    {
      id: sid(), type: "services", visible: true,
      content: { title: "Our Services", subtitle: `What we offer in ${business.city || "your area"}` },
    },
    {
      id: sid(), type: "whyUs", visible: true,
      content: {
        title: "Why Choose Us",
        items: ai?.whyUs?.length ? ai.whyUs : [
          { title: "Experienced Team", description: "Skilled professionals with years of hands-on expertise." },
          { title: "Fair Pricing", description: "Transparent quotes with no hidden charges." },
          { title: "On-Time Service", description: "We respect your time — every project delivered on schedule." },
          { title: "Customer First", description: "500+ satisfied customers across the region trust us." },
        ],
      },
    },
    { id: sid(), type: "gallery", visible: true, content: { title: "Our Work", subtitle: "A glimpse of what we do" } },
    {
      id: sid(), type: "testimonials", visible: true,
      content: { title: "What Customers Say", subtitle: "Real reviews from real customers" },
    },
    {
      id: sid(), type: "faq", visible: true,
      content: { title: "Frequently Asked Questions", items: faqs },
    },
    {
      id: sid(), type: "cta", visible: true,
      content: {
        title: `Ready to work with ${business.name}?`,
        subtitle: "Get in touch today — call, WhatsApp or send an enquiry. We respond fast.",
        primary: "Call Now", secondary: "WhatsApp Us",
      },
    },
    {
      id: sid(), type: "payment", visible: true,
      content: {
        title: "Scan & Pay",
        subtitle: `Pay securely via UPI — ${business.name}`,
        note: "After payment, share the screenshot on WhatsApp for confirmation.",
      },
    },
    { id: sid(), type: "hours", visible: true, content: { title: "Business Hours" } },
    {
      id: sid(), type: "contact", visible: true,
      content: {
        title: "Contact Us", subtitle: "Send an enquiry — we will get back to you within 24 hours.",
        mapUrl: business.mapsUrl,
      },
    },
  ];

  const theme: SiteTheme = { ...DEFAULT_THEME };
  const seoTitle = ai?.seoTitle || `${business.name} — ${tagline}`;
  const seoDescription = ai?.seoDescription ||
    `${business.name} is a trusted ${business.category.toLowerCase()} in ${business.city || "India"}. ${tagline}. Call ${business.phone} or send an enquiry today.`;
  const keywords = [
    business.name, business.category, ...business.category.split(/\s+/),
    business.city, `${business.category} in ${business.city}`, business.state,
  ].filter(Boolean).join(", ").toLowerCase();

  return { sections, theme, seoTitle, seoDescription, keywords };
}

/** Safe parse helpers for JSON string columns */
export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function hoursForBusiness(b: Business): Record<string, string> {
  return {
    Monday: "9:00 AM – 7:00 PM", Tuesday: "9:00 AM – 7:00 PM", Wednesday: "9:00 AM – 7:00 PM",
    Thursday: "9:00 AM – 7:00 PM", Friday: "9:00 AM – 7:00 PM", Saturday: "9:00 AM – 7:00 PM",
    Sunday: "Closed", ...parseJson<Record<string, string>>(b.hours as unknown as string, {}),
  };
}

// WebSetu — Theme + Section + Content engine helpers
import type { SiteSection, SectionType, SiteTheme, Business } from "@/lib/types";
import { fillCopy, resolveIndustry } from "@/lib/industries";
import { usableTagline } from "@/lib/site-utils";
import {
  CLOSINGS, HEADINGS, LOOKS, pick, SECONDARY_CTAS, shuffle, stream, SUBHEADINGS, variantsFor,
} from "@/lib/variants";

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
  { type: "blog", name: "Blog", description: "Latest articles — each gets its own indexable page", icon: "newspaper" },
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
  /** Preset key chosen for an unlisted trade; wins over the category match. */
  industry?: string | null;
  /**
   * Stable per-business string (the slug). Two shops in the same trade must not
   * get the same site, so colours, layout, headline and service order are all
   * chosen from this. Same seed in, same site out — a rebuild never reshuffles.
   */
  seed?: string;
  /** Second stock photo, used beside the About text. */
  aboutImage?: string;
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
  /** Services for a trade the presets do not know. */
  services?: { name: string; description: string; icon?: string }[];
  /** Closest preset key, used for look and animation. */
  industry?: string;
  /** Stock-photo search phrase for this trade. */
  imageQuery?: string;
}

/** Generate the initial website (sections + theme + SEO) from business info + optional AI content. */
export function generateSite({ business, ai, industry, aboutImage, seed }: BuildInput): GeneratedSite {
  // Industry preset supplies everything the AI did not: copy, layout and theme
  // differ for a transporter, a cement dealer and a water brand.
  const preset = resolveIndustry(business.category, industry ?? ai?.industry);
  const vars = { name: business.name, city: business.city, category: business.category };
  const fill = (t: string) => fillCopy(t, vars);

  // One independent stream per dimension, so two businesses in a trade do not
  // end up matching on several at once. Stable for this business either way.
  const key = seed || business.name;
  const draw = (label: string) => stream(key, label);
  const variants = variantsFor(preset.key);
  const promise = pick(draw("promise"), variants.promises);
  const serviceNames = (ai?.services?.length ? ai.services : preset.services).map((x) => x.name);

  const ownTagline = usableTagline(business.tagline);
  const tagline = ownTagline || `Trusted ${business.category.toLowerCase()} in ${business.city || "your city"}`;
  const heroHeading =
    ai?.heroHeading || fillCopy(pick(draw("heading"), HEADINGS).replaceAll("{promise}", promise), vars);
  const heroSubheading =
    ai?.heroSubheading ||
    (ownTagline ? `${ownTagline} — ` : "") +
      fillCopy(
        pick(draw("sub"), SUBHEADINGS)
          .replaceAll("{services}", serviceNames.slice(0, 3).join(", ").toLowerCase() || "{category} services")
          .replaceAll("{closing}", pick(draw("closing"), CLOSINGS)),
        vars,
      );
  const years = Number(business.establishedYear);
  const presetStats = shuffle(draw("stats"), preset.stats).map((s) => ({ value: fill(s.value), label: fill(s.label) }));
  // A real founding year beats a generic claim, so it takes the first slot.
  const stats = ai?.stats?.length ? ai.stats : years > 1900 && years <= new Date().getFullYear()
    ? [{ value: `${Math.max(1, new Date().getFullYear() - years)}+`, label: "Years in Business" }, ...presetStats.slice(1)]
    : presetStats;
  const faqs = ai?.faqs?.length ? ai.faqs : [
    ...shuffle(draw("faqs"), preset.faqs).map((f) => ({ question: fill(f.question), answer: fill(f.answer) })),
    ...(business.address
      ? [{ question: `What is the address of ${business.name}?`, answer: [business.address, business.city, business.state, business.pincode].filter(Boolean).join(", ") }]
      : []),
  ];

  const sections: SiteSection[] = [
    {
      id: sid(), type: "hero", visible: true,
      content: {
        badge: ai?.heroBadge || fill(preset.hero.badge),
        heading: heroHeading,
        subheading: heroSubheading,
        ctaPrimary: ai?.ctaPrimary || preset.hero.ctaPrimary,
        ctaSecondary: ai?.ctaSecondary || pick(draw("cta"), SECONDARY_CTAS),
        image: business.coverUrl,
      },
    },
    { id: sid(), type: "stats", visible: true, content: { items: stats } },
    {
      id: sid(), type: "about", visible: true,
      content: {
        title: `About ${business.name}`,
        body: ai?.about || business.description || fill(preset.about),
        image: aboutImage || business.coverUrl,
      },
    },
    {
      id: sid(), type: "services", visible: true,
      content: { title: fill(preset.servicesTitle), subtitle: fill(preset.servicesSubtitle) },
    },
    {
      id: sid(), type: "whyUs", visible: true,
      content: {
        title: `Why Choose ${business.name}`,
        items: ai?.whyUs?.length
          ? ai.whyUs
          : shuffle(draw("whyus"), preset.whyUs).map((w) => ({ title: fill(w.title), description: fill(w.description) })),
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
      // Renders nothing until the business publishes a post, so a new site is
      // not padded with an empty section — but the moment they write one it is
      // on the homepage and linked from the sitemap.
      id: sid(), type: "blog", visible: true,
      content: { title: "From our blog", subtitle: "Tips, updates and answers from our team" },
    },
    {
      id: sid(), type: "cta", visible: true,
      content: {
        title: fill(preset.ctaTitle),
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

  // Image/split heroes need a photo; without one the gradient + industry
  // animation looks far better than an empty frame.
  const heroStyle = business.coverUrl ? preset.theme.heroStyle : "gradient";
  const theme: SiteTheme = {
    ...DEFAULT_THEME,
    ...preset.theme,
    ...pick(draw("look"), LOOKS),
    heroStyle,
    motif: "auto",
    industry: preset.key,
  };
  const seoTitle = ai?.seoTitle || `${business.name} — ${tagline}`;
  const seoDescription = ai?.seoDescription ||
    `${business.name} is a trusted ${business.category.toLowerCase()} in ${business.city || "India"}. ${tagline}. Call ${business.phone} or send an enquiry today.`;
  const keywords = [
    business.name, business.category, ...business.category.split(/\s+/),
    business.city, `${business.category} in ${business.city}`, business.state,
  ].filter(Boolean).join(", ").toLowerCase();

  return { sections: arrangeSections(sections, draw("order")), theme, seoTitle, seoDescription, keywords };
}

/**
 * Running orders for the middle of the page.
 *
 * Colour and copy already differ per business, but every site still opened with
 * the identical run of sections, which is what made two shops in one trade feel
 * like the same website. The hero stays first and the contact form stays last —
 * those are where visitors expect them — and the sections in between are
 * arranged differently per business.
 *
 * Only sections the generator actually produced are placed; anything not named
 * here keeps its original position at the end of the middle block.
 */
const SECTION_ORDERS: readonly (readonly SectionType[])[] = [
  ["stats", "about", "services", "whyUs", "gallery", "testimonials", "faq", "blog", "cta", "payment", "hours"],
  ["about", "services", "stats", "gallery", "whyUs", "testimonials", "cta", "faq", "blog", "hours", "payment"],
  ["services", "about", "whyUs", "stats", "testimonials", "gallery", "cta", "blog", "faq", "payment", "hours"],
  ["about", "stats", "services", "testimonials", "whyUs", "cta", "gallery", "faq", "hours", "blog", "payment"],
  ["services", "stats", "whyUs", "about", "gallery", "cta", "testimonials", "faq", "payment", "blog", "hours"],
  ["about", "whyUs", "services", "gallery", "stats", "cta", "testimonials", "blog", "faq", "hours", "payment"],
  ["stats", "services", "about", "testimonials", "gallery", "whyUs", "faq", "cta", "blog", "payment", "hours"],
];

function arrangeSections(sections: SiteSection[], r: () => number): SiteSection[] {
  const hero = sections.filter((x) => x.type === "hero");
  const contact = sections.filter((x) => x.type === "contact");
  const middle = sections.filter((x) => x.type !== "hero" && x.type !== "contact");

  const order = pick(r, SECTION_ORDERS);
  const rank = new Map(order.map((t, i) => [t, i]));
  const placed = [...middle].sort(
    (a, b) => (rank.get(a.type) ?? order.length) - (rank.get(b.type) ?? order.length),
  );
  return [...hero, ...placed, ...contact];
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

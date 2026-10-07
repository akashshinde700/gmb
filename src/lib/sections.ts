// WebSetu — Theme + Section + Content engine helpers
import type { SiteSection, SectionType, SiteTheme, Business } from "@/lib/types";
import { fillCopy, resolveIndustry } from "@/lib/industries";
import { usableTagline } from "@/lib/site-utils";
import {
  CLOSINGS, HEADINGS, LOOKS, pick, SECONDARY_CTAS, shuffle, stream, SUBHEADINGS, variantsFor,
} from "@/lib/variants";
import type { SiteBlueprint } from "@/lib/blueprint";
import { motionLabel, type DesignDna } from "@/lib/design-dna";
import { posterUrl } from "@/lib/site-art";

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
    /**
     * The business's slug. Only used to address its generated artwork — every
     * picture a new page shows is drawn for this business, so the section images
     * need its name before it has an id.
     */
    slug?: string;
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
  /**
   * The owner's own hero photo. Empty means the hero keeps its animated scene —
   * a stock photo here is what made every business in a trade look identical
   * above the fold.
   */
  heroImage?: string;
  /**
   * The design decisions for this business, from lib/blueprint.ts. Supplying it
   * makes this function take its look, section order and promise from the same
   * place the wizard did, instead of drawing its own — which is how the preview
   * and the published site used to disagree.
   */
  blueprint?: SiteBlueprint;
  /**
   * The genome to build from. Usually the blueprint's own (so the site, the
   * wizard preview and the stored design agree); callers that only have a DNA —
   * a regenerate endpoint, a test — can pass it on its own.
   */
  dna?: DesignDna;
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
export function generateSite({ business, ai, industry, aboutImage, heroImage, blueprint, dna: dnaInput, seed }: BuildInput): GeneratedSite {
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
  // The blueprint the wizard already showed the customer wins; without one
  // (older callers, tests) this draws exactly as it always did.
  const promise = blueprint?.promise || pick(draw("promise"), variants.promises);
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
  // Which arrangement each section takes, from the genome. Absent for older
  // callers, in which case every section renders its default layout.
  const dna = dnaInput ?? blueprint?.dna;
  const chosenVariants = new Map((dna?.sectionPlan ?? []).map((c) => [c.type, c.variant]));
  const withVariant = (secs: typeof sections): typeof sections =>
    secs.map((sec) => {
      const variant = chosenVariants.get(sec.type);
      return variant ? { ...sec, content: { ...sec.content, variant } } : sec;
    });

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
        // The director's goal decides what the page asks for. The owner's own
        // words still win where they exist (ai?.ctaPrimary), because a business
        // that knows what it sells must not be argued with.
        ctaPrimary: ai?.ctaPrimary || blueprint?.goal.primary.label || preset.hero.ctaPrimary,
        ctaSecondary: ai?.ctaSecondary || blueprint?.goal.secondary?.label || pick(draw("cta"), SECONDARY_CTAS),
        ctaPrimaryAction: blueprint?.goal.primary.action ?? "form",
        ctaSecondaryAction: blueprint?.goal.secondary?.action ?? "call",
        image: heroImage !== undefined ? heroImage : business.coverUrl,
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
        // The band carries its own generated picture — a different drawing of
        // the business than the hero, the about block and each gallery tile.
        // It is decorative (a low-opacity background) and the owner can take it
        // out from the section editor like any other image.
        image: business.slug ? posterUrl(business.slug, "wide", 0, { section: "cta" }) : undefined,
        subtitle: "Get in touch today — call, WhatsApp or send an enquiry. We respond fast.",
        // The band is the last thing before the footer, so it repeats the goal
        // rather than a generic "Call Now" that ignores what the business sells.
        primary: blueprint?.goal.primary.label ?? "Call Now",
        secondary: blueprint?.goal.secondary?.label ?? "WhatsApp Us",
        primaryAction: blueprint?.goal.primary.action ?? "call",
        secondaryAction: blueprint?.goal.secondary?.action ?? "whatsapp",
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
    ...(blueprint?.look ?? pick(draw("look"), LOOKS)),
    heroStyle,
    motif: "auto",
    industry: preset.key,
    // The rest of the genome. Absent DNA (older callers) leaves these undefined
    // and the renderer behaves exactly as it did before they existed.
    ...(dna
      ? {
          shadow: dna.design.shadow,
          button: dna.design.button,
          spacing: dna.design.spacing,
          header: dna.design.header,
          footer: dna.design.footer,
          imageTreatment: dna.design.imageTreatment,
          motion: { pack: dna.motion.pack, level: dna.motion.level },
          dna: {
            seed: dna.seed,
            styleName: dna.design.styleName,
            business: dna.business,
            motionLabel: motionLabel(dna.motion.pack),
            sectionPlan: dna.sectionPlan,
            // The director's brief, so the dashboard can show why the page looks
            // the way it does and a later restyle has something to change.
            ...(blueprint
              ? {
                  goal: {
                    key: blueprint.goal.key,
                    label: blueprint.goal.label,
                    primary: blueprint.goal.primary.label,
                    secondary: blueprint.goal.secondary?.label ?? null,
                    action: blueprint.goal.primary.action,
                  },
                  stages: blueprint.brief.stages,
                }
              : {}),
          },
        }
      : {}),
  };
  const seoTitle = ai?.seoTitle || `${business.name} — ${tagline}`;
  const seoDescription = ai?.seoDescription ||
    `${business.name} is a trusted ${business.category.toLowerCase()} in ${business.city || "India"}. ${tagline}. Call ${business.phone} or send an enquiry today.`;
  const keywords = [
    business.name, business.category, ...business.category.split(/\s+/),
    business.city, `${business.category} in ${business.city}`, business.state,
  ].filter(Boolean).join(", ").toLowerCase();

  return {
    sections: arrangeSections(withVariant(sections), blueprint?.sectionOrder ?? pick(draw("order"), SECTION_ORDERS)),
    theme,
    seoTitle,
    seoDescription,
    keywords,
  };
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

function arrangeSections(sections: SiteSection[], order: readonly SectionType[]): SiteSection[] {
  const hero = sections.filter((x) => x.type === "hero");
  const contact = sections.filter((x) => x.type === "contact");
  const middle = sections.filter((x) => x.type !== "hero" && x.type !== "contact");

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

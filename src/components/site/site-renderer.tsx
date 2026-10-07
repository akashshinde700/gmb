"use client";
// WebSetu — SiteRenderer: renders a complete tenant website from SitePayload.
// Used in live view + dashboard preview (mode="preview" disables tracking/lead POSTs).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Phone, Menu, X, Star, Facebook, Instagram, Youtube, Linkedin, Twitter, Globe,
  MessageCircle, Mail, MapPin, Moon, ArrowUp,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { openStatus } from "@/lib/hours";
import { jsonLdScript, siteOrigin, usableTagline, visitMeta, visitorId } from "@/lib/site-utils";
import { applyVariant } from "@/lib/experiments";
import { schemaTypeFor } from "@/lib/schema-types";
import { resolveIndustry, type SceneKind } from "@/lib/industries";
import { readSectionStyle, styleAttributes } from "@/lib/section-style";
import { typeLabel } from "@/lib/editor";
import { readCommerce } from "@/lib/commerce";
import { CartBar, CheckoutSheet, useCart } from "@/components/site/cart";
import SiteReveal from "@/components/site/site-reveal";
import { seedFrom } from "@/lib/variants";
import SiteImage from "@/components/site/site-image";
import type { SitePayload, SiteSection, SiteTheme } from "@/lib/types";
import { toWaNumber } from "@/lib/phone-format";
import {
  Hero, Stats, About, Services, Products, WhyUs, Gallery, Testimonials,
  FaqSection, BlogTeaser, CtaBanner, Payment, Hours, Contact,
} from "@/components/site/sections";

export type Device = "desktop" | "tablet" | "mobile";

const SHADOW_MAP: Record<NonNullable<SiteTheme["shadow"]>, string> = {
  none: "none",
  soft: "0 1px 2px rgba(15,23,42,.06), 0 1px 3px rgba(15,23,42,.08)",
  lifted: "0 8px 24px -12px rgba(15,23,42,.28)",
  dramatic: "0 24px 60px -20px rgba(15,23,42,.45)",
};
const SPACING_MAP: Record<NonNullable<SiteTheme["spacing"]>, { section: string; gap: string }> = {
  tight: { section: "py-12 md:py-14", gap: "gap-4 md:gap-5" },
  normal: { section: "py-16 md:py-20", gap: "gap-6" },
  airy: { section: "py-20 md:py-28", gap: "gap-7 md:gap-9" },
};
const BUTTON_MAP: Record<NonNullable<SiteTheme["button"]>, { radius: string; shadow: string }> = {
  solid: { radius: "var(--brand-radius)", shadow: "0 1px 2px rgba(15,23,42,.12)" },
  square: { radius: "0px", shadow: "none" },
  outline: { radius: "var(--brand-radius)", shadow: "none" },
  soft: { radius: "var(--brand-radius)", shadow: "none" },
  gradient: { radius: "var(--brand-radius)", shadow: "0 6px 18px -8px rgba(15,23,42,.5)" },
};

const RADIUS_MAP: Record<SiteTheme["radius"], { sm: string; lg: string }> = {
  sharp: { sm: "2px", lg: "4px" },
  rounded: { sm: "10px", lg: "16px" },
  pill: { sm: "999px", lg: "24px" },
};
const FONT_MAP: Record<SiteTheme["font"], { heading: string; body: string }> = {
  modern: { heading: "var(--font-geist-sans), sans-serif", body: "var(--font-geist-sans), sans-serif" },
  classic: { heading: "Georgia, 'Times New Roman', serif", body: "var(--font-geist-sans), sans-serif" },
  elegant: { heading: "Georgia, serif", body: "Georgia, serif" },
};

// ---------- SEO: schema.org LocalBusiness JSON-LD helpers ----------
type OpeningHoursSpec = {
  "@type": "OpeningHoursSpecification";
  dayOfWeek: string;
  opens: string;
  closes: string;
};

const SCHEMA_DAY_BY_KEY: Record<string, string> = {
  mon: "Monday", monday: "Monday",
  tue: "Tuesday", tuesday: "Tuesday",
  wed: "Wednesday", wednesday: "Wednesday",
  thu: "Thursday", thursday: "Thursday",
  fri: "Friday", friday: "Friday",
  sat: "Saturday", saturday: "Saturday",
  sun: "Sunday", sunday: "Sunday",
};

/** Extracts coordinates actually embedded in a Google Maps URL — never guesses. */
function parseMapsUrlCoords(mapsUrl: string): { latitude: number; longitude: number } | null {
  if (!mapsUrl) return null;
  try {
    const lat = String.raw`-?\d{1,2}(?:\.\d+)?`;
    const lng = String.raw`-?\d{1,3}(?:\.\d+)?`;
    const patterns = [
      new RegExp(`@(${lat}),(${lng})`),
      new RegExp(`!3d(${lat})!4d(${lng})`),
      new RegExp(`[?&]q=(${lat}),(${lng})`),
    ];
    for (const re of patterns) {
      const m = re.exec(mapsUrl);
      if (!m) continue;
      const latitude = Number(m[1]);
      const longitude = Number(m[2]);
      if (Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) return { latitude, longitude };
    }
  } catch {
    /* malformed URL — skip geo */
  }
  return null;
}

function toIsoTime(rawHour: string, rawMinute: string, ampm: string): string | null {
  let hour = Number(rawHour);
  const minute = rawMinute ? Number(rawMinute) : 0;
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 23 || minute > 59) return null;
  const ap = ampm.trim().toLowerCase();
  if (ap === "am" && hour === 12) hour = 0;
  else if (ap === "pm" && hour < 12) hour += 12;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function buildOpeningHours(hours: unknown): OpeningHoursSpec[] {
  if (!hours || typeof hours !== "object") return [];
  const specs: OpeningHoursSpec[] = [];
  for (const [rawKey, rawValue] of Object.entries(hours as Record<string, unknown>)) {
    const day = SCHEMA_DAY_BY_KEY[rawKey.trim().toLowerCase()];
    if (!day || typeof rawValue !== "string") continue;
    const value = rawValue.trim();
    if (!value || /closed/i.test(value)) continue;
    const m = value.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:–|—|-|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (!m) continue;
    const opens = toIsoTime(m[1], m[2] ?? "", m[3] ?? "");
    const closes = toIsoTime(m[4], m[5] ?? "", m[6] ?? "");
    if (!opens || !closes) continue;
    specs.push({ "@type": "OpeningHoursSpecification", dayOfWeek: `https://schema.org/${day}`, opens, closes });
  }
  return specs;
}

/** Builds a minimal, valid LocalBusiness JSON-LD object from the business payload. */
function buildLocalBusinessJsonLd(business: SitePayload["business"]): string | null {
  try {
    const images = [business.coverUrl, business.logoUrl].map((u) => (u || "").trim()).filter(Boolean);
    const streetAddress = (business.address || "").trim();
    const addressLocality = (business.city || "").trim();

    const ld: Record<string, unknown> = {
      "@context": "https://schema.org",
      // The most specific type the category maps to — "Dentist", "Electrician",
      // "Restaurant" — falling back to LocalBusiness. A generic type is the
      // least a page can say about itself, and local/AI results read the
      // specific one to decide which questions this business answers.
      "@type": schemaTypeFor(business.category),
      name: business.name,
      description: business.description || usableTagline(business.tagline) || undefined,
      // The published site lives at /s/<slug> on the configured origin. The
      // old hardcoded host pointed structured data at a URL that does not serve
      // this business, which is worse than omitting it.
      url: `${siteOrigin()}/s/${business.slug}`,
    };
    if (images.length) ld.image = images.length === 1 ? images[0] : images;
    if ((business.phone || "").trim()) ld.telephone = business.phone.trim();
    if ((business.email || "").trim()) ld.email = business.email.trim();
    if (streetAddress || addressLocality) {
      ld.address = {
        "@type": "PostalAddress",
        streetAddress: streetAddress || undefined,
        addressLocality: addressLocality || undefined,
        addressRegion: (business.state || "").trim() || undefined,
        postalCode: (business.pincode || "").trim() || undefined,
        addressCountry: "IN",
      };
    }
    const geo = parseMapsUrlCoords((business.mapsUrl || "").trim());
    if (geo) ld.geo = { "@type": "GeoCoordinates", ...geo };
    const openingHours = buildOpeningHours(business.hours);
    if (openingHours.length) ld.openingHoursSpecification = openingHours;
    const sameAs = Object.values(business.socials || {})
      .filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u.trim()))
      .map((u) => u.trim());
    // The Google Business Profile belongs here too: sameAs is how a page says
    // "that listing and this site are the same business", which is exactly the
    // link local search is trying to establish.
    const gmb = (business.gmbUrl || "").trim();
    if (gmb && /^https?:\/\//i.test(gmb) && !sameAs.includes(gmb)) sameAs.push(gmb);
    if (sameAs.length) ld.sameAs = sameAs;

    // A link to the listing on Google, which is a distinct property from the
    // embedded map and is what "Directions" resolves to.
    const mapsUrl = (business.mapsUrl || "").trim();
    if (/^https?:\/\//i.test(mapsUrl)) ld.hasMap = mapsUrl;

    // Where they actually work. For a service business this is the difference
    // between "a shop in Satara" and "an electrician who covers Satara".
    const area = [business.city, business.state].map((v) => (v || "").trim()).filter(Boolean);
    if (area.length) {
      ld.areaServed = area.map((name) => ({ "@type": "Place", name }));
    }
    return jsonLdScript(ld); // undefined values are dropped → valid JSON
  } catch {
    return null;
  }
}


/**
 * The services and products the page already lists, as structured data.
 *
 * Only what is visible on the page is marked up — marking up content the reader
 * cannot see is the one thing Google treats as manipulation rather than as an
 * error. So this reads the same rows the sections render.
 *
 * Prices are deliberately conservative: a service's price is free text ("from
 * ₹500", "on request"), so it is emitted only when it is a plain number. A
 * wrong price in structured data is worse than no price — it is what a customer
 * will hold the business to.
 */
function buildCatalogueJsonLd(payload: SitePayload, siteUrl: string): string | null {
  try {
    const items: Record<string, unknown>[] = [];

    for (const service of payload.services || []) {
      const name = (service.name || "").trim();
      if (!name) continue;
      const entry: Record<string, unknown> = {
        "@type": "Service",
        name,
        description: (service.description || "").trim() || undefined,
        provider: { "@type": "LocalBusiness", name: payload.business.name, url: siteUrl },
      };
      if (service.image) entry.image = service.image;
      const price = Number(String(service.price || "").replace(/[^0-9.]/g, ""));
      if (Number.isFinite(price) && price > 0 && /^[₹\s]*[\d,.]+$/.test(String(service.price || "").trim())) {
        entry.offers = { "@type": "Offer", price, priceCurrency: "INR" };
      }
      items.push(entry);
    }

    for (const product of payload.products || []) {
      const name = (product.name || "").trim();
      if (!name) continue;
      const entry: Record<string, unknown> = {
        "@type": "Product",
        name,
        description: (product.shortDesc || product.description || "").trim() || undefined,
        sku: (product.sku || "").trim() || undefined,
      };
      if (product.image) entry.image = product.image;
      // hidePrice is the owner saying "ask me" — repeating the number in the
      // markup would publish exactly what they chose not to show.
      const amount = product.salePrice ?? product.price;
      if (!product.hidePrice && typeof amount === "number" && amount > 0) {
        entry.offers = {
          "@type": "Offer",
          price: amount,
          priceCurrency: "INR",
          availability: "https://schema.org/InStock",
          url: siteUrl,
        };
      }
      items.push(entry);
    }

    if (!items.length) return null;
    return jsonLdScript({
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: items.map((item, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item,
      })),
    });
  } catch {
    return null;
  }
}

/** FAQPage JSON-LD built from whichever FAQ section the site is showing. */
function buildFaqJsonLd(sections: SiteSection[]): string | null {
  const faq = sections.find((s) => s.type === "faq");
  const items = (faq?.content?.items as { question?: string; answer?: string }[] | undefined) || [];
  const entities = items
    .filter((i) => (i.question || "").trim() && (i.answer || "").trim())
    .slice(0, 20)
    .map((i) => ({
      "@type": "Question",
      name: String(i.question).trim(),
      acceptedAnswer: { "@type": "Answer", text: String(i.answer).trim() },
    }));
  if (!entities.length) return null;
  try {
    return jsonLdScript({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: entities });
  } catch {
    return null;
  }
}

interface SiteRendererProps {
  payload: SitePayload;
  mode?: "live" | "preview";
  device?: Device;
  /**
   * The freeform editor renders the very same page it will publish, with each
   * section outlined and clickable. Nothing about the markup changes except the
   * outline and the link behaviour — editing what you see is only honest if what
   * you see is what ships.
   */
  editing?: boolean;
  /** The section the inspector is currently editing. */
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}

export default function SiteRenderer({
  payload, mode = "live", device = "desktop", editing = false, selectedId = null, onSelect,
}: SiteRendererProps) {
  const { business, website, services, products, gallery, testimonials, faqs, blogPosts } = payload;
  const baseSections = useMemo(
    () =>
      (website.sections || [])
        .filter((s) => s.visible !== false)
        .map((s) =>
          s.type === "hero" && s.content?.heroStyle === undefined
            ? { ...s, content: { ...s.content, heroStyle: website.theme?.heroStyle || "gradient" } }
            : s,
        ),
    [website.sections, website.theme],
  );
  const trackedVisit = useRef(false);
  // The A/B test running on this site, if any. The visitor's variant is decided
  // by a hash of their own id, so the same person always sees the same headline
  // — and it is applied after mount rather than during render, so the HTML the
  // server sent and the HTML the client first renders are identical.
  const experiment = useMemo(() => {
    const raw = website.theme?.experiments;
    if (!raw || raw.status !== "running" || raw.variants?.length < 2) return null;
    return raw;
  }, [website.theme?.experiments]);
  // One test, one assignment: which variant this visitor got, and the sections
  // that go with it.
  const [ab, setAb] = useState<{ key: string; variant: "a" | "b"; sections: SiteSection[] } | null>(null);
  /**
   * What every event from this page carries: the A/B test the visitor is in
   * (without it the owner would see two headlines in the dashboard and no way
   * to tell which one earned the work) and which visit it happened in (without
   * it the dashboard can count actions but cannot say that one visit did four
   * of them, or that the enquiry came from the visit that tapped WhatsApp).
   */
  const abMeta = useCallback(
    (): { experiment?: string; variant?: string; visitor?: string; visit?: string } => {
      const ids = visitMeta();
      return {
        ...(experiment && ab ? { experiment: String(experiment.key), variant: ab.variant } : {}),
        ...(ids.visit ? { visitor: ids.visitor, visit: ids.visit } : {}),
      };
    },
    [experiment, ab],
  );
  // Until the visitor's variant is known, the page renders exactly what the
  // owner approved — the control is the real page, not a copy of it.
  const sections = ab?.sections ?? baseSections;
  const [menuOpen, setMenuOpen] = useState(false);
  // Which service/product the visitor clicked "Enquire" on, so the contact form
  // arrives pre-filled and the lead records what they actually asked about.
  const [enquirySubject, setEnquirySubject] = useState("");
  const jsonLd = useMemo(() => buildLocalBusinessJsonLd(business), [business]);
  // FAQPage markup is what actually earns the "answer engine" placement the
  // product promises — the questions were already on the page, unmarked.
  const faqJsonLd = useMemo(() => buildFaqJsonLd(sections), [sections]);
  // Services and products, so a search for one of them can reach this page.
  const catalogueJsonLd = useMemo(
    () => buildCatalogueJsonLd(payload, `${siteOrigin()}/s/${business.slug}`),
    [payload, business.slug],
  );
  // Derived from the owner's own hours; "unknown" renders nothing.
  const hours = useMemo(() => openStatus(business.hours), [business.hours]);

  useEffect(() => {
    if (!experiment || mode === "preview") return;
    // Which variant this visitor gets comes from localStorage (their own stable
    // id) — an external store that cannot be read during render without
    // breaking hydration, so the read and the state it produces belong in this
    // effect rather than in the render.
    const applied = applyVariant(baseSections, experiment, visitorId());
    if (!applied.applied) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAb({ ...applied.applied, sections: applied.sections });
  }, [experiment, baseSections, mode]);

  // theme → CSS variables. Every value is optional, so a site published before
  // the Design DNA existed keeps the exact look it had.
  const themeVars = useMemo(() => {
    const radius = RADIUS_MAP[website.theme?.radius || "rounded"];
    const font = FONT_MAP[website.theme?.font || "modern"];
    const shadow = SHADOW_MAP[website.theme?.shadow || "soft"];
    const spacing = SPACING_MAP[website.theme?.spacing || "normal"];
    const button = BUTTON_MAP[website.theme?.button || "solid"];
    const treatment = website.theme?.imageTreatment || "plain";
    return {
      "--brand-primary": business.brandPrimary,
      "--brand-secondary": business.brandSecondary,
      "--brand-accent": business.brandAccent,
      "--brand-radius": radius.sm,
      "--brand-radius-lg": radius.lg,
      "--brand-font-heading": font.heading,
      "--brand-font-body": font.body,
      "--brand-surface": "#f8f7f4",
      "--brand-border": "#e7e5e4",
      "--brand-muted": "#78716c",
      "--brand-body": "#44403c",
      // Section headings read from their own tokens so a section the owner has
      // painted dark can flip just the heading colours — the card copy inside it
      // keeps using --brand-secondary / --brand-muted and stays readable on the
      // white cards it actually sits on.
      "--brand-heading": business.brandSecondary,
      "--brand-subheading": "#78716c",
      // Design DNA
      "--brand-shadow": shadow,
      "--brand-card-shadow": website.theme?.cardStyle === "flat" ? "none" : shadow,
      "--brand-card-ring": website.theme?.cardStyle === "outline" ? "1px solid var(--brand-border)" : "none",
      "--brand-section-pad": spacing.section,
      "--brand-gap": spacing.gap,
      "--brand-button-radius": button.radius,
      "--brand-button-shadow": button.shadow,
      "--brand-image-filter": treatment === "duotone" ? "saturate(0.72) contrast(1.04)" : "none",
      "--brand-image-radius": treatment === "framed" ? "0px" : "var(--brand-radius-lg)",
      "--brand-image-ring": treatment === "framed" ? "1px solid var(--brand-border)" : "none",
      "--brand-image-pad": treatment === "framed" ? "10px" : "0px",
    } as React.CSSProperties;
  }, [business, website.theme]);

  // track visit (live only)
  useEffect(() => {
    if (mode !== "live" || trackedVisit.current) return;
    trackedVisit.current = true;
    api.post("/api/analytics/event", { slug: business.slug, type: "VISIT", path: "/", ...abMeta() }).catch(() => {});
  }, [mode, business.slug, abMeta]);

  function track(type: string) {
    if (mode !== "live") return;
    api.post("/api/analytics/event", { slug: business.slug, type, path: "/", ...abMeta() }).catch(() => {});
  }


  async function submitLead(data: {
    name: string; phone: string; email: string; message: string; website: string; serviceName?: string;
  }): Promise<string | null> {
    if (mode === "preview") {
      await new Promise((r) => setTimeout(r, 600));
      return null; // simulate success in preview
    }
    try {
      // The visit the enquiry came from travels with it, so the owner can see
      // what this person looked at before writing in.
      const ids = visitMeta();
      await api.post("/api/leads", {
        slug: business.slug, ...data, source: "FORM",
        ...(ids.visit ? { visitor: ids.visitor, visit: ids.visit } : {}),
      });
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Could not submit enquiry";
    }
  }

  const waNumber = toWaNumber(business.whatsapp || business.phone || "");
  /**
   * The shop, when this business has one. `readCommerce` is the same reader the
   * API validates against, so the delivery charge shown here is the charge the
   * server will apply — an owner cannot configure a rule the cart renders
   * differently, because there is exactly one implementation of that rule.
   */
  const commerce = useMemo(() => payload.commerce ?? readCommerce(undefined), [payload.commerce]);
  const cart = useCart(business.slug, products, commerce);
  const [cartOpen, setCartOpen] = useState(false);
  const inCart = useMemo(
    () => Object.fromEntries(cart.lines.map((line) => [line.productId, line.qty])),
    [cart.lines],
  );
  const containerWidth = website.theme?.containerWidth === "wide" ? "max-w-7xl" : "max-w-6xl";
  const hasPayment = Boolean(business.upiId || business.paymentQrUrl);
  /**
   * Scroll to a section instead of letting the browser change the hash.
   *
   * The dashboard and the shareable link both run this page under a hash route
   * (#/site/<slug>), so a plain href="#services" replaced the whole route and
   * dropped the visitor on the WebSetu landing page. Anchors are kept in the
   * markup for accessibility and no-JS, but the click is handled here.
   */
  function jump(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
    const id = href.replace(/^#/, "");
    if (!id) return;
    e.preventDefault();
    const root = e.currentTarget.closest(".site-renderer");
    const target = id === "top" ? null : (root ?? document).querySelector(`#${CSS.escape(id)}`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      // "Top", or a section that is not on the page — go to the top of the site
      // itself, which is not always the top of the window in the preview.
      (root ?? document.body).scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  // A section with nothing in it renders nothing, so linking to it scrolled the
  // visitor to the top of the page instead — "Testimonials" on a site with no
  // reviews yet looked like a broken link. The menu only offers what is there.
  const sectionHasContent: Record<string, boolean> = {
    services: services.length > 0,
    products: products.length > 0,
    gallery: gallery.length > 0,
    testimonials: testimonials.length > 0,
    faq: faqs.length > 0,
    payment: hasPayment,
    contact: true,
    about: true,
  };

  const navLinks = sections
    .filter((s) => ["services", "products", "gallery", "testimonials", "faq", "payment", "contact", "about"].includes(s.type))
    .filter((s) => s.visible !== false)
    .filter((s) => sectionHasContent[s.type])
    .map((s) => ({
      href: `#${s.type === "about" ? "top" : s.type}`,
      label: s.type === "whyUs" ? "Why Us" : s.type === "payment" ? "Pay Now" : s.type.charAt(0).toUpperCase() + s.type.slice(1),
    }));

  // Motion intensity from the genome (0–4). Anything above 3 is capped: past
  // that a page stops feeling alive and starts feeling noisy, and the cost on a
  // mid-range phone is real. A site with no DNA reads as level 2, which is what
  // every existing site does today.
  const animLevel = Math.max(0, Math.min(3, website.theme?.motion?.level ?? 2));
  // Header arrangement from the genome. "sticky" is what every existing site
  // does, so an absent value keeps the current behaviour exactly.
  const headerStyle = website.theme?.header || "sticky";
  const deviceWidth = device === "mobile" ? "max-w-[420px]" : device === "tablet" ? "max-w-[820px]" : "max-w-full";
  // The preview sits inside the dashboard's own <main>; nesting landmarks
  // breaks assistive navigation, so only the live site gets the landmark.
  const SectionsRoot = mode === "preview" ? "div" : "main";

  return (
    <div
      style={themeVars}
      data-anim={animLevel}
      className={`site-renderer mx-auto w-full ${deviceWidth} bg-white font-[family-name:var(--brand-font-body)] transition-all duration-300`}
    >
      {/* Without this the sticky header covers the heading we just jumped to. */}
      <style>{".site-renderer [id]{scroll-margin-top:76px}"}</style>
      {/* SEO: schema.org LocalBusiness structured data */}
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />}
      {faqJsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLd }} />}
      {catalogueJsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: catalogueJsonLd }} />}

      {/* Keyboard users land here first; the nav is long on a phone. */}
      <a
        href="#top"
        onClick={(e) => jump(e, "#top")}
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-[var(--brand-radius)] focus:bg-[var(--brand-primary)] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>

      {/* HEADER */}
      <header
        className={`${
          headerStyle === "sticky" ? "sticky top-0" : headerStyle === "topbar" ? "sticky top-0 bg-[var(--brand-secondary)]" : "relative"
        } z-40 border-b border-[var(--brand-border)] bg-white/90 backdrop-blur`}
      >
        <div className={`mx-auto flex ${containerWidth} items-center justify-between gap-4 px-4 py-3 sm:px-6`}>
          <a href="#top" onClick={(e) => jump(e, "#top")} className="flex min-w-0 items-center gap-2.5">
            {business.logoUrl ? (

              // The one picture on a tenant site that still bypassed the
              // optimiser: everything else already goes through SiteImage, so
              // the shop's logo was the lone original upload being sent down
              // the wire at full size — in the header, on every page, to every
              // visitor. It also had no dimensions, so the header reflowed once
              // it arrived.
              <SiteImage
                src={business.logoUrl}
                alt={`${business.name} logo`}
                wrapperClassName="h-9 w-9 shrink-0 rounded-[var(--brand-radius)]"
                className="object-cover"
                sizes="36px"
                priority
              />
            ) : (
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--brand-radius)] font-bold text-white"
                style={{ background: `linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))` }}
              >
                {business.name.charAt(0)}
              </span>
            )}
            <span className="min-w-0">
              <span
                className={`block truncate font-bold ${headerStyle === "topbar" ? "text-white" : "text-[var(--brand-secondary)]"}`}
                style={{ fontFamily: "var(--brand-font-heading)" }}
              >
                {business.name}
              </span>
              {hours.state !== "unknown" && (
                <span className="flex items-center gap-1.5 text-[11px] font-medium">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${hours.state === "open" ? "bg-emerald-500" : "bg-zinc-400"}`}
                    aria-hidden="true"
                  />
                  <span className={hours.state === "open" ? "text-emerald-700" : "text-[var(--brand-muted)]"}>
                    {hours.label}
                  </span>
                </span>
              )}
            </span>
          </a>

          <nav className="hidden items-center gap-5 md:flex" aria-label="Site navigation">
            {navLinks.map((l) => (
              <a
                key={l.label}
                href={l.href}
                onClick={(e) => jump(e, l.href)}
                className="rounded text-sm font-medium text-[var(--brand-body)] transition hover:text-[var(--brand-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2"
              >
                {l.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <a
              href={`tel:${business.phone}`}
              onClick={() => track("CTA_CALL")}
              className="hidden items-center gap-2 rounded-[var(--brand-radius)] bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-95 sm:inline-flex"
            >
              <Phone className="h-4 w-4" aria-hidden="true" /> {business.phone}
            </a>
            {/* Phones had no navigation at all before this. */}
            {navLinks.length > 0 && (
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-expanded={menuOpen}
                aria-controls="site-mobile-nav"
                aria-label={menuOpen ? "Close menu" : "Open menu"}
                className="flex h-10 w-10 items-center justify-center rounded-[var(--brand-radius)] text-[var(--brand-secondary)] ring-1 ring-[var(--brand-border)] transition hover:bg-[var(--brand-surface)] md:hidden"
              >
                {menuOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
              </button>
            )}
          </div>
        </div>

        {menuOpen && (
          <nav
            id="site-mobile-nav"
            aria-label="Site navigation"
            className="border-t border-[var(--brand-border)] bg-white md:hidden"
          >
            <ul className={`mx-auto ${containerWidth} px-4 py-2 sm:px-6`}>
              {navLinks.map((l) => (
                <li key={l.label}>
                  <a
                    href={l.href}
                    onClick={(e) => { setMenuOpen(false); jump(e, l.href); }}
                    className="block border-b border-[var(--brand-border)] py-3 text-sm font-medium text-[var(--brand-body)] last:border-0"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
              <li className="py-3">
                <a
                  href={`tel:${business.phone}`}
                  onClick={() => { track("CTA_CALL"); setMenuOpen(false); }}
                  className="flex items-center justify-center gap-2 rounded-[var(--brand-radius)] bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-semibold text-white"
                >
                  <Phone className="h-4 w-4" aria-hidden="true" /> {business.phone}
                </a>
              </li>
            </ul>
          </nav>
        )}
      </header>

      {/* SECTIONS */}
      {/* In the dashboard preview this sits inside the dashboard's own <main>,
          and nesting landmarks breaks assistive navigation — so the preview
          gets a plain container while the live site keeps the landmark. */}
      <SiteReveal />
      <SectionsRoot id="top">
        {sections.map((section) => {
          // The owner's own style for this section, if they set one. It travels
          // with the published page, so the wrapper is not an editing artifact:
          // it is where the background, the padding and the column count live.
          const style = readSectionStyle(section);
          const attrs = styleAttributes(style);
          const body = renderSection(section, {
          business, services, products, gallery, testimonials, faqs, track, submitLead,
          blogPosts, businessSlug: business.slug,
          heroStyle: website.theme?.heroStyle || "gradient",
          scene: website.theme?.motif === "none" ? null : resolveIndustry(business.category, website.theme?.industry).motif.scene,
          // Same trade, same scene — but a different arrangement of it per
          // business, so two gyms do not run the identical animation.
          sceneVariant: seedFrom(`${business.slug}::scene`),
          // Same sections, arranged differently: which side the About photo
          // sits on, how many service cards sit across a row.
          layout: seedFrom(`${business.slug}::layout`),
          onEnquire: (subject: string) => {
            setEnquirySubject(subject);
            document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });
          },
          enquirySubject,
          hoursLabel: hours.detail,
          onAddToCart: commerce.enabled
            ? (productId: string) => {
                cart.add(productId);
                track("CART_ADD");
                setCartOpen(true);
              }
            : undefined,
          inCart,
          });
          if (!editing && Object.keys(attrs).length === 0) return body;
          const selected = editing && selectedId === section.id;
          return (
            <div
              key={section.id}
              data-ws-section={editing ? section.id : undefined}
              {...attrs}
              className={
                editing
                  ? `relative outline-dashed outline-1 transition-[outline-color] ${
                      selected
                        ? "outline-2 outline-emerald-500"
                        : "outline-zinc-400/50 hover:outline-emerald-400"
                    }`
                  : undefined
              }
              onClick={
                editing
                  ? (e) => {
                      e.preventDefault();
                      onSelect?.(section.id);
                    }
                  : undefined
              }
              // In the editor a click is a selection, never a navigation — a link
              // that opened WhatsApp mid-edit would be a trap.
              onClickCapture={
                editing
                  ? (e) => {
                      const anchor = (e.target as HTMLElement).closest("a");
                      if (anchor) e.preventDefault();
                    }
                  : undefined
              }
            >
              {body}
              {editing && (
                <span
                  className={`pointer-events-none absolute left-2 top-2 z-20 rounded-md px-2 py-0.5 text-[11px] font-semibold shadow-sm ${
                    selected ? "bg-emerald-600 text-white" : "bg-white/90 text-zinc-600"
                  }`}
                >
                  {typeLabel(section.type)}
                </span>
              )}
            </div>
          );
        })}
      </SectionsRoot>

      {commerce.enabled && (
        <>
          <CartBar cart={cart} onOpen={() => setCartOpen(true)} onTrack={`/s/${business.slug}/order`} />
          <CheckoutSheet
            open={cartOpen}
            onClose={() => setCartOpen(false)}
            cart={cart}
            business={business}
            products={products}
            settings={commerce}
            slug={business.slug}
            preview={mode === "preview"}
            onPlaced={() => setCartOpen(true)}
          />
        </>
      )}

      {/* FOOTER */}
      <footer className="bg-[var(--brand-secondary)] text-white">
        <div className={`mx-auto ${containerWidth} px-4 py-12 sm:px-6`}>
          <div className="grid gap-10 md:grid-cols-3">
            <div>
              <div className="flex items-center gap-2.5">
                {business.logoUrl ? (
                   
                  <SiteImage
                    src={business.logoUrl}
                    alt={`${business.name} logo`}
                    wrapperClassName="h-9 w-9 shrink-0 rounded"
                    className="object-cover"
                    sizes="36px"
                  />
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded bg-white/10 font-bold">{business.name.charAt(0)}</span>
                )}
                <span className="font-bold text-lg">{business.name}</span>
              </div>
              {usableTagline(business.tagline) && (
                <p className="mt-3 max-w-xs text-sm text-white/70">{usableTagline(business.tagline)}</p>
              )}
              <div className="mt-4 flex gap-3">
                {Object.entries(business.socials || {}).filter(([, v]) => v).map(([k, v]) => (
                  <a key={k} href={v as string} target="_blank" rel="noreferrer" aria-label={k}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/25">
                    {k === "facebook" && <Facebook className="h-4 w-4" />}
                    {k === "instagram" && <Instagram className="h-4 w-4" />}
                    {k === "youtube" && <Youtube className="h-4 w-4" />}
                    {k === "linkedin" && <Linkedin className="h-4 w-4" />}
                    {k === "x" && <Twitter className="h-4 w-4" />}
                    {k === "pinterest" && <Globe className="h-4 w-4" />}
                  </a>
                ))}
              </div>
            </div>
            <div>
              <h3 className="font-semibold">Quick Links</h3>
              <ul className="mt-3 space-y-2 text-sm text-white/70">
                {navLinks.slice(0, 6).map((l) => (
                  <li key={l.label}>
                    <a href={l.href} onClick={(e) => jump(e, l.href)} className="hover:text-white">{l.label}</a>
                  </li>
                ))}
                {/* Where a customer who has already ordered finds their order
                    again. The cart bar only exists while the cart has items, so
                    without this the tracking page would be reachable exactly
                    once - on the confirmation screen of the order itself. */}
                {commerce.enabled && (
                  <li>
                    <a href={`/s/${business.slug}/order`} className="hover:text-white">Track your order</a>
                  </li>
                )}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold">Contact</h3>
              <ul className="mt-3 space-y-2 text-sm text-white/70">
                {business.phone && <li className="flex items-center gap-2"><Phone className="h-4 w-4 shrink-0" /> {business.phone}</li>}
                {business.email && <li className="flex items-center gap-2"><Mail className="h-4 w-4 shrink-0" /> {business.email}</li>}
                {business.address && <li className="flex items-start gap-2"><MapPinIcon /> {business.address}, {business.city} {business.pincode}</li>}
                {business.gmbUrl && (
                  <li>
                    <a href={business.gmbUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-white/90 hover:text-white">
                      <Star className="h-4 w-4 text-[var(--brand-accent)]" /> View us on Google
                    </a>
                  </li>
                )}
              </ul>
            </div>
          </div>
          <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-white/15 pt-6 text-xs text-white/50 sm:flex-row">
            <p>© {new Date().getFullYear()} {business.name}. All rights reserved.</p>
            <p className="inline-flex items-center gap-1.5">
              {payload.trialMode && <><Moon className="h-3.5 w-3.5" /> Trial mode • </>}
              Built with <span className="font-semibold text-white/80">{payload.credit ?? "WebSetu"}</span>
            </p>
          </div>
        </div>
      </footer>

      {/* On phones a bar converts better than floating circles and never covers
          content the way two FABs did; desktop keeps a single WhatsApp button. */}
      <div className="h-16 sm:hidden" aria-hidden="true" />
      <div className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-3 border-t border-black/10 bg-white/95 backdrop-blur sm:hidden">
        <a
          href={`tel:${business.phone}`}
          onClick={() => track("CTA_CALL")}
          className="flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-semibold text-white"
          style={{ background: "var(--brand-primary)" }}
        >
          <Phone className="h-5 w-5" aria-hidden="true" /> Call
        </a>
        {waNumber ? (
          <a
            href={`https://wa.me/${waNumber}?text=${encodeURIComponent(`Hello ${business.name}, I have an enquiry.`)}`}
            target="_blank"
            rel="noreferrer"
            onClick={() => track("CTA_WHATSAPP")}
            // Palette, not WhatsApp's #25D366 — see the note on the floating
            // button below.
            className="flex flex-col items-center justify-center gap-0.5 bg-[var(--brand-secondary)] py-2.5 text-[11px] font-semibold text-white"
          >
            <MessageCircle className="h-5 w-5" aria-hidden="true" /> WhatsApp
          </a>
        ) : (
          <a
            href="#contact"
            onClick={(e) => jump(e, "#contact")}
            className="flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-semibold text-[var(--brand-secondary)]"
          >
            <Mail className="h-5 w-5" aria-hidden="true" /> Enquire
          </a>
        )}
        <a
          href={business.mapsUrl || `https://maps.google.com/?q=${encodeURIComponent(`${business.name} ${business.address} ${business.city}`)}`}
          target="_blank"
          rel="noreferrer"
          onClick={() => track("CTA_DIRECTIONS")}
          className="flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-semibold text-[var(--brand-secondary)]"
        >
          <MapPin className="h-5 w-5" aria-hidden="true" /> Directions
        </a>
      </div>

      {waNumber && (
        <a
          href={`https://wa.me/${waNumber}?text=${encodeURIComponent(`Hello ${business.name}, I have an enquiry.`)}`}
          target="_blank"
          rel="noreferrer"
          onClick={() => track("CTA_WHATSAPP")}
          aria-label="Chat on WhatsApp"
          // The brand colour, not WhatsApp's #25D366. That green is instantly
          // recognisable, which is the argument for keeping it — but it was
          // landing as a bright green blob on sites the owner had deliberately
          // made terracotta, or indigo, or maroon. The owner's palette wins;
          // the WhatsApp glyph still says what the button is.
          //
          // The SECONDARY colour rather than the primary, for all three of the
          // WhatsApp surfaces. Every palette's secondary is a deep shade, so a
          // white glyph is always legible on it; eight of the built-in primaries
          // (Mint Studio is 2.5:1) are too light to carry white at all.
          className="fixed bottom-5 right-5 z-50 hidden h-14 w-14 items-center justify-center rounded-full bg-[var(--brand-secondary)] text-white shadow-2xl transition hover:scale-110 active:scale-95 sm:flex"
        >
          <MessageCircle className="h-7 w-7" aria-hidden="true" />
        </a>
      )}

      {/* Back to top — live site only (hidden in the dashboard builder preview).
          Sits above the mobile action bar, bottom-left on desktop. */}
      {mode === "live" && <BackToTop />}
    </div>
  );
}

function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Back to top"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className={`fixed bottom-[4.75rem] left-5 z-40 flex h-10 w-10 items-center justify-center rounded-full text-white shadow-lg transition-all duration-300 hover:brightness-110 active:scale-90 sm:bottom-5 ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
      }`}
      style={{ background: "var(--brand-primary)" }}
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}

function MapPinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 h-4 w-4 shrink-0">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function renderSection(
  section: SiteSection,
  ctx: {
    business: SitePayload["business"];
    services: SitePayload["services"];
    products: SitePayload["products"];
    gallery: SitePayload["gallery"];
    testimonials: SitePayload["testimonials"];
    faqs: SitePayload["faqs"];
    blogPosts: SitePayload["blogPosts"];
    businessSlug: string;
    /** Present only when the shop takes orders online. */
    onAddToCart?: (productId: string) => void;
    inCart?: Record<string, number>;
    track: (type: string) => void;
    submitLead: (data: {
      name: string; phone: string; email: string; message: string; website: string; serviceName?: string;
    }) => Promise<string | null>;
    onEnquire: (subject: string) => void;
    enquirySubject: string;
    hoursLabel: string;
    heroStyle: string;
    scene: SceneKind | null;
    sceneVariant: number;
    layout: number;
  },
) {
  switch (section.type) {
    case "hero":
      return (
        <Hero
          key={section.id}
          section={section}
          business={ctx.business}
          onCta={ctx.track}
          hoursLabel={ctx.hoursLabel}
          heroStyle={ctx.heroStyle}
          scene={ctx.scene}
          sceneVariant={ctx.sceneVariant}
          chips={ctx.services.slice(0, 8).map((sv) => sv.name)}
        />
      );
    case "stats": return <Stats key={section.id} section={section} />;
    case "about": return <About key={section.id} section={section} layout={ctx.layout} />;
    case "services": return <Services key={section.id} section={section} services={ctx.services} onCta={ctx.track} onEnquire={ctx.onEnquire} layout={ctx.layout} business={ctx.business} />;
    case "products":
      return (
        <Products
          key={section.id}
          section={section}
          products={ctx.products}
          onCta={ctx.track}
          onEnquire={ctx.onEnquire}
          business={ctx.business}
          // No shop, no button: `undefined` is how the section knows.
          onAdd={ctx.onAddToCart}
          inCart={ctx.inCart}
        />
      );
    case "whyUs": return <WhyUs key={section.id} section={section} />;
    case "gallery": return <Gallery key={section.id} section={section} gallery={ctx.gallery} />;
    case "testimonials": return <Testimonials key={section.id} section={section} testimonials={ctx.testimonials} />;
    case "faq": return <FaqSection key={section.id} section={section} />;
    case "blog": return <BlogTeaser key={section.id} section={section} posts={ctx.blogPosts} businessSlug={ctx.businessSlug} />;
    case "cta": return <CtaBanner key={section.id} section={section} business={ctx.business} onCta={ctx.track} />;
    case "payment": return <Payment key={section.id} section={section} business={ctx.business} onCta={ctx.track} />;
    case "hours": return <Hours key={section.id} section={section} business={ctx.business} status={ctx.hoursLabel} />;
    case "contact": return <Contact key={section.id} section={section} business={ctx.business} onCta={ctx.track} submitLead={ctx.submitLead} subject={ctx.enquirySubject} />;
    default: return null;
  }
}

"use client";
// WebSetu — SiteRenderer: renders a complete tenant website from SitePayload.
// Used in live view + dashboard preview (mode="preview" disables tracking/lead POSTs).
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Phone, Menu, X, Star, Facebook, Instagram, Youtube, Linkedin, Twitter, Globe,
  MessageCircle, ExternalLink, Moon, ArrowUp,
} from "lucide-react";
import { api } from "@/lib/api-client";
import type { SitePayload, SiteSection, SiteTheme } from "@/lib/types";
import {
  Hero, Stats, About, Services, Products, WhyUs, Gallery, Testimonials,
  FaqSection, CtaBanner, Payment, Hours, Contact,
} from "@/components/site/sections";

export type Device = "desktop" | "tablet" | "mobile";

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
      "@type": "LocalBusiness",
      name: business.name,
      description: business.description || business.tagline || undefined,
      url: `https://websetu.in/${business.slug}`,
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
    if (sameAs.length) ld.sameAs = sameAs;
    return JSON.stringify(ld); // undefined values are dropped → valid JSON
  } catch {
    return null;
  }
}

interface SiteRendererProps {
  payload: SitePayload;
  mode?: "live" | "preview";
  device?: Device;
}

export default function SiteRenderer({ payload, mode = "live", device = "desktop" }: SiteRendererProps) {
  const { business, website, services, products, gallery, testimonials, faqs, blogPosts } = payload;
  const sections = useMemo(
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
  const jsonLd = useMemo(() => buildLocalBusinessJsonLd(business), [business]);

  // theme → CSS variables
  const themeVars = useMemo(() => {
    const radius = RADIUS_MAP[website.theme?.radius || "rounded"];
    const font = FONT_MAP[website.theme?.font || "modern"];
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
    } as React.CSSProperties;
  }, [business, website.theme]);

  // track visit (live only)
  useEffect(() => {
    if (mode !== "live" || trackedVisit.current) return;
    trackedVisit.current = true;
    api.post("/api/analytics/event", { slug: business.slug, type: "VISIT", path: "/" }).catch(() => {});
  }, [mode, business.slug]);

  function track(type: string) {
    if (mode !== "live") return;
    api.post("/api/analytics/event", { slug: business.slug, type, path: "/" }).catch(() => {});
  }

  async function submitLead(data: { name: string; phone: string; email: string; message: string }): Promise<string | null> {
    if (mode === "preview") {
      await new Promise((r) => setTimeout(r, 600));
      return null; // simulate success in preview
    }
    try {
      await api.post("/api/leads", { slug: business.slug, ...data, source: "FORM" });
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Could not submit enquiry";
    }
  }

  const waNumber = (business.whatsapp || business.phone || "").replace(/[^\d]/g, "");
  const containerWidth = website.theme?.containerWidth === "wide" ? "max-w-7xl" : "max-w-6xl";
  const hasPayment = Boolean(business.upiId || business.paymentQrUrl);
  const navLinks = sections
    .filter((s) => ["services", "products", "gallery", "testimonials", "faq", "payment", "contact", "about"].includes(s.type))
    .filter((s) => s.type !== "payment" || hasPayment)
    .map((s) => ({
      href: `#${s.type === "about" ? "top" : s.type}`,
      label: s.type === "whyUs" ? "Why Us" : s.type === "payment" ? "Pay Now" : s.type.charAt(0).toUpperCase() + s.type.slice(1),
    }));

  const deviceWidth = device === "mobile" ? "max-w-[420px]" : device === "tablet" ? "max-w-[820px]" : "max-w-full";

  return (
    <div
      style={themeVars}
      className={`site-renderer mx-auto w-full ${deviceWidth} bg-white font-[family-name:var(--brand-font-body)] transition-all duration-300`}
    >
      {/* SEO: schema.org LocalBusiness structured data */}
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />}

      {/* HEADER */}
      <header className="sticky top-0 z-40 border-b border-[var(--brand-border)] bg-white/90 backdrop-blur">
        <div className={`mx-auto flex ${containerWidth} items-center justify-between gap-4 px-4 py-3 sm:px-6`}>
          <a href="#top" className="flex items-center gap-2.5 min-w-0">
            {business.logoUrl ? (
               
              <img src={business.logoUrl} alt={`${business.name} logo`} className="h-9 w-9 rounded-[var(--brand-radius)] object-cover" />
            ) : (
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--brand-radius)] font-bold text-white"
                style={{ background: `linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))` }}
              >
                {business.name.charAt(0)}
              </span>
            )}
            <span className="truncate font-bold text-[var(--brand-secondary)]" style={{ fontFamily: "var(--brand-font-heading)" }}>
              {business.name}
            </span>
          </a>
          <nav className="hidden items-center gap-5 md:flex" aria-label="Site navigation">
            {navLinks.map((l) => (
              <a key={l.label} href={l.href} className="text-sm font-medium text-[var(--brand-body)] transition hover:text-[var(--brand-primary)]">
                {l.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <a
              href={`tel:${business.phone}`}
              onClick={() => track("CTA_CALL")}
              className="hidden sm:inline-flex items-center gap-2 rounded-[var(--brand-radius)] bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-95"
            >
              <Phone className="h-4 w-4" /> {business.phone}
            </a>
          </div>
        </div>
      </header>

      {/* SECTIONS */}
      <main id="top">
        {sections.map((section) => renderSection(section, {
          business, services, products, gallery, testimonials, faqs, track, submitLead,
        }))}
      </main>

      {/* FOOTER */}
      <footer className="bg-[var(--brand-secondary)] text-white">
        <div className={`mx-auto ${containerWidth} px-4 py-12 sm:px-6`}>
          <div className="grid gap-10 md:grid-cols-3">
            <div>
              <div className="flex items-center gap-2.5">
                {business.logoUrl ? (
                   
                  <img src={business.logoUrl} alt={`${business.name} logo`} className="h-9 w-9 rounded object-cover" />
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded bg-white/10 font-bold">{business.name.charAt(0)}</span>
                )}
                <span className="font-bold text-lg">{business.name}</span>
              </div>
              {business.tagline && <p className="mt-3 max-w-xs text-sm text-white/70">{business.tagline}</p>}
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
                  <li key={l.label}><a href={l.href} className="hover:text-white">{l.label}</a></li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold">Contact</h3>
              <ul className="mt-3 space-y-2 text-sm text-white/70">
                {business.phone && <li className="flex items-center gap-2"><Phone className="h-4 w-4 shrink-0" /> {business.phone}</li>}
                {business.email && <li className="flex items-center gap-2"><ExternalLink className="h-4 w-4 shrink-0" /> {business.email}</li>}
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
              Built with <span className="font-semibold text-white/80">WebSetu</span>
            </p>
          </div>
        </div>
      </footer>

      {/* FLOATING CTAs */}
      {waNumber && (
        <a
          href={`https://wa.me/${waNumber}?text=${encodeURIComponent(`Hello ${business.name}, I have an enquiry.`)}`}
          target="_blank"
          rel="noreferrer"
          onClick={() => track("CTA_WHATSAPP")}
          aria-label="Chat on WhatsApp"
          className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-2xl transition hover:scale-110 active:scale-95"
        >
          <MessageCircle className="h-7 w-7" />
        </a>
      )}
      <a
        href={`tel:${business.phone}`}
        onClick={() => track("CTA_CALL")}
        aria-label="Call now"
        className="fixed bottom-5 left-5 z-50 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-2xl transition hover:scale-110 active:scale-95 sm:hidden"
        style={{ background: "var(--brand-primary)" }}
      >
        <Phone className="h-6 w-6" />
      </a>

      {/* Back to top — live site only (hidden in dashboard builder preview).
          Bottom-left on desktop (WhatsApp owns bottom-right); sits above the
          mobile-only call float, which already occupies bottom-left on phones. */}
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
      className={`fixed bottom-[5.75rem] left-5 z-40 flex h-10 w-10 items-center justify-center rounded-full text-white shadow-lg transition-all duration-300 hover:brightness-110 active:scale-90 sm:bottom-5 ${
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
    track: (type: string) => void;
    submitLead: (data: { name: string; phone: string; email: string; message: string }) => Promise<string | null>;
  },
) {
  switch (section.type) {
    case "hero": return <Hero key={section.id} section={section} business={ctx.business} onCta={ctx.track} />;
    case "stats": return <Stats key={section.id} section={section} />;
    case "about": return <About key={section.id} section={section} />;
    case "services": return <Services key={section.id} section={section} services={ctx.services} onCta={ctx.track} />;
    case "products": return <Products key={section.id} section={section} products={ctx.products} onCta={ctx.track} />;
    case "whyUs": return <WhyUs key={section.id} section={section} />;
    case "gallery": return <Gallery key={section.id} section={section} gallery={ctx.gallery} />;
    case "testimonials": return <Testimonials key={section.id} section={section} testimonials={ctx.testimonials} />;
    case "faq": return <FaqSection key={section.id} section={section} />;
    case "cta": return <CtaBanner key={section.id} section={section} business={ctx.business} onCta={ctx.track} />;
    case "payment": return <Payment key={section.id} section={section} business={ctx.business} onCta={ctx.track} />;
    case "hours": return <Hours key={section.id} section={section} business={ctx.business} />;
    case "contact": return <Contact key={section.id} section={section} business={ctx.business} onCta={ctx.track} submitLead={ctx.submitLead} />;
    default: return null;
  }
}

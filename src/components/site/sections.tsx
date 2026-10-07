"use client";
// WebSetu — Section library: renders each website section from its JSON content
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Sparkles, Package, Star, Quote, Phone, Mail, MapPin, Clock, ChevronDown,
  MessageCircle, Send, Loader2, CheckCircle2, Award,
  Play, X, Copy, Check, QrCode as QrIcon, Youtube, ChevronLeft, ChevronRight,
} from "lucide-react";
import QRCode from "react-qr-code";
import type { Business, Service, Product, SiteSection, Testimonial, GalleryItem } from "@/lib/types";
import { upiDeepLink, youtubeId } from "@/lib/site-utils";
import { toWaNumber } from "@/lib/phone-format";
import SiteImage from "@/components/site/site-image";
import HeroScene from "@/components/site/hero-scene";
import { SITE_ICONS } from "@/components/site/industry-icons";
import type { SceneKind } from "@/lib/industries";
import { isToday } from "@/lib/hours";
import { sectionArt } from "@/lib/site-art";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = SITE_ICONS;

function SectionTitle({ title, subtitle, center = true }: { title?: string; subtitle?: string; center?: boolean }) {
  if (!title && !subtitle) return null;
  return (
    <div className={`ws-reveal mb-10 ${center ? "text-center mx-auto max-w-2xl" : ""}`}>
      {title && <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[var(--brand-secondary)]">{title}</h2>}
      {subtitle && <p className="mt-3 text-base md:text-lg text-[var(--brand-muted)]">{subtitle}</p>}
      <div className={`mt-4 h-1 w-16 rounded-full bg-[var(--brand-primary)] ${center ? "mx-auto" : ""}`} />
    </div>
  );
}

// ---------- HERO ----------
/**
 * Where the director's chosen action actually takes the visitor.
 *
 * A clinic's goal is an appointment and a manufacturer's is a quotation, but
 * both are "fill the form" — while a cab's is a phone call and a restaurant's
 * is the menu. The label alone would be decoration, so the destination is
 * resolved here from the business's own details, and the analytics event
 * follows the real action rather than always claiming a call.
 */
export function ctaTarget(
  action: string | undefined,
  business: Business,
  fallback: string,
): { href: string; external: boolean; event: string } {
  const wa = toWaNumber(business.whatsapp || business.phone || "");
  switch (action) {
    case "call":
      return business.phone
        ? { href: `tel:${business.phone}`, external: false, event: "CTA_CALL" }
        : { href: fallback, external: false, event: "CTA_FORM" };
    case "whatsapp":
      return wa
        ? {
            href: `https://wa.me/${wa}?text=${encodeURIComponent(`Hello ${business.name}, I have an enquiry.`)}`,
            external: true,
            event: "CTA_WHATSAPP",
          }
        : { href: fallback, external: false, event: "CTA_FORM" };
    case "directions": {
      const query = [business.name, business.address, business.city, business.pincode].filter(Boolean).join(", ");
      return {
        href: business.mapsUrl || `https://maps.google.com/?q=${encodeURIComponent(query)}`,
        external: true,
        event: "CTA_DIRECTIONS",
      };
    }
    case "menu":
      return { href: "#services", external: false, event: "CTA_MENU" };
    default:
      return { href: fallback, external: false, event: "CTA_FORM" };
  }
}

function Hero({ section, business, onCta, hoursLabel, heroStyle, scene, sceneVariant, chips = [] }: {
  section: SiteSection; business: Business; onCta: (type: string) => void;
  hoursLabel?: string;
  /** This business's own service names, shown as a moving band under the fold. */
  chips?: readonly string[];
  /** The website theme's hero style — the section may override it. */
  heroStyle?: string;
  /** Industry animation shown when there is no cover photo; null when switched off. */
  scene?: SceneKind | null;
  /** Which arrangement of that animation this business gets. */
  sceneVariant?: number;
}) {
  const c = section.content as {
    badge?: string; heading?: string; subheading?: string;
    ctaPrimary?: string; ctaSecondary?: string; image?: string;
    /** What the director decided the primary/secondary button should do. */
    ctaPrimaryAction?: string; ctaSecondaryAction?: string;
  };
  // The Theme panel's "Hero style" used to be ignored here, so choosing Image
  // or Split changed nothing on the live site.
  const style = (section.content?.heroStyle as string) || heroStyle || "gradient";
  const variant = (section.content?.variant as string) || "banner";
  // "editorial" and "centred" are layout directions from the Design DNA; a
  // business with a photo and the "split" style keeps its two-column hero.
  const editorial = variant === "editorial";
  const centred = variant === "centred";
  const image = (c.image || "").trim();
  const split = (variant === "split" || style === "split") && !!image;
  return (
    <section className="relative overflow-hidden">
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(135deg, var(--brand-secondary) 0%, var(--brand-primary) 100%)` }}
      />
      {image && style === "image" && (
        <div className="absolute inset-0">
          { }
          <SiteImage
            src={image}
            alt={business.name}
            wrapperClassName="h-full w-full"
            className="object-cover"
            sizes="100vw"
            priority
          />
          <div className="absolute inset-0" style={{ background: `linear-gradient(100deg, rgba(0,0,0,0.82) 25%, rgba(0,0,0,0.45) 100%)` }} />
        </div>
      )}
      {/* A background image used to be dropped unless the style was "image",
          which made the field look broken. On the gradient style it now shows
          through the brand colours instead of being ignored. */}
      {image && style === "gradient" && (
        <div className="absolute inset-0">
          { }
          <SiteImage
            src={image}
            alt=""
            wrapperClassName="h-full w-full"
            className="object-cover"
            sizes="100vw"
            priority
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--brand-secondary) 88%, transparent) 0%, color-mix(in srgb, var(--brand-primary) 78%, transparent) 100%)",
            }}
          />
        </div>
      )}
      {!image && scene && <HeroScene kind={scene} variant={sceneVariant} />}
      <div
        className={`relative mx-auto max-w-6xl px-4 sm:px-6 ${
          editorial ? "py-24 md:py-36" : "py-20 md:py-28"
        } ${
          split ? "grid items-center gap-10 md:grid-cols-2" : ""
        } ${!split && centred ? "text-center" : ""}`}
      >
        <div className={split ? "" : centred ? "mx-auto max-w-3xl" : editorial ? "max-w-3xl" : "max-w-2xl"}>
          {c.badge && (
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur px-4 py-1.5 text-sm font-medium text-white border border-white/25">
              {c.badge}
            </span>
          )}
          <h1
            className={`mt-5 font-bold text-white leading-tight tracking-tight ${
              centred
                ? "text-4xl md:text-6xl"
                : editorial
                  ? "text-5xl md:text-7xl tracking-[-0.02em]"
                  : "text-4xl md:text-6xl"
            }`}
          >
            {c.heading || business.name}
          </h1>
          {c.subheading && (
            <p className={`mt-5 text-white/85 leading-relaxed ${editorial ? "text-xl md:text-2xl font-light" : "text-lg md:text-xl"}`}>
              {c.subheading}
            </p>
          )}
          <div className={`mt-8 flex flex-wrap gap-3 ${!split && centred ? "justify-center" : ""}`}>
            {(() => {
              const primary = ctaTarget(c.ctaPrimaryAction, business, "#contact");
              const secondary = ctaTarget(c.ctaSecondaryAction, business, `tel:${business.phone}`);
              return (
                <>
                  <a
                    href={primary.href}
                    {...(primary.external ? { target: "_blank", rel: "noreferrer" } : {})}
                    onClick={() => onCta(primary.event)}
                    className="ws-shine rounded-[var(--brand-radius)] bg-[var(--brand-accent)] px-7 py-3.5 text-base font-semibold text-[#1c1917] shadow-lg transition hover:-translate-y-0.5 hover:brightness-110 hover:shadow-xl active:scale-95"
                  >
                    {c.ctaPrimary || "Get a Free Quote"}
                  </a>
                  <a
                    href={secondary.href}
                    {...(secondary.external ? { target: "_blank", rel: "noreferrer" } : {})}
                    onClick={() => onCta(secondary.event)}
                    className="rounded-[var(--brand-radius)] border-2 border-white/60 bg-white/10 backdrop-blur px-7 py-3.5 text-base font-semibold text-white transition hover:-translate-y-0.5 hover:border-white hover:bg-white/20 active:scale-95"
                  >
                    {c.ctaSecondary || "Call Now"}
                  </a>
                </>
              );
            })()}
          </div>
          {/* Only facts the owner supplied — nothing is inferred or invented. */}
          {(business.establishedYear || business.city || business.gmbUrl || hoursLabel) && (
            <ul className={`mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/75 ${!split && centred ? "justify-center" : ""}`}>
              {hoursLabel && (
                <li className="inline-flex items-center gap-1.5">
                  <Clock className="h-4 w-4" aria-hidden="true" /> {hoursLabel}
                </li>
              )}
              {business.establishedYear && (
                <li className="inline-flex items-center gap-1.5">
                  <Award className="h-4 w-4" aria-hidden="true" /> Serving since {business.establishedYear}
                </li>
              )}
              {business.city && (
                <li className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" aria-hidden="true" /> {business.city}
                  {business.state ? `, ${business.state}` : ""}
                </li>
              )}
              {business.gmbUrl && (
                <li>
                  <a
                    href={business.gmbUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 underline-offset-4 hover:text-white hover:underline"
                  >
                    <Star className="h-4 w-4" aria-hidden="true" /> See us on Google
                  </a>
                </li>
              )}
            </ul>
          )}
        </div>
        {split && (
          <div className="relative">
            { }
            <SiteImage
              src={image}
              alt={business.name}
              wrapperClassName="aspect-[4/3] w-full rounded-[var(--brand-radius-lg)] shadow-2xl ring-1 ring-white/20"
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
              priority
            />
          </div>
        )}
      </div>

      {/* A moving band of what this business sells — the thing that makes the
          hand-built sites feel alive. It is built from this business's own
          service names, in its own order, so two shops in one trade do not get
          the same band; the second copy exists only to make the loop seamless
          and is hidden from screen readers. */}
      {chips.length >= 3 && (
        <div className="ws-marquee-wrap relative border-t border-white/15 bg-black/20 py-3">
          <div className="ws-marquee">
            {[0, 1].map((copy) => (
              <div key={copy} className="flex shrink-0 items-center" aria-hidden={copy === 1 ? true : undefined}>
                {chips.map((chip, i) => (
                  <span
                    key={`${copy}-${i}`}
                    className="mx-4 inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80 sm:text-xs"
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--brand-accent)" }} />
                    {chip}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ---------- STATS ----------
/**
 * A stat value that counts up the first time it scrolls into view — the way the
 * hand-built sites do it — while the finished number stays in the HTML, so a
 * crawler, a reader without JavaScript, or a reader who asked for reduced motion
 * sees the real value and nothing else happens.
 *
 * Only the digits animate. Prefixes and suffixes ("24/7", "500+", "100%") are
 * kept exactly as the owner wrote them.
 */
function StatValue({ value, className }: { value: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const el = ref.current;
    const parts = /^(\D*)(\d[\d,]*)(.*)$/.exec(value);
    if (!el || !parts || !("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const target = Number(parts[2].replace(/,/g, ""));
    if (!Number.isFinite(target) || target <= 0) return;

    let frame = 0;
    let started = false;
    const io = new IntersectionObserver(
      (entries) => {
        if (started || !entries.some((e) => e.isIntersecting)) return;
        started = true;
        io.disconnect();
        const from = performance.now();
        const span = 900 + Math.min(900, target);
        setShown(`${parts[1]}0${parts[3]}`);
        const tick = (now: number) => {
          const p = Math.min(1, (now - from) / span);
          const eased = 1 - Math.pow(1 - p, 3);
          setShown(`${parts[1]}${Math.round(target * eased).toLocaleString("en-IN")}${parts[3]}`);
          if (p < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value]);

  return (
    <div ref={ref} className={className}>
      {shown}
    </div>
  );
}

function Stats({ section }: { section: SiteSection }) {
  const items = (section.content?.items as { value: string; label: string }[]) || [];
  const variant = (section.content?.variant as string) || "row";
  if (!items.length) return null;

  if (variant === "cards") {
    return (
      <section className="bg-[var(--brand-surface)] py-14 md:py-16">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-4 sm:px-6 md:grid-cols-4">
          {items.map((s, i) => (
            <div key={i} className="ws-reveal rounded-[var(--brand-radius-lg)] bg-white p-5 text-center ring-1 ring-[var(--brand-border)]">
              <StatValue value={s.value} className="text-2xl font-extrabold text-[var(--brand-primary)] md:text-3xl" />
              <div className="mt-1 text-xs text-[var(--brand-muted)] md:text-sm">{s.label}</div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (variant === "band") {
    // One full-width bar: for businesses whose numbers are the whole pitch.
    return (
      <section className="bg-[var(--brand-secondary)]">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <dl className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {items.map((s, i) => (
              <div key={i} className="ws-reveal text-center">
                <StatValue value={s.value} className="text-3xl font-extrabold text-white md:text-4xl" />
                <dt className="mt-1 text-xs uppercase tracking-wide text-white/70 md:text-sm">{s.label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </section>
    );
  }

  return (
    <section className="border-y border-[var(--brand-border)] bg-[var(--brand-surface)]">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-12 sm:px-6 md:grid-cols-4">
        {items.map((s, i) => (
          <div key={i} className="ws-reveal group text-center">
            <StatValue
              value={s.value}
              className="text-3xl font-extrabold text-[var(--brand-primary)] transition duration-300 group-hover:scale-110 md:text-4xl"
            />
            <div className="mt-1 text-sm text-[var(--brand-muted)]">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------- ABOUT ----------
function About({ section, layout = 0 }: { section: SiteSection; layout?: number }) {
  const c = section.content as { title?: string; body?: string; image?: string };
  const variant = (section.content?.variant as string) || "split";
  // Which side the picture sits on, and whether the two columns are even. Same
  // content, visibly different page.
  const flip = layout % 2 === 1;
  const split = ["md:grid-cols-2", "md:grid-cols-[1.15fr_1fr]", "md:grid-cols-[1fr_1.2fr]"][layout % 3];
  // No photo: the text takes the whole width. There used to be a tinted empty
  // box here to keep the two-column grid balanced, and on a real site it read
  // as a picture that had failed to load — which is exactly what an owner with
  // no cover photo saw, with no way to fix it because the editor had no image
  // field at all.
  const image = (c.image || "").trim();
  const paragraphs = String(c.body || "").split(/\n\s*\n/).filter((t) => t.trim());

  // A story told in steps — good for a business with a history or a process.
  if (variant === "timeline" && paragraphs.length > 1) {
    return (
      <section className="py-16 md:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <SectionTitle title={c.title} center />
          <ol className="relative mt-10 space-y-8 border-l border-[var(--brand-border)] pl-6">
            {paragraphs.map((p, i) => (
              <li key={i} className="ws-reveal relative">
                <span
                  className="absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white"
                  style={{ background: "var(--brand-primary)" }}
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <p className="text-base leading-relaxed text-[var(--brand-body)]">{p}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    );
  }

  // A bento: the image and the first paragraph share the top row, the rest
  // tiles underneath. Denser, more magazine-like.
  if (variant === "bento" && paragraphs.length > 1) {
    return (
      <section className="py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionTitle title={c.title} center={false} />
          <div className="grid gap-5 md:grid-cols-2">
            {image && (
              <div className="overflow-hidden rounded-[var(--brand-radius-lg)] md:row-span-2">
                <SiteImage
                  src={image}
                  alt="About our business"
                  wrapperClassName="aspect-[4/3] h-full w-full"
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 50vw"
                />
              </div>
            )}
            {paragraphs.slice(0, 3).map((p, i) => (
              <div
                key={i}
                className="ws-reveal rounded-[var(--brand-radius-lg)] bg-[var(--brand-surface)] p-6 ring-1 ring-[var(--brand-border)]"
              >
                <p className="text-base leading-relaxed text-[var(--brand-body)]">{p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-16 md:py-20">
      <div
        className={
          "mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 " +
          (image ? split : "max-w-3xl grid-cols-1")
        }
      >
        <div className={flip && image ? "md:order-2" : undefined}>
          <SectionTitle title={c.title} center={false} />
          <p className="whitespace-pre-line text-base md:text-lg leading-relaxed text-[var(--brand-body)]">
            {c.body}
          </p>
        </div>
        {image && (
          <div className="overflow-hidden shadow-xl" style={{ borderRadius: "var(--brand-image-radius)", padding: "var(--brand-image-pad)", border: "var(--brand-image-ring)" }}>
            <SiteImage
              src={image}
              alt="About our business"
              wrapperClassName="aspect-[4/3] w-full"
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
              imgStyle={{ filter: "var(--brand-image-filter)" }}
            />
          </div>
        )}
      </div>
    </section>
  );
}

// ---------- SERVICES ----------
function Services({ section, services, onCta, onEnquire, layout = 0, business }: {
  section: SiteSection; services: Service[]; onCta: (t: string) => void; onEnquire: (subject: string) => void;
  layout?: number;
  /** The business, so a service without a photo still gets its own drawing. */
  business?: Business;
}) {
  const c = section.content as { title?: string; subtitle?: string };
  const variant = (section.content?.variant as string) || "cards";
  const cols = ["sm:grid-cols-2 lg:grid-cols-3", "sm:grid-cols-2", "sm:grid-cols-2 lg:grid-cols-4"][layout % 3];
  const centred = layout % 2 === 0;
  if (!services.length) return null;

  // Numbered steps down the page: for trades where the order of work is the
  // selling point (packers, construction, tax filing).
  if (variant === "process") {
    return (
      <section id="services" className="bg-[var(--brand-surface)] py-16 md:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <SectionTitle title={c.title} subtitle={c.subtitle} center />
          <ol className="space-y-5">
            {services.map((s, i) => {
              const Icon = ICONS[s.icon] || Sparkles;
              return (
                <li key={s.id} className="ws-reveal flex gap-5 rounded-[var(--brand-radius-lg)] bg-white p-5 ring-1 ring-[var(--brand-border)]">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: "var(--brand-primary)" }} aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div className="min-w-0">
                    <h3 className="flex items-center gap-2 text-lg font-semibold text-[var(--brand-secondary)]">
                      <Icon className="h-5 w-5 text-[var(--brand-primary)]" aria-hidden="true" />
                      {s.name}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-[var(--brand-muted)]">{s.description}</p>
                    {s.price && <p className="mt-2 text-sm font-semibold text-[var(--brand-primary)]">{s.price}</p>}
                    <button
                      type="button"
                      onClick={() => { onCta("CTA_CALL"); onEnquire(s.name); }}
                      className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--brand-primary)]"
                    >
                      Enquire about this <Send className="ws-arrow h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </section>
    );
  }

  // A plain two-column list with a rule between rows — quieter, more
  // catalogue-like than cards.
  if (variant === "list") {
    return (
      <section id="services" className="py-16 md:py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <SectionTitle title={c.title} subtitle={c.subtitle} center={false} />
          <ul>
            {services.map((s) => (
              <li key={s.id} className="ws-reveal group border-b border-[var(--brand-border)] py-5 last:border-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                  <h3 className="text-base font-semibold text-[var(--brand-secondary)] md:text-lg">{s.name}</h3>
                  {s.price && <span className="text-sm font-semibold text-[var(--brand-primary)]">{s.price}</span>}
                </div>
                {s.description && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[var(--brand-muted)]">{s.description}</p>}
                <button
                  type="button"
                  onClick={() => { onCta("CTA_CALL"); onEnquire(s.name); }}
                  className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--brand-primary)]"
                >
                  Enquire <Send className="ws-arrow h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>
    );
  }

  return (
    <section id="services" className="bg-[var(--brand-surface)] py-16 md:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionTitle title={c.title} subtitle={c.subtitle} center={centred} />
        <div className={`grid gap-6 ${cols}`}>
          {services.map((s, si) => {
            const Icon = ICONS[s.icon] || Sparkles;
            // A service with no photo of its own still gets a real picture:
            // this business's own generated drawing, walking forward per card.
            const art = s.image ? null : sectionArt(business, "services", si);
            return (
              <div
                key={s.id}
                className="ws-reveal ws-card group overflow-hidden bg-white ring-1 ring-[var(--brand-border)] hover:shadow-xl hover:ring-[var(--brand-primary)]/40"
                style={{ borderRadius: "var(--brand-radius-lg)", boxShadow: "var(--brand-card-shadow)" }}
              >
                {s.image ? (
                  <div className="aspect-[16/9] overflow-hidden bg-[var(--brand-primary)]/10">
                    { }
                    <SiteImage
                      src={s.image}
                      alt={s.name}
                      wrapperClassName="h-full w-full"
                      className="ws-zoom object-cover"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    />
                  </div>
                ) : art ? (
                  <div className="relative aspect-[16/9] overflow-hidden bg-[var(--brand-primary)]/10">
                    { }
                    <img
                      src={art}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      decoding="async"
                      className="ws-zoom h-full w-full object-cover"
                    />
                    <div
                      className="absolute inset-0"
                      style={{ background: "linear-gradient(180deg, transparent 40%, color-mix(in srgb, var(--brand-surface) 82%, transparent) 100%)" }}
                    />
                    <div className="absolute bottom-3 left-6 flex h-11 w-11 items-center justify-center rounded-[var(--brand-radius)] bg-white/90 text-[var(--brand-primary)] shadow-sm transition duration-300 group-hover:scale-110 group-hover:bg-[var(--brand-primary)] group-hover:text-white">
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>
                ) : (
                  <div className="px-6 pt-6">
                    <div className="flex h-12 w-12 items-center justify-center rounded-[var(--brand-radius)] bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] transition duration-300 group-hover:scale-110 group-hover:bg-[var(--brand-primary)] group-hover:text-white">
                      <Icon className="h-6 w-6" />
                    </div>
                  </div>
                )}
                <div className="p-6">
                  <h3 className="text-lg font-semibold text-[var(--brand-secondary)]">{s.name}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--brand-muted)]">{s.description}</p>
                  {s.price && <p className="mt-3 text-sm font-semibold text-[var(--brand-primary)]">{s.price}</p>}
                  {/* Carries the service through to the form and onto the lead,
                      so the owner sees what the enquiry is actually about. */}
                  <button
                    type="button"
                    onClick={() => { onCta("CTA_CALL"); onEnquire(s.name); }}
                    className="mt-4 inline-flex items-center gap-1.5 rounded text-sm font-semibold text-[var(--brand-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2"
                  >
                    Enquire about this <Send className="ws-arrow h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ---------- PRODUCTS ----------
function Products({ section, products, onCta, onEnquire, business }: {
  section: SiteSection; products: Product[]; onCta: (t: string) => void; onEnquire: (subject: string) => void;
  /** The business, so a product without a photo still gets its own drawing. */
  business?: Business;
}) {
  const c = section.content as { title?: string; subtitle?: string };
  const [videoProduct, setVideoProduct] = useState<Product | null>(null);
  const [activeCategory, setActiveCategory] = useState("All");
  if (!products.length) return null;
  const categories = Array.from(new Set(products.map((p) => (p.category || "").trim()).filter(Boolean)));
  const showFilter = categories.length > 1;
  const filteredProducts = !showFilter || activeCategory === "All"
    ? products
    : products.filter((p) => (p.category || "").trim() === activeCategory);
  const fmt = (p: Product) =>
    p.hidePrice ? null : p.salePrice != null ? (
      <span><span className="text-[var(--brand-muted)] line-through mr-2">₹{p.price}</span><span className="text-[var(--brand-primary)] font-bold">₹{p.salePrice}</span></span>
    ) : p.price != null ? <span className="text-[var(--brand-primary)] font-bold">₹{p.price}</span> : null;
  return (
    <section id="products" className="py-16 md:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionTitle title={c.title || "Our Products"} subtitle={c.subtitle} />
        {showFilter && (
          <div className="mb-8 flex flex-wrap items-center justify-center gap-2" role="group" aria-label="Filter products by category">
            {["All", ...categories].map((cat) => {
              const active = activeCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  aria-pressed={active}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold transition active:scale-95 ${
                    active
                      ? "text-white shadow-sm"
                      : "border border-current text-[var(--brand-body)] hover:text-[var(--brand-primary)]"
                  }`}
                  style={active ? { background: "var(--brand-primary)" } : undefined}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        )}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {filteredProducts.map((p, pi) => {
            const vid = p.videoUrl ? youtubeId(p.videoUrl) : null;
            // No photo from the owner: show this business's own generated
            // drawing rather than a grey box, so a catalogue page never looks
            // half-finished. The owner's own photo always wins when there is one.
            const art = p.image ? null : sectionArt(business, "products", pi);
            return (
              <div key={p.id} className="ws-reveal ws-card group flex flex-col overflow-hidden rounded-[var(--brand-radius-lg)] bg-white shadow-sm ring-1 ring-[var(--brand-border)] hover:shadow-xl hover:ring-[var(--brand-primary)]/40">
                <div className="relative aspect-[4/3] bg-[var(--brand-primary)]/10 flex items-center justify-center overflow-hidden">
                  {p.image ? (
                     
                    <SiteImage
                      src={p.image}
                      alt={p.name}
                      wrapperClassName="h-full w-full"
                      className="object-cover"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    />
                  ) : art ? (
                    <img
                      src={art}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      decoding="async"
                      className="ws-zoom h-full w-full object-cover"
                    />
                  ) : (
                    <Package className="h-10 w-10 text-[var(--brand-primary)]/50" />
                  )}
                  {vid && (
                    <button
                      type="button"
                      onClick={() => setVideoProduct(p)}
                      aria-label={`Watch video of ${p.name}`}
                      className="group/btn absolute inset-0 flex items-center justify-center bg-black/0 transition hover:bg-black/25"
                    >
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur transition group-hover/btn:scale-110">
                        <Play className="h-5 w-5 fill-white" />
                      </span>
                    </button>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-4">
                  {p.category && <span className="text-xs font-medium uppercase tracking-wide text-[var(--brand-primary)]">{p.category}</span>}
                  <h3 className="mt-1 font-semibold text-[var(--brand-secondary)]">{p.name}</h3>
                  {p.shortDesc && <p className="mt-1 line-clamp-2 text-sm text-[var(--brand-muted)]">{p.shortDesc}</p>}
                  {vid && (
                    <button
                      type="button"
                      onClick={() => setVideoProduct(p)}
                      className="mt-2 inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700"
                    >
                      <Youtube className="h-4 w-4" /> Watch video
                    </button>
                  )}
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-base">{fmt(p) ?? <span className="text-sm font-semibold text-[var(--brand-primary)]">Enquire for price</span>}</span>
                    <button
                      type="button"
                      onClick={() => { onCta("CTA_CALL"); onEnquire(p.name); }}
                      className="rounded-[var(--brand-radius)] bg-[var(--brand-primary)] px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2"
                    >
                      Enquire
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {videoProduct && youtubeId(videoProduct.videoUrl) && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`Video of ${videoProduct.name}`}
          onClick={() => setVideoProduct(null)}
        >
          <div className="relative w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setVideoProduct(null)}
              aria-label="Close video"
              className="absolute -top-10 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/30"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="overflow-hidden rounded-xl shadow-2xl" style={{ aspectRatio: "16/9" }}>
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${youtubeId(videoProduct.videoUrl)}?autoplay=1&rel=0`}
                title={`Video of ${videoProduct.name}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full border-0"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------- WHY US ----------
function WhyUs({ section }: { section: SiteSection }) {
  const c = section.content as { title?: string; items?: { title: string; description: string }[] };
  const variant = (section.content?.variant as string) || "cards";
  const items = c.items || [];
  if (!items.length) return null;

  // Rows on a rule, numbers set large — reads like an argument, not a grid.
  if (variant === "numbered") {
    return (
      <section className="py-16 md:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <SectionTitle title={c.title} center />
          <div className="mt-10 space-y-6">
            {items.map((it, i) => (
              <div key={i} className="ws-reveal flex gap-5">
                <span className="text-3xl font-extrabold leading-none text-[var(--brand-accent)]" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="font-semibold text-[var(--brand-secondary)]">{it.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[var(--brand-muted)]">{it.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // Bento: the first reason takes the wide tile, the rest pair up beneath it.
  if (variant === "bento") {
    return (
      <section className="py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionTitle title={c.title} />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {items.map((it, i) => (
              <div
                key={i}
                className={`ws-reveal ws-card rounded-[var(--brand-radius-lg)] p-6 ring-1 ring-[var(--brand-border)] ${
                  i === 0 ? "bg-[var(--brand-secondary)] text-white sm:col-span-2 lg:col-span-2" : "bg-white"
                }`}
                style={{ boxShadow: "var(--brand-card-shadow)" }}
              >
                <h3 className={`font-semibold ${i === 0 ? "text-lg text-white" : "text-[var(--brand-secondary)]"}`}>{it.title}</h3>
                <p className={`mt-2 text-sm leading-relaxed ${i === 0 ? "text-white/80" : "text-[var(--brand-muted)]"}`}>{it.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-[var(--brand-surface)] py-16 md:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionTitle title={c.title} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 md:gap-5">
          {items.map((it, i) => (
            <div
              key={i}
              className="ws-reveal ws-card group bg-white p-6 ring-1 ring-[var(--brand-border)] hover:shadow-xl hover:ring-[var(--brand-primary)]/40"
              style={{ borderRadius: "var(--brand-radius-lg)", boxShadow: "var(--brand-card-shadow)" }}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--brand-accent)]/20 font-bold text-[var(--brand-secondary)] transition duration-300 group-hover:scale-110 group-hover:bg-[var(--brand-accent)]">{i + 1}</div>
              <h3 className="mt-4 font-semibold text-[var(--brand-secondary)]">{it.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--brand-muted)]">{it.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- GALLERY ----------
/**
 * Fullscreen viewer shared by every gallery arrangement — one implementation,
 * so a fix (keyboard, focus, the counter) reaches all of them.
 */
function GalleryLightbox({ current, index, total, close, step }: {
  current: GalleryItem; index: number; total: number; close: () => void; step: (d: 1 | -1) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Gallery image viewer"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <button
        type="button"
        onClick={close}
        aria-label="Close image viewer"
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/25 active:scale-95"
      >
        <X className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={() => step(-1)}
        aria-label="Previous image"
        className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/25 active:scale-95 md:left-6"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>
      <figure className="flex max-h-full flex-col items-center">
        <img
          src={current.url}
          alt={current.alt || current.caption || "Gallery image"}
          className="max-h-[85vh] max-w-[92vw] rounded-[var(--brand-radius-lg)] object-contain shadow-2xl"
          loading="lazy"
          decoding="async"
        />
        <figcaption className="mt-3 flex items-center gap-3 text-sm text-white/80">
          {current.caption && <span className="max-w-[70vw] truncate">{current.caption}</span>}
          <span className="text-white/50">{index + 1} / {total}</span>
        </figcaption>
      </figure>
      <button
        type="button"
        onClick={() => step(1)}
        aria-label="Next image"
        className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/25 active:scale-95 md:right-6"
      >
        <ChevronRight className="h-6 w-6" />
      </button>
    </div>
  );
}

function Gallery({ section, gallery }: { section: SiteSection; gallery: GalleryItem[] }) {
  const c = section.content as { title?: string; subtitle?: string };
  const [lightbox, setLightbox] = useState<number | null>(null);
  const closeLightbox = useCallback(() => setLightbox(null), []);
  const stepLightbox = useCallback(
    (dir: 1 | -1) => setLightbox((i) => (i === null ? i : (i + dir + gallery.length) % gallery.length)),
    [gallery.length],
  );

  // Keyboard navigation + body scroll lock while the lightbox is open
  useEffect(() => {
    if (lightbox === null) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
      else if (e.key === "ArrowRight") stepLightbox(1);
      else if (e.key === "ArrowLeft") stepLightbox(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [lightbox, closeLightbox, stepLightbox]);

  if (!gallery.length) return null;
  const current = lightbox !== null ? gallery[lightbox] : null;
  const variant = (section.content?.variant as string) || "grid";

  // Scrolling strip — the photo wall of the hand-built sites. Every tile is the
  // same height and the row scrolls sideways; on a phone that is a swipe.
  if (variant === "filmstrip") {
    return (
      <section id="gallery" className="py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionTitle title={c.title} subtitle={c.subtitle} />
          <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
            {gallery.map((g, i) => (
              <figure key={g.id} className="relative w-64 shrink-0 snap-start sm:w-80">
                <button
                  type="button"
                  onClick={() => setLightbox(i)}
                  aria-label={g.caption ? `View image: ${g.caption}` : `View image ${i + 1} of ${gallery.length}`}
                  className="block w-full cursor-zoom-in rounded-[var(--brand-radius-lg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                >
                  <SiteImage
                    src={g.url}
                    alt={g.caption || "Photo"}
                    wrapperClassName="aspect-[4/3] w-full rounded-[var(--brand-radius-lg)]"
                    className="ws-zoom object-cover"
                    imgStyle={{ filter: "var(--brand-image-filter)" }}
                    sizes="(max-width: 640px) 60vw, 320px"
                  />
                </button>
                {g.caption && <figcaption className="mt-2 truncate text-xs text-[var(--brand-muted)]">{g.caption}</figcaption>}
              </figure>
            ))}
          </div>
        </div>
        {current && lightbox !== null && (
          <GalleryLightbox current={current} index={lightbox} total={gallery.length} close={closeLightbox} step={stepLightbox} />
        )}
      </section>
    );
  }

  // Masonry: the first photo is twice the height of the rest, so the wall has a
  // focal point instead of a uniform checkerboard.
  if (variant === "masonry") {
    return (
      <section id="gallery" className="py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionTitle title={c.title} subtitle={c.subtitle} />
          <div className="grid auto-rows-[150px] grid-cols-2 gap-3 md:grid-cols-3 md:auto-rows-[190px]">
            {gallery.map((g, i) => (
              <figure key={g.id} className={`group overflow-hidden rounded-[var(--brand-radius-lg)] ${i === 0 ? "row-span-2" : ""}`}>
                <button
                  type="button"
                  onClick={() => setLightbox(i)}
                  aria-label={g.caption ? `View image: ${g.caption}` : `View image ${i + 1} of ${gallery.length}`}
                  className="block h-full w-full cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                >
                  <SiteImage
                    src={g.url}
                    alt={g.caption || "Photo"}
                    wrapperClassName="h-full w-full"
                    className="ws-zoom object-cover"
                    imgStyle={{ filter: "var(--brand-image-filter)" }}
                    sizes="(max-width: 768px) 50vw, 33vw"
                  />
                </button>
              </figure>
            ))}
          </div>
        </div>
        {current && lightbox !== null && (
          <GalleryLightbox current={current} index={lightbox} total={gallery.length} close={closeLightbox} step={stepLightbox} />
        )}
      </section>
    );
  }

  return (
    <section id="gallery" className="py-16 md:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionTitle title={c.title} subtitle={c.subtitle} />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
          {gallery.map((g, i) => (
            <figure key={g.id} className="group overflow-hidden rounded-[var(--brand-radius-lg)]">
              <button
                type="button"
                onClick={() => setLightbox(i)}
                aria-label={g.caption ? `View image: ${g.caption}` : `View image ${i + 1} of ${gallery.length}`}
                className="block w-full cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
              >
                <SiteImage
                  src={g.url}
                  alt={g.alt || g.caption || "Gallery image"}
                  wrapperClassName="aspect-[4/3] w-full"
                  className="ws-zoom object-cover"
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                />
              </button>
              {g.caption && <figcaption className="mt-2 text-sm text-[var(--brand-muted)]">{g.caption}</figcaption>}
            </figure>
          ))}
        </div>
      </div>

      {current && lightbox !== null && (
        <GalleryLightbox current={current} index={lightbox} total={gallery.length} close={closeLightbox} step={stepLightbox} />
      )}
    </section>
  );
}

// ---------- TESTIMONIALS ----------
/**
 * One review at a time, large. Auto-advance is deliberately absent: a quote
 * that changes while someone is reading it is worse than a static one, and
 * every move here is a decision the visitor made.
 */
function TestimonialSpotlight({ section, testimonials }: { section: SiteSection; testimonials: Testimonial[] }) {
  const c = section.content as { title?: string; subtitle?: string };
  const [at, setAt] = useState(0);
  const t = testimonials[at % testimonials.length];
  return (
    <section id="testimonials" className="bg-[var(--brand-surface)] py-16 md:py-20">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <SectionTitle title={c.title} subtitle={c.subtitle} center />
        <figure className="ws-reveal">
          <Quote className="mx-auto h-8 w-8 text-[var(--brand-accent)]" aria-hidden="true" />
          <blockquote className="mt-5 text-lg font-medium leading-relaxed text-[var(--brand-secondary)] md:text-xl">
            “{t.content}”
          </blockquote>
          <figcaption className="mt-5 text-sm">
            <span className="font-semibold text-[var(--brand-secondary)]">{t.name}</span>
            {t.role && <span className="text-[var(--brand-muted)]"> · {t.role}</span>}
          </figcaption>
        </figure>
        {testimonials.length > 1 && (
          <div className="mt-7 flex items-center justify-center gap-2">
            {testimonials.map((x, i) => (
              <button
                key={x.id}
                type="button"
                onClick={() => setAt(i)}
                aria-label={`Show review ${i + 1} of ${testimonials.length}`}
                aria-current={i === at % testimonials.length}
                className="h-2.5 w-2.5 rounded-full transition"
                style={{ background: i === at % testimonials.length ? "var(--brand-primary)" : "var(--brand-border)" }}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}


function Testimonials({ section, testimonials }: { section: SiteSection; testimonials: Testimonial[] }) {
  const c = section.content as { title?: string; subtitle?: string };
  const variant = (section.content?.variant as string) || "cards";
  if (!testimonials.length) return null;

  // Spotlight: one large quote at a time, dots underneath. For a business with
  // a few strong reviews rather than many average ones.
  if (variant === "spotlight") {
    return <TestimonialSpotlight section={section} testimonials={testimonials} />;
  }

  // Wall: every review as a compact tile, no photos, tight grid. Reads as
  // "lots of people said this", which is the point.
  if (variant === "wall") {
    return (
      <section id="testimonials" className="bg-[var(--brand-surface)] py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionTitle title={c.title} subtitle={c.subtitle} />
          <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 [&>*]:mb-4">
            {testimonials.map((t) => (
              <figure key={t.id} className="ws-reveal break-inside-avoid rounded-[var(--brand-radius-lg)] bg-white p-5 ring-1 ring-[var(--brand-border)]">
                {t.rating > 0 && (
                  <div className="flex items-center gap-0.5" aria-label={`${t.rating} out of 5`}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={`h-3.5 w-3.5 ${i < t.rating ? "fill-[var(--brand-accent)] text-[var(--brand-accent)]" : "text-[var(--brand-border)]"}`} />
                    ))}
                  </div>
                )}
                <blockquote className="mt-2 text-sm leading-relaxed text-[var(--brand-body)]">“{t.content}”</blockquote>
                <figcaption className="mt-3 text-xs font-semibold text-[var(--brand-secondary)]">
                  {t.name}{t.role ? ` · ${t.role}` : ""}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>
    );
  }
  // Averaged from the reviews actually shown below — no external rating is implied.
  const rated = testimonials.filter((t) => t.rating > 0);
  const average = rated.length ? rated.reduce((sum, t) => sum + t.rating, 0) / rated.length : 0;
  return (
    <section id="testimonials" className="bg-[var(--brand-surface)] py-16 md:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionTitle title={c.title} subtitle={c.subtitle} />
        {rated.length >= 2 && (
          <div className="mb-8 flex flex-wrap items-center justify-center gap-3 text-sm">
            <span className="flex items-center gap-1" aria-hidden="true">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={`h-5 w-5 ${
                    i < Math.round(average) ? "fill-[var(--brand-accent)] text-[var(--brand-accent)]" : "text-[var(--brand-border)]"
                  }`}
                />
              ))}
            </span>
            <span className="font-semibold text-[var(--brand-secondary)]">{average.toFixed(1)} out of 5</span>
            <span className="text-[var(--brand-muted)]">
              from {rated.length} customer {rated.length === 1 ? "review" : "reviews"}
            </span>
          </div>
        )}
        <div className="grid gap-6 md:grid-cols-3">
          {testimonials.map((t) => (
            <div key={t.id} className="ws-reveal ws-card rounded-[var(--brand-radius-lg)] bg-white p-6 shadow-sm ring-1 ring-[var(--brand-border)]">
              <Quote className="h-6 w-6 text-[var(--brand-accent)]" />
              <p className="mt-3 text-sm leading-relaxed text-[var(--brand-body)]">“{t.content}”</p>
              <div className="mt-4 flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={`h-4 w-4 ${i < t.rating ? "fill-[var(--brand-accent)] text-[var(--brand-accent)]" : "text-[var(--brand-border)]"}`} />
                ))}
              </div>
              <div className="mt-3 border-t border-[var(--brand-border)] pt-3">
                <p className="font-semibold text-sm text-[var(--brand-secondary)]">{t.name}</p>
                {t.role && <p className="text-xs text-[var(--brand-muted)]">{t.role}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- FAQ (AEO-optimized) ----------
function FaqSection({ section }: { section: SiteSection }) {
  const c = section.content as { title?: string; items?: { question: string; answer: string }[] };
  const [open, setOpen] = useState<number | null>(0);
  const variant = (section.content?.variant as string) || "list";
  const items = c.items || [];
  if (!items.length) return null;

  // Two columns, two independently-collapsible lists — a shorter page for a
  // trade with many questions.
  if (variant === "two-col") {
    const half = Math.ceil(items.length / 2);
    const columns = [items.slice(0, half), items.slice(half)];
    return (
      <section id="faq" className="py-16 md:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <SectionTitle title={c.title || "Frequently Asked Questions"} center />
          <div className="grid gap-3 md:grid-cols-2 md:items-start">
            {columns.map((column, ci) => (
              <div key={ci} className="space-y-3">
                {column.map((f, i) => {
                  const idx = ci === 0 ? i : half + i;
                  return (
                    <div key={idx} className="overflow-hidden rounded-[var(--brand-radius-lg)] bg-[var(--brand-surface)] ring-1 ring-[var(--brand-border)]">
                      <h3>
                        <button
                          type="button"
                          onClick={() => setOpen(open === idx ? null : idx)}
                          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-medium text-[var(--brand-secondary)]"
                          aria-expanded={open === idx}
                          aria-controls={`faq-answer-${idx}`}
                          id={`faq-question-${idx}`}
                        >
                          {f.question}
                          <ChevronDown className={`h-5 w-5 shrink-0 text-[var(--brand-primary)] transition-transform ${open === idx ? "rotate-180" : ""}`} aria-hidden="true" />
                        </button>
                      </h3>
                      <div id={`faq-answer-${idx}`} role="region" aria-labelledby={`faq-question-${idx}`} hidden={open !== idx}>
                        <p className="px-5 pb-5 text-sm leading-relaxed text-[var(--brand-muted)]">{f.answer}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="faq" className="py-16 md:py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <SectionTitle title={c.title || "Frequently Asked Questions"} />
        <div className="space-y-3">
          {items.map((f, i) => (
            <div key={i} className="overflow-hidden rounded-[var(--brand-radius-lg)] bg-[var(--brand-surface)] ring-1 ring-[var(--brand-border)]">
              <h3>
                <button
                  type="button"
                  onClick={() => setOpen(open === i ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-medium text-[var(--brand-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand-primary)]"
                  aria-expanded={open === i}
                  aria-controls={`faq-answer-${i}`}
                  id={`faq-question-${i}`}
                >
                  {f.question}
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-[var(--brand-primary)] transition-transform ${open === i ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  />
                </button>
              </h3>
              {/* Kept mounted and hidden so the answer text stays in the DOM for
                  crawlers and in-page search, not only when expanded. */}
              <div
                id={`faq-answer-${i}`}
                role="region"
                aria-labelledby={`faq-question-${i}`}
                hidden={open !== i}
              >
                <p className="px-5 pb-5 text-sm leading-relaxed text-[var(--brand-muted)]">{f.answer}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- CTA BANNER ----------
function CtaBanner({ section, business, onCta }: { section: SiteSection; business: Business; onCta: (t: string) => void }) {
  const c = section.content as {
    title?: string; subtitle?: string; primary?: string; secondary?: string;
    primaryAction?: string; secondaryAction?: string; image?: string;
  };
  const variant = (section.content?.variant as string) || "band";
  const art = (c.image || "").trim();
  const waNumber = toWaNumber(business.whatsapp || business.phone || "");
  // The band repeats the goal, in the same direction the hero pointed: a
  // quotation-first business should not end its page with "Call Now".
  const primary = ctaTarget(c.primaryAction, business, `tel:${business.phone}`);
  const secondary = ctaTarget(c.secondaryAction, business, waNumber ? `https://wa.me/${waNumber}` : "#contact");

  // Text on the left, the actions on the right: shorter, and it keeps the eye
  // moving instead of centring everything the same way for every business.
  if (variant === "split") {
    return (
      <section className="py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div
            className="relative overflow-hidden flex flex-col gap-8 rounded-[var(--brand-radius-lg)] px-6 py-10 md:flex-row md:items-center md:justify-between md:px-12"
            style={{ background: `linear-gradient(120deg, var(--brand-secondary), var(--brand-primary))` }}
          >
            {/* The band's own generated artwork sits behind the words at low
                opacity: enough to make the last block feel designed, never
                enough to fight the button. */}
            {art && (
              <div className="absolute inset-0" aria-hidden="true">
                <SiteImage src={art} alt="" wrapperClassName="h-full w-full" className="object-cover opacity-35" sizes="100vw" />
                <div className="absolute inset-0" style={{ background: "linear-gradient(120deg, color-mix(in srgb, var(--brand-secondary) 78%, transparent), color-mix(in srgb, var(--brand-primary) 62%, transparent))" }} />
              </div>
            )}
            <div className="relative max-w-xl">
              <h2 className="text-2xl font-bold text-white md:text-3xl">{c.title}</h2>
              {c.subtitle && <p className="mt-3 text-white/85">{c.subtitle}</p>}
            </div>
            <div className="relative flex flex-wrap gap-3">
              <a href={primary.href} {...(primary.external ? { target: "_blank", rel: "noreferrer" } : {})} onClick={() => onCta(primary.event)} className="ws-shine inline-flex items-center gap-2 bg-[var(--brand-accent)] px-7 py-3 font-semibold text-[#1c1917] transition hover:-translate-y-0.5 hover:brightness-110 active:scale-95" style={{ borderRadius: "var(--brand-button-radius)", boxShadow: "var(--brand-button-shadow)" }}>
                <Phone className="h-4 w-4" aria-hidden="true" />{c.primary || "Call Now"}
              </a>
              {(c.secondary || waNumber) && (
                <a href={secondary.href} {...(secondary.external ? { target: "_blank", rel: "noreferrer" } : {})} onClick={() => onCta(secondary.event)} className="inline-flex items-center gap-2 border-2 border-white/50 bg-white/10 px-7 py-3 font-semibold text-white backdrop-blur transition hover:border-white hover:bg-white/20 active:scale-95" style={{ borderRadius: "var(--brand-button-radius)" }}>
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />{c.secondary || "WhatsApp Us"}
                </a>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-16 md:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-[var(--brand-radius-lg)] px-6 py-12 md:px-12 text-center shadow-xl" style={{ background: `linear-gradient(120deg, var(--brand-primary), var(--brand-secondary))` }}>
          {art && (
            <div className="absolute inset-0" aria-hidden="true">
              <SiteImage src={art} alt="" wrapperClassName="h-full w-full" className="object-cover opacity-35" sizes="100vw" />
              <div className="absolute inset-0" style={{ background: "linear-gradient(120deg, color-mix(in srgb, var(--brand-primary) 72%, transparent), color-mix(in srgb, var(--brand-secondary) 60%, transparent))" }} />
            </div>
          )}
          <h2 className="relative text-2xl md:text-3xl font-bold text-white">{c.title}</h2>
          {c.subtitle && <p className="relative mx-auto mt-3 max-w-xl text-white/85">{c.subtitle}</p>}
          <div className="relative mt-7 flex flex-wrap justify-center gap-3">
            <a href={`tel:${business.phone}`} onClick={() => onCta("CTA_CALL")} className="ws-shine bg-[var(--brand-accent)] px-7 py-3 font-semibold text-[#1c1917] transition hover:-translate-y-0.5 hover:brightness-110 hover:shadow-xl active:scale-95" style={{ borderRadius: "var(--brand-button-radius)", boxShadow: "var(--brand-button-shadow)" }}>
              <span className="inline-flex items-center gap-2"><Phone className="h-4 w-4" />{c.primary || "Call Now"}</span>
            </a>
            {waNumber && (
              <a href={`https://wa.me/${waNumber}?text=${encodeURIComponent(`Hello ${business.name}, I have an enquiry.`)}`} target="_blank" rel="noreferrer" onClick={() => onCta("CTA_WHATSAPP")} className="rounded-[var(--brand-radius)] border-2 border-white/50 bg-white/10 px-7 py-3 font-semibold text-white backdrop-blur transition hover:-translate-y-0.5 hover:border-white hover:bg-white/20 active:scale-95">
                <span className="inline-flex items-center gap-2"><MessageCircle className="h-4 w-4" />{c.secondary || "WhatsApp Us"}</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- PAYMENT QR (Scan & Pay) ----------
function Payment({ section, business, onCta }: { section: SiteSection; business: Business; onCta: (t: string) => void }) {
  const c = section.content as { title?: string; subtitle?: string; note?: string };
  const [copied, setCopied] = useState(false);
  const upi = (business.upiId || "").trim();
  const customQr = (business.paymentQrUrl || "").trim();
  if (!upi && !customQr) return null; // nothing configured yet

  const payLink = upi ? upiDeepLink(upi, business.name, "Website payment") : "";

  async function copyUpi() {
    if (!upi) return;
    try {
      await navigator.clipboard.writeText(upi);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard unavailable */ }
  }

  return (
    <section id="payment" className="bg-[var(--brand-surface)] py-16 md:py-20">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <SectionTitle title={c.title || "Scan & Pay"} subtitle={c.subtitle} />
        <div className="mx-auto flex max-w-xl flex-col items-center gap-8 rounded-[var(--brand-radius-lg)] bg-white p-8 shadow-sm ring-1 ring-[var(--brand-border)] sm:flex-row sm:items-center">
          {/* QR */}
          <div className="shrink-0 rounded-[var(--brand-radius-lg)] border-2 border-[var(--brand-primary)]/20 bg-white p-3 shadow-sm">
            {customQr ? (
               
              <SiteImage
                src={customQr}
                alt={`${business.name} payment QR code`}
                wrapperClassName="h-44 w-44"
                className="object-contain"
                sizes="176px"
              />
            ) : (
              <QRCode value={payLink} size={176} bgColor="#ffffff" fgColor="var(--brand-secondary)" />
            )}
            <p className="mt-2 text-center text-[10px] font-semibold uppercase tracking-widest text-[var(--brand-muted)]">
              UPI · QR Code
            </p>
          </div>
          {/* Details */}
          <div className="flex-1 text-center sm:text-left">
            <p className="text-sm text-[var(--brand-muted)]">Pay to</p>
            <p className="text-lg font-bold text-[var(--brand-secondary)]">{business.name}</p>
            {upi && (
              <button
                type="button"
                onClick={() => void copyUpi()}
                className="mt-3 inline-flex items-center gap-2 rounded-[var(--brand-radius)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm font-semibold text-[var(--brand-body)] transition hover:border-[var(--brand-primary)]"
                aria-label="Copy UPI ID"
              >
                <QrIcon className="h-4 w-4 text-[var(--brand-primary)]" />
                <span className="font-mono">{upi}</span>
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4 text-[var(--brand-muted)]" />}
              </button>
            )}
            {payLink && (
              <div className="mt-4">
                <a
                  href={payLink}
                  onClick={() => onCta("CTA_CALL")}
                  className="inline-flex items-center justify-center gap-2 rounded-[var(--brand-radius)] bg-[var(--brand-primary)] px-6 py-3 text-sm font-semibold text-white shadow transition hover:brightness-110 active:scale-95"
                >
                  <QrIcon className="h-4 w-4" /> Pay via UPI app
                </a>
                <p className="mt-2 text-[11px] text-[var(--brand-muted)]">GPay · PhonePe · Paytm · BHIM — opens your UPI app</p>
              </div>
            )}
            {c.note && <p className="mt-4 text-xs leading-relaxed text-[var(--brand-muted)]">{c.note}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- BUSINESS HOURS ----------
function Hours({ section, business, status }: { section: SiteSection; business: Business; status?: string }) {
  const c = section.content as { title?: string };
  const days = business.hours && Object.keys(business.hours).length
    ? business.hours
    : { Monday: "9:00 AM – 7:00 PM", Tuesday: "9:00 AM – 7:00 PM", Wednesday: "9:00 AM – 7:00 PM", Thursday: "9:00 AM – 7:00 PM", Friday: "9:00 AM – 7:00 PM", Saturday: "9:00 AM – 7:00 PM", Sunday: "Closed" };
  // Matching on a locale string broke for stored keys like "mon"; the day index
  // is what actually identifies today.
  return (
    <section className="bg-[var(--brand-surface)] py-16 md:py-20">
      <div className="mx-auto max-w-2xl px-4 sm:px-6">
        <SectionTitle title={c.title || "Business Hours"} />
        {status ? (
          <p className="mb-4 text-center text-sm font-semibold text-[var(--brand-secondary)]">{status}</p>
        ) : null}
        <div className="rounded-[var(--brand-radius-lg)] bg-white p-6 ring-1 ring-[var(--brand-border)] shadow-sm">
          {Object.entries(days).map(([day, time]) => {
            const todayRow = isToday(day);
            return (
              <div
                key={day}
                className={`flex items-center justify-between border-b border-[var(--brand-border)] py-2.5 text-sm last:border-0 ${
                  todayRow ? "font-bold text-[var(--brand-primary)]" : "text-[var(--brand-body)]"
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <Clock className="h-4 w-4 text-[var(--brand-primary)]" aria-hidden="true" />
                  {day}
                  {todayRow && " (Today)"}
                </span>
                <span>{time as string}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ---------- CONTACT + MAP + ENQUIRY FORM ----------
function Contact({ section, business, onCta, submitLead, subject }: {
  section: SiteSection;
  business: Business;
  onCta: (t: string) => void;
  submitLead: (data: {
    name: string; phone: string; email: string; message: string; website: string; serviceName?: string;
  }) => Promise<string | null>;
  /** Service or product the visitor clicked "Enquire" on, if any. */
  subject?: string;
}) {
  const c = section.content as { title?: string; subtitle?: string; mapUrl?: string; variant?: string };
  // `website` is a honeypot: hidden from people, filled in by bots. The server
  // silently accepts and discards any submission that has it set.
  const [form, setForm] = useState({ name: "", phone: "", email: "", message: "", website: "" });
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; phone?: string; email?: string }>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  function validate() {
    const errors: { name?: string; phone?: string; email?: string } = {};
    if (!form.name.trim()) errors.name = "Please tell us your name.";
    // Same rule the API enforces, so a valid-looking number is never rejected
    // only after the round-trip.
    if (!form.phone.trim()) errors.phone = "We need a phone number to call you back.";
    else if (!/^[+\d][\d\s-]{6,19}$/.test(form.phone.trim())) errors.phone = "That does not look like a valid phone number.";
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = "Check the email address.";
    return errors;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const errors = validate();
    setFieldErrors(errors);
    if (errors.name) return nameRef.current?.focus();
    if (errors.phone) return phoneRef.current?.focus();
    if (errors.email) return;

    setSending(true);
    const err = await submitLead({ ...form, serviceName: subject || "" });
    setSending(false);
    if (err) { setError(err); return; }
    setDone(true);
  }

  const waNumber = toWaNumber(business.whatsapp || business.phone || "");
  const mapsHref = business.mapsUrl || c.mapUrl || `https://maps.google.com/?q=${encodeURIComponent(`${business.address} ${business.city} ${business.pincode}`)}`;
  // The embed needs a place to point at; with no address there is nothing to show.
  const mapQuery = [business.name, business.address, business.city, business.pincode]
    .map((part) => (part || "").trim())
    .filter(Boolean)
    .join(", ");

  const variant = c.variant === "form-below" ? "form-below" : "form-side";

  // The details and the map are separate blocks so the two arrangements can
  // place them independently. `form-side` is the classic details-beside-form
  // split; `form-below` spreads the details and the map across the top and
  // centres the form underneath, which suits businesses whose selling point is
  // the place itself.
  const infoCard = (
  <div className="space-y-4 rounded-[var(--brand-radius-lg)] bg-[var(--brand-surface)] p-6 ring-1 ring-[var(--brand-border)]">
    {business.phone && (
      <a href={`tel:${business.phone}`} onClick={() => onCta("CTA_CALL")} className="flex items-center gap-3 group">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]"><Phone className="h-5 w-5" /></span>
        <span><span className="block text-xs text-[var(--brand-muted)]">Call us</span><span className="font-medium text-[var(--brand-secondary)] group-hover:text-[var(--brand-primary)]">{business.phone}</span></span>
      </a>
    )}
    {business.email && (
      <a href={`mailto:${business.email}`} onClick={() => onCta("CTA_EMAIL")} className="flex items-center gap-3 group">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]"><Mail className="h-5 w-5" /></span>
        <span><span className="block text-xs text-[var(--brand-muted)]">Email</span><span className="font-medium text-[var(--brand-secondary)] group-hover:text-[var(--brand-primary)]">{business.email}</span></span>
      </a>
    )}
    {business.address && (
      <a href={mapsHref} target="_blank" rel="noreferrer" onClick={() => onCta("CTA_DIRECTIONS")} className="flex items-center gap-3 group">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]"><MapPin className="h-5 w-5" /></span>
        <span><span className="block text-xs text-[var(--brand-muted)]">Visit us</span><span className="font-medium text-[var(--brand-secondary)] group-hover:text-[var(--brand-primary)]">{business.address}, {business.city} {business.pincode}</span></span>
      </a>
    )}
    {business.gmbUrl && (
      <a href={business.gmbUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--brand-primary)] hover:underline">
        <Star className="h-4 w-4" /> View us on Google
      </a>
    )}
  </div>
  );

  const mapBlock = (
    <>
      {/* A real map beats a button that says "map" — visitors judge a local
          business on whether they can see where it is. */}
      {mapQuery ? (
    // A real map beats a button that says "map": visitors judge a local
    // business on whether they can see where it is.
    <div className="overflow-hidden rounded-[var(--brand-radius-lg)] ring-1 ring-[var(--brand-border)]">
      <iframe
        title={`Map showing ${business.name}`}
        src={`https://maps.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`}
        className="h-52 w-full border-0"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
      <a
        href={mapsHref}
        target="_blank"
        rel="noreferrer"
        onClick={() => onCta("CTA_DIRECTIONS")}
        className="flex items-center justify-center gap-2 bg-white py-3 text-sm font-semibold text-[var(--brand-primary)] transition hover:bg-[var(--brand-primary)]/5"
      >
        <MapPin className="h-4 w-4" aria-hidden="true" /> Get directions
      </a>
    </div>
  ) : (
    <a
      href={mapsHref}
      target="_blank"
      rel="noreferrer"
      onClick={() => onCta("CTA_DIRECTIONS")}
      className="flex h-52 items-center justify-center overflow-hidden rounded-[var(--brand-radius-lg)] bg-[var(--brand-primary)]/5 ring-1 ring-[var(--brand-border)] transition hover:bg-[var(--brand-primary)]/10"
    >
      <div className="text-center">
        <MapPin className="mx-auto h-10 w-10 text-[var(--brand-primary)]" aria-hidden="true" />
        <p className="mt-2 text-sm font-semibold text-[var(--brand-secondary)]">Open in Google Maps</p>
        <p className="text-xs text-[var(--brand-muted)]">Get directions →</p>
      </div>
    </a>
  )}
  );

    </>
  );

  const formCard = (
<div className="rounded-[var(--brand-radius-lg)] bg-white p-6 shadow-lg ring-1 ring-[var(--brand-border)]">
  {done ? (
    <div className="flex h-full flex-col items-center justify-center py-10 text-center">
      <CheckCircle2 className="h-14 w-14 text-[var(--brand-primary)]" aria-hidden="true" />
      <h3 className="mt-4 text-xl font-bold text-[var(--brand-secondary)]">Enquiry received</h3>
      <p className="mt-2 max-w-xs text-sm text-[var(--brand-muted)]">
        Thank you for reaching out. We will contact you within 24 hours
        {business.phone ? " — or call us now if it is urgent." : "."}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {business.phone && (
          <a
            href={`tel:${business.phone}`}
            onClick={() => onCta("CTA_CALL")}
            className="inline-flex items-center gap-2 rounded-[var(--brand-radius)] bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white"
          >
            <Phone className="h-4 w-4" aria-hidden="true" /> {business.phone}
          </a>
        )}
        {/* A dead end after submitting cost the business a second enquiry. */}
        <button
          type="button"
          onClick={() => {
            setForm({ name: "", phone: "", email: "", message: "", website: "" });
            setFieldErrors({});
            setDone(false);
          }}
          className="rounded-[var(--brand-radius)] px-4 py-2 text-sm font-semibold text-[var(--brand-primary)] ring-1 ring-[var(--brand-border)]"
        >
          Send another
        </button>
      </div>
    </div>
  ) : (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={form.website}
        onChange={(e) => setForm({ ...form, website: e.target.value })}
        className="hidden"
      />
      <h3 className="text-lg font-bold text-[var(--brand-secondary)]">Send an enquiry</h3>
      {subject ? (
        <p className="rounded-[var(--brand-radius)] bg-[var(--brand-primary)]/10 px-3 py-2 text-sm text-[var(--brand-secondary)]">
          Enquiring about <span className="font-semibold">{subject}</span>
        </p>
      ) : null}
      {error && (
        <p role="alert" className="rounded-[var(--brand-radius)] bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-[var(--brand-secondary)]">Name *</span>
          <input
            ref={nameRef}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            autoComplete="name"
            aria-invalid={!!fieldErrors.name}
            className={`w-full rounded-[var(--brand-radius)] border bg-white px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--brand-primary)] ${
              fieldErrors.name ? "border-red-400" : "border-[var(--brand-border)]"
            }`}
            placeholder="Your name"
          />
          {fieldErrors.name && <span className="mt-1 block text-xs text-red-600">{fieldErrors.name}</span>}
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-[var(--brand-secondary)]">Phone *</span>
          <input
            ref={phoneRef}
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            required
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            aria-invalid={!!fieldErrors.phone}
            className={`w-full rounded-[var(--brand-radius)] border bg-white px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--brand-primary)] ${
              fieldErrors.phone ? "border-red-400" : "border-[var(--brand-border)]"
            }`}
            placeholder="+91 98765 43210"
          />
          {fieldErrors.phone && <span className="mt-1 block text-xs text-red-600">{fieldErrors.phone}</span>}
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-[var(--brand-secondary)]">Email</span>
        <input
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          type="email"
          autoComplete="email"
          aria-invalid={!!fieldErrors.email}
          className={`w-full rounded-[var(--brand-radius)] border bg-white px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--brand-primary)] ${
            fieldErrors.email ? "border-red-400" : "border-[var(--brand-border)]"
          }`}
          placeholder="you@example.com"
        />
        {fieldErrors.email && <span className="mt-1 block text-xs text-red-600">{fieldErrors.email}</span>}
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-[var(--brand-secondary)]">Message</span>
        <textarea
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          rows={4}
          className="w-full rounded-[var(--brand-radius)] border border-[var(--brand-border)] bg-white px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
          placeholder={subject ? `Tell us what you need for ${subject}…` : "Tell us what you need…"}
        />
      </label>
      <button type="submit" disabled={sending}
        className="ws-shine flex w-full items-center justify-center gap-2 rounded-[var(--brand-radius)] bg-[var(--brand-primary)] px-6 py-3 font-semibold text-white shadow transition hover:brightness-110 hover:shadow-lg disabled:opacity-60 active:scale-[0.98]">
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {sending ? "Sending…" : "Submit Enquiry"}
      </button>
      {waNumber && (
        <a href={`https://wa.me/${waNumber}?text=${encodeURIComponent(`Hello ${business.name}!`)}`} target="_blank" rel="noreferrer" onClick={() => onCta("CTA_WHATSAPP")}
          // Palette, not WhatsApp's green: this button sits directly
          // under "Submit Enquiry", which is already the brand
          // colour, and the mismatch was the first thing anyone saw.
          className="flex w-full items-center justify-center gap-2 rounded-[var(--brand-radius)] bg-[var(--brand-secondary)] px-6 py-3 font-semibold text-white shadow transition hover:brightness-125 active:scale-[0.98]">
          <MessageCircle className="h-4 w-4" /> Chat on WhatsApp
        </a>
      )}
    </form>
  )}
</div>
  );

  return (
    <section id="contact" className="py-16 md:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionTitle title={c.title || "Contact Us"} subtitle={c.subtitle} />
        {variant === "form-below" ? (
          <>
            <div className="grid gap-6 md:grid-cols-2">
              {infoCard}
              {mapBlock}
            </div>
            <div className="mx-auto mt-10 max-w-2xl">{formCard}</div>
          </>
        ) : (
          <div className="grid gap-8 md:grid-cols-2">
            <div className="space-y-5">
              {infoCard}
              {mapBlock}
            </div>
            {formCard}
          </div>
        )}
      </div>
    </section>
  );
}


// ---------- BLOG ----------
/**
 * Teaser grid for the tenant's own posts.
 *
 * The dashboard has had a blog editor from the start, but nothing ever rendered
 * what it produced and no public URL existed — posts were written, saved, and
 * seen by nobody, on a product sold for its SEO. Each card links to the
 * server-rendered post at /s/<slug>/blog/<post>, which is what search engines
 * can actually index.
 */
function BlogTeaser({ section, posts, businessSlug }: {
  section: SiteSection;
  posts: { id: string; title: string; slug: string; excerpt: string; cover: string; publishedAt: string | null }[];
  businessSlug: string;
}) {
  const c = section.content as { title?: string; subtitle?: string; variant?: string };
  if (!posts.length) return null;

  // Two ways to show the same articles. The grid is the usual teaser; the row
  // list reads like a publication and suits businesses that actually write
  // (clinics, consultants, agencies) rather than posting once a year.
  const asList = c.variant === "list";

  const dated = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? ""
      : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  };

  return (
    <section id="blog" className="bg-[var(--brand-bg)] py-16 md:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionTitle title={c.title || "From our blog"} subtitle={c.subtitle} />
        {asList ? (
          <div className="divide-y divide-[var(--brand-border)] overflow-hidden rounded-[var(--brand-radius-lg)] bg-[var(--brand-surface)] ring-1 ring-[var(--brand-border)]">
            {posts.slice(0, 6).map((post) => (
              <a
                key={post.id}
                href={`/s/${businessSlug}/blog/${post.slug}`}
                className="group flex gap-5 p-5 transition hover:bg-[var(--brand-primary)]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand-primary)]"
              >
                {post.cover && (
                  <SiteImage
                    src={post.cover}
                    alt=""
                    wrapperClassName="hidden h-24 w-36 shrink-0 overflow-hidden rounded-[var(--brand-radius)] sm:block"
                    className="object-cover transition group-hover:scale-[1.03]"
                    sizes="150px"
                  />
                )}
                <div className="min-w-0 flex-1">
                  {post.publishedAt && (
                    <span className="text-xs font-medium text-[var(--brand-muted)]">{dated(post.publishedAt)}</span>
                  )}
                  <h3 className="mt-0.5 text-base font-semibold leading-snug text-[var(--brand-secondary)] transition group-hover:text-[var(--brand-primary)]">
                    {post.title}
                  </h3>
                  {post.excerpt && (
                    <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-[var(--brand-muted)]">{post.excerpt}</p>
                  )}
                  <span className="mt-2 inline-block text-sm font-semibold text-[var(--brand-primary)]">Read more &rarr;</span>
                </div>
              </a>
            ))}
          </div>
        ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {posts.slice(0, 6).map((post) => (
            <a
              key={post.id}
              href={`/s/${businessSlug}/blog/${post.slug}`}
              className="group flex flex-col overflow-hidden rounded-[var(--brand-radius-lg)] bg-[var(--brand-surface)] ring-1 ring-[var(--brand-border)] transition hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
            >
              {post.cover && (
                <SiteImage
                  src={post.cover}
                  alt=""
                  wrapperClassName="h-40 w-full"
                  className="object-cover transition group-hover:scale-[1.03]"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
              )}
              <div className="flex flex-1 flex-col p-5">
                {post.publishedAt && (
                  <span className="text-xs font-medium text-[var(--brand-muted)]">{dated(post.publishedAt)}</span>
                )}
                <h3 className="mt-1 text-lg font-semibold leading-snug text-[var(--brand-secondary)]">
                  {post.title}
                </h3>
                {post.excerpt && (
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-[var(--brand-muted)]">
                    {post.excerpt}
                  </p>
                )}
                <span className="mt-4 text-sm font-semibold text-[var(--brand-primary)]">Read more &rarr;</span>
              </div>
            </a>
          ))}
        </div>
        )}
        {posts.length > 6 && (
          <div className="mt-10 text-center">
            <a
              href={`/s/${businessSlug}/blog`}
              className="inline-block rounded-[var(--brand-radius-sm)] border border-[var(--brand-primary)] px-6 py-3 text-sm font-semibold text-[var(--brand-primary)] transition hover:bg-[var(--brand-primary)] hover:text-white"
            >
              All articles
            </a>
          </div>
        )}
      </div>
    </section>
  );
}

export { Hero, Stats, About, Services, Products, WhyUs, Gallery, Testimonials, FaqSection, BlogTeaser, CtaBanner, Payment, Hours, Contact, SectionTitle, ICONS };

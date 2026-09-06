"use client";
// WebSetu — Section library: renders each website section from its JSON content
import { useState } from "react";
import {
  Zap, Factory, Wrench, Sun, Coffee, Pizza, EggFried, PartyPopper, Sparkles,
  Briefcase, Package, Heart, Star, Quote, Phone, Mail, MapPin, Clock, ChevronDown,
  MessageCircle, Send, Loader2, CheckCircle2, Shield, Award, Users,
  Play, X, Copy, Check, QrCode as QrIcon, Youtube,
} from "lucide-react";
import QRCode from "react-qr-code";
import type { Business, Service, Product, SiteSection, Testimonial, GalleryItem } from "@/lib/types";
import { upiDeepLink, youtubeId } from "@/lib/site-utils";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  zap: Zap, factory: Factory, wrench: Wrench, sun: Sun, coffee: Coffee, pizza: Pizza,
  "egg-fried": EggFried, "party-popper": PartyPopper, sparkles: Sparkles, briefcase: Briefcase,
  package: Package, heart: Heart, star: Star, shield: Shield, award: Award, users: Users,
};

function SectionTitle({ title, subtitle, center = true }: { title?: string; subtitle?: string; center?: boolean }) {
  if (!title && !subtitle) return null;
  return (
    <div className={`mb-10 ${center ? "text-center mx-auto max-w-2xl" : ""}`}>
      {title && <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[var(--brand-secondary)]">{title}</h2>}
      {subtitle && <p className="mt-3 text-base md:text-lg text-[var(--brand-muted)]">{subtitle}</p>}
      <div className={`mt-4 h-1 w-16 rounded-full bg-[var(--brand-primary)] ${center ? "mx-auto" : ""}`} />
    </div>
  );
}

// ---------- HERO ----------
function Hero({ section, business, onCta }: { section: SiteSection; business: Business; onCta: (type: string) => void }) {
  const c = section.content as {
    badge?: string; heading?: string; subheading?: string;
    ctaPrimary?: string; ctaSecondary?: string; image?: string;
  };
  const style = (section.content?.heroStyle as string) || "gradient";
  return (
    <section className="relative overflow-hidden">
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(135deg, var(--brand-secondary) 0%, var(--brand-primary) 100%)` }}
      />
      {c.image && style === "image" && (
        <div className="absolute inset-0">
          { }
          <img src={c.image} alt={business.name} className="h-full w-full object-cover" />
          <div className="absolute inset-0" style={{ background: `linear-gradient(100deg, rgba(0,0,0,0.82) 25%, rgba(0,0,0,0.45) 100%)` }} />
        </div>
      )}
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 py-20 md:py-28">
        <div className="max-w-2xl">
          {c.badge && (
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur px-4 py-1.5 text-sm font-medium text-white border border-white/25">
              {c.badge}
            </span>
          )}
          <h1 className="mt-5 text-4xl md:text-6xl font-bold text-white leading-tight tracking-tight">
            {c.heading || business.name}
          </h1>
          {c.subheading && (
            <p className="mt-5 text-lg md:text-xl text-white/85 leading-relaxed">{c.subheading}</p>
          )}
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={`#contact`}
              onClick={() => onCta("CTA_CALL")}
              className="rounded-[var(--brand-radius)] bg-[var(--brand-accent)] px-7 py-3.5 text-base font-semibold text-[#1c1917] shadow-lg transition hover:brightness-110 active:scale-95"
            >
              {c.ctaPrimary || "Get a Free Quote"}
            </a>
            <a
              href={`tel:${business.phone}`}
              onClick={() => onCta("CTA_CALL")}
              className="rounded-[var(--brand-radius)] border-2 border-white/60 bg-white/10 backdrop-blur px-7 py-3.5 text-base font-semibold text-white transition hover:bg-white/20 active:scale-95"
            >
              {c.ctaSecondary || "Call Now"}
            </a>
          </div>
          {(business.establishedYear || business.city) && (
            <p className="mt-6 text-sm text-white/60">
              {business.establishedYear && `Serving since ${business.establishedYear}`}{business.establishedYear && business.city && " • "}{business.city && `${business.city}, ${business.state || ""}`}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

// ---------- STATS ----------
function Stats({ section }: { section: SiteSection }) {
  const items = (section.content?.items as { value: string; label: string }[]) || [];
  if (!items.length) return null;
  return (
    <section className="border-y border-[var(--brand-border)] bg-[var(--brand-surface)]">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-12 sm:px-6 md:grid-cols-4">
        {items.map((s, i) => (
          <div key={i} className="text-center">
            <div className="text-3xl md:text-4xl font-extrabold text-[var(--brand-primary)]">{s.value}</div>
            <div className="mt-1 text-sm text-[var(--brand-muted)]">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------- ABOUT ----------
function About({ section }: { section: SiteSection }) {
  const c = section.content as { title?: string; body?: string; image?: string };
  return (
    <section className="py-16 md:py-20">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 md:grid-cols-2">
        <div>
          <SectionTitle title={c.title} center={false} />
          <p className="whitespace-pre-line text-base md:text-lg leading-relaxed text-[var(--brand-body)]">
            {c.body}
          </p>
        </div>
        {c.image ? (
          <div className="overflow-hidden rounded-[var(--brand-radius-lg)] shadow-xl">
            { }
            <img src={c.image} alt="About our business" className="aspect-[4/3] w-full object-cover" />
          </div>
        ) : (
          <div className="hidden rounded-[var(--brand-radius-lg)] bg-[var(--brand-primary)]/10 aspect-[4/3] md:block" />
        )}
      </div>
    </section>
  );
}

// ---------- SERVICES ----------
function Services({ section, services, onCta }: { section: SiteSection; services: Service[]; onCta: (t: string) => void }) {
  const c = section.content as { title?: string; subtitle?: string };
  if (!services.length) return null;
  return (
    <section id="services" className="bg-[var(--brand-surface)] py-16 md:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionTitle title={c.title} subtitle={c.subtitle} />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => {
            const Icon = ICONS[s.icon] || Sparkles;
            return (
              <div key={s.id} className="group overflow-hidden rounded-[var(--brand-radius-lg)] bg-white shadow-sm ring-1 ring-[var(--brand-border)] transition hover:shadow-lg hover:-translate-y-0.5">
                {s.image ? (
                  <div className="aspect-[16/9] overflow-hidden bg-[var(--brand-primary)]/10">
                    { }
                    <img src={s.image} alt={s.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                  </div>
                ) : (
                  <div className="px-6 pt-6">
                    <div className="flex h-12 w-12 items-center justify-center rounded-[var(--brand-radius)] bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
                      <Icon className="h-6 w-6" />
                    </div>
                  </div>
                )}
                <div className="p-6">
                  <h3 className="text-lg font-semibold text-[var(--brand-secondary)]">{s.name}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--brand-muted)]">{s.description}</p>
                  {s.price && <p className="mt-3 text-sm font-semibold text-[var(--brand-primary)]">{s.price}</p>}
                  <a href="#contact" onClick={() => onCta("CTA_CALL")} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[var(--brand-primary)] group-hover:gap-2 transition-all">
                    Enquire Now <Send className="h-3.5 w-3.5" />
                  </a>
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
function Products({ section, products, onCta }: { section: SiteSection; products: Product[]; onCta: (t: string) => void }) {
  const c = section.content as { title?: string; subtitle?: string };
  const [videoProduct, setVideoProduct] = useState<Product | null>(null);
  if (!products.length) return null;
  const fmt = (p: Product) =>
    p.hidePrice ? null : p.salePrice != null ? (
      <span><span className="text-[var(--brand-muted)] line-through mr-2">₹{p.price}</span><span className="text-[var(--brand-primary)] font-bold">₹{p.salePrice}</span></span>
    ) : p.price != null ? <span className="text-[var(--brand-primary)] font-bold">₹{p.price}</span> : null;
  return (
    <section id="products" className="py-16 md:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionTitle title={c.title || "Our Products"} subtitle={c.subtitle} />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((p) => {
            const vid = p.videoUrl ? youtubeId(p.videoUrl) : null;
            return (
              <div key={p.id} className="flex flex-col overflow-hidden rounded-[var(--brand-radius-lg)] bg-white shadow-sm ring-1 ring-[var(--brand-border)] transition hover:shadow-lg">
                <div className="relative aspect-[4/3] bg-[var(--brand-primary)]/10 flex items-center justify-center overflow-hidden">
                  {p.image ? (
                     
                    <img src={p.image} alt={p.name} className="h-full w-full object-cover" />
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
                    <a href="#contact" onClick={() => onCta("CTA_CALL")} className="rounded-[var(--brand-radius)] bg-[var(--brand-primary)] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 transition">Enquire</a>
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
  const items = c.items || [];
  if (!items.length) return null;
  return (
    <section className="bg-[var(--brand-surface)] py-16 md:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionTitle title={c.title} />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((it, i) => (
            <div key={i} className="rounded-[var(--brand-radius-lg)] bg-white p-6 ring-1 ring-[var(--brand-border)]">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--brand-accent)]/20 text-[var(--brand-secondary)] font-bold">{i + 1}</div>
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
function Gallery({ section, gallery }: { section: SiteSection; gallery: GalleryItem[] }) {
  const c = section.content as { title?: string; subtitle?: string };
  if (!gallery.length) return null;
  return (
    <section id="gallery" className="py-16 md:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionTitle title={c.title} subtitle={c.subtitle} />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
          {gallery.map((g) => (
            <figure key={g.id} className="group overflow-hidden rounded-[var(--brand-radius-lg)]">
              { }
              <img src={g.url} alt={g.alt || g.caption || "Gallery image"} className="aspect-[4/3] w-full object-cover transition duration-300 group-hover:scale-105" />
              {g.caption && <figcaption className="mt-2 text-sm text-[var(--brand-muted)]">{g.caption}</figcaption>}
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- TESTIMONIALS ----------
function Testimonials({ section, testimonials }: { section: SiteSection; testimonials: Testimonial[] }) {
  const c = section.content as { title?: string; subtitle?: string };
  if (!testimonials.length) return null;
  return (
    <section id="testimonials" className="bg-[var(--brand-surface)] py-16 md:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionTitle title={c.title} subtitle={c.subtitle} />
        <div className="grid gap-6 md:grid-cols-3">
          {testimonials.map((t) => (
            <div key={t.id} className="rounded-[var(--brand-radius-lg)] bg-white p-6 shadow-sm ring-1 ring-[var(--brand-border)]">
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
  const items = c.items || [];
  if (!items.length) return null;
  return (
    <section id="faq" className="py-16 md:py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <SectionTitle title={c.title || "Frequently Asked Questions"} />
        <div className="space-y-3">
          {items.map((f, i) => (
            <div key={i} className="rounded-[var(--brand-radius-lg)] bg-[var(--brand-surface)] ring-1 ring-[var(--brand-border)] overflow-hidden">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-medium text-[var(--brand-secondary)]"
                aria-expanded={open === i}
              >
                {f.question}
                <ChevronDown className={`h-5 w-5 shrink-0 text-[var(--brand-primary)] transition-transform ${open === i ? "rotate-180" : ""}`} />
              </button>
              {open === i && <p className="px-5 pb-5 text-sm leading-relaxed text-[var(--brand-muted)]">{f.answer}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- CTA BANNER ----------
function CtaBanner({ section, business, onCta }: { section: SiteSection; business: Business; onCta: (t: string) => void }) {
  const c = section.content as { title?: string; subtitle?: string; primary?: string; secondary?: string };
  const waNumber = (business.whatsapp || business.phone || "").replace(/[^\d]/g, "");
  return (
    <section className="py-16 md:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="rounded-[var(--brand-radius-lg)] px-6 py-12 md:px-12 text-center shadow-xl" style={{ background: `linear-gradient(120deg, var(--brand-primary), var(--brand-secondary))` }}>
          <h2 className="text-2xl md:text-3xl font-bold text-white">{c.title}</h2>
          {c.subtitle && <p className="mx-auto mt-3 max-w-xl text-white/85">{c.subtitle}</p>}
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <a href={`tel:${business.phone}`} onClick={() => onCta("CTA_CALL")} className="rounded-[var(--brand-radius)] bg-[var(--brand-accent)] px-7 py-3 font-semibold text-[#1c1917] shadow transition hover:brightness-110 active:scale-95">
              <span className="inline-flex items-center gap-2"><Phone className="h-4 w-4" />{c.primary || "Call Now"}</span>
            </a>
            {waNumber && (
              <a href={`https://wa.me/${waNumber}?text=${encodeURIComponent(`Hello ${business.name}, I have an enquiry.`)}`} target="_blank" rel="noreferrer" onClick={() => onCta("CTA_WHATSAPP")} className="rounded-[var(--brand-radius)] bg-white/10 border-2 border-white/50 px-7 py-3 font-semibold text-white backdrop-blur transition hover:bg-white/20 active:scale-95">
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
               
              <img src={customQr} alt={`${business.name} payment QR code`} className="h-44 w-44 object-contain" />
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
function Hours({ section, business }: { section: SiteSection; business: Business }) {
  const c = section.content as { title?: string };
  const days = business.hours && Object.keys(business.hours).length
    ? business.hours
    : { Monday: "9:00 AM – 7:00 PM", Tuesday: "9:00 AM – 7:00 PM", Wednesday: "9:00 AM – 7:00 PM", Thursday: "9:00 AM – 7:00 PM", Friday: "9:00 AM – 7:00 PM", Saturday: "9:00 AM – 7:00 PM", Sunday: "Closed" };
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long" });
  return (
    <section className="bg-[var(--brand-surface)] py-16 md:py-20">
      <div className="mx-auto max-w-2xl px-4 sm:px-6">
        <SectionTitle title={c.title || "Business Hours"} />
        <div className="rounded-[var(--brand-radius-lg)] bg-white p-6 ring-1 ring-[var(--brand-border)] shadow-sm">
          {Object.entries(days).map(([day, time]) => (
            <div key={day} className={`flex items-center justify-between border-b border-[var(--brand-border)] py-2.5 last:border-0 text-sm ${day === today ? "font-bold text-[var(--brand-primary)]" : "text-[var(--brand-body)]"}`}>
              <span className="inline-flex items-center gap-2"><Clock className="h-4 w-4 text-[var(--brand-primary)]" />{day}{day === today && " (Today)"}</span>
              <span>{time as string}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- CONTACT + MAP + ENQUIRY FORM ----------
function Contact({ section, business, onCta, submitLead }: {
  section: SiteSection; business: Business; onCta: (t: string) => void; submitLead: (data: { name: string; phone: string; email: string; message: string }) => Promise<string | null>;
}) {
  const c = section.content as { title?: string; subtitle?: string; mapUrl?: string };
  const [form, setForm] = useState({ name: "", phone: "", email: "", message: "" });
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim() || !form.phone.trim()) {
      setError("Name and phone number are required.");
      return;
    }
    setSending(true);
    const err = await submitLead(form);
    setSending(false);
    if (err) { setError(err); return; }
    setDone(true);
  }

  const waNumber = (business.whatsapp || business.phone || "").replace(/[^\d]/g, "");
  const mapsHref = business.mapsUrl || c.mapUrl || `https://maps.google.com/?q=${encodeURIComponent(`${business.address} ${business.city} ${business.pincode}`)}`;

  return (
    <section id="contact" className="py-16 md:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionTitle title={c.title || "Contact Us"} subtitle={c.subtitle} />
        <div className="grid gap-8 md:grid-cols-2">
          {/* Info + map */}
          <div className="space-y-5">
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
            <a href={mapsHref} target="_blank" rel="noreferrer" onClick={() => onCta("CTA_DIRECTIONS")}
              className="flex h-52 items-center justify-center rounded-[var(--brand-radius-lg)] overflow-hidden ring-1 ring-[var(--brand-border)] bg-[var(--brand-primary)]/5 hover:bg-[var(--brand-primary)]/10 transition">
              <div className="text-center">
                <MapPin className="mx-auto h-10 w-10 text-[var(--brand-primary)]" />
                <p className="mt-2 text-sm font-semibold text-[var(--brand-secondary)]">Open in Google Maps</p>
                <p className="text-xs text-[var(--brand-muted)]">Get Directions →</p>
              </div>
            </a>
          </div>

          {/* Enquiry form */}
          <div className="rounded-[var(--brand-radius-lg)] bg-white p-6 shadow-lg ring-1 ring-[var(--brand-border)]">
            {done ? (
              <div className="flex h-full flex-col items-center justify-center py-10 text-center">
                <CheckCircle2 className="h-14 w-14 text-[var(--brand-primary)]" />
                <h3 className="mt-4 text-xl font-bold text-[var(--brand-secondary)]">Enquiry Received!</h3>
                <p className="mt-2 max-w-xs text-sm text-[var(--brand-muted)]">Thank you for reaching out. We will contact you within 24 hours.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <h3 className="font-bold text-lg text-[var(--brand-secondary)]">Send an Enquiry</h3>
                {error && <p className="rounded-[var(--brand-radius)] bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-[var(--brand-secondary)]">Name *</span>
                    <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required
                      className="w-full rounded-[var(--brand-radius)] border border-[var(--brand-border)] bg-white px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--brand-primary)]" placeholder="Your name" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-[var(--brand-secondary)]">Phone *</span>
                    <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required type="tel"
                      className="w-full rounded-[var(--brand-radius)] border border-[var(--brand-border)] bg-white px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--brand-primary)]" placeholder="+91 …" />
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-[var(--brand-secondary)]">Email</span>
                  <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} type="email"
                    className="w-full rounded-[var(--brand-radius)] border border-[var(--brand-border)] bg-white px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--brand-primary)]" placeholder="you@example.com" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-[var(--brand-secondary)]">Message</span>
                  <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={4}
                    className="w-full rounded-[var(--brand-radius)] border border-[var(--brand-border)] bg-white px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--brand-primary)]" placeholder="Tell us what you need…" />
                </label>
                <button type="submit" disabled={sending}
                  className="flex w-full items-center justify-center gap-2 rounded-[var(--brand-radius)] bg-[var(--brand-primary)] px-6 py-3 font-semibold text-white shadow transition hover:brightness-110 disabled:opacity-60 active:scale-[0.98]">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {sending ? "Sending…" : "Submit Enquiry"}
                </button>
                {waNumber && (
                  <a href={`https://wa.me/${waNumber}?text=${encodeURIComponent(`Hello ${business.name}!`)}`} target="_blank" rel="noreferrer" onClick={() => onCta("CTA_WHATSAPP")}
                    className="flex w-full items-center justify-center gap-2 rounded-[var(--brand-radius)] bg-[#25D366] px-6 py-3 font-semibold text-white shadow transition hover:brightness-105 active:scale-[0.98]">
                    <MessageCircle className="h-4 w-4" /> Chat on WhatsApp
                  </a>
                )}
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export { Hero, Stats, About, Services, Products, WhyUs, Gallery, Testimonials, FaqSection, CtaBanner, Payment, Hours, Contact, SectionTitle, ICONS };

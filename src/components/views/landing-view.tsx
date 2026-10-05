"use client";
// WebSetu — Landing (marketing) view. Rendered by the app shell for view "home".
// Returns a fragment: sticky navbar + main sections + footer (mt-auto) so the
// shell's `flex min-h-screen flex-col` root keeps the footer pinned to the bottom.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SHOW_LEADS } from "@/lib/marketing-flags";
import { isQuoteOnlyPlan, TRIAL_DAYS_LABEL, TRIAL_LABEL } from "@/lib/trial";
import type { FormEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUp,
  Building2,
  Check,
  ClipboardList,
  ExternalLink,
  Headset,
  Inbox,
  LayoutGrid,
  LayoutTemplate,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Menu,
  MessageCircle,
  Rocket,
  Search,
  Send,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useApp } from "@/store/app-store";
import { CONTACT, PRIVACY, TERMS } from "@/lib/legal";
import { themeVars, type PlatformTheme } from "@/lib/platform-theme";
import type { Plan, TemplateDef } from "@/lib/types";

// Fallback mirrors the seeded template gallery (also safelists the gradient
// utility classes so Tailwind generates them even when gradients come from the API).
const FALLBACK_TEMPLATES: TemplateDef[] = [
  { id: "t1", name: "Modern Pro", slug: "modern-pro", category: "Local Business", description: "", premium: false, gradient: "from-emerald-500 to-teal-600", coverImage: "", theme: {} },
  { id: "t2", name: "Heritage Gold", slug: "heritage-gold", category: "Restaurant & Cafe", description: "", premium: true, gradient: "from-amber-600 to-stone-700", coverImage: "", theme: {} },
  { id: "t3", name: "Bold Services", slug: "bold-services", category: "Services", description: "", premium: false, gradient: "from-orange-500 to-red-600", coverImage: "", theme: {} },
  { id: "t4", name: "Fresh Mint", slug: "fresh-mint", category: "Health & Wellness", description: "", premium: false, gradient: "from-teal-500 to-cyan-600", coverImage: "", theme: {} },
  { id: "t5", name: "Elegant Rose", slug: "elegant-rose", category: "Beauty & Salon", description: "", premium: true, gradient: "from-rose-500 to-stone-800", coverImage: "", theme: {} },
  { id: "t6", name: "Mono Corporate", slug: "mono-corporate", category: "Professional", description: "", premium: true, gradient: "from-zinc-600 to-zinc-800", coverImage: "", theme: {} },
];

/**
 * The header nav.
 *
 * Every entry but one scrolls to a section of this page. Blog is a real page,
 * so it carries an `href` instead of a section id — and it is only added to the
 * list when the platform blog actually has something published. A nav item that
 * leads to "No posts published yet" is worse than no nav item: it is the first
 * thing a visitor clicks to find out whether anyone is home.
 */
const NAV_LINKS: { id: string; label: string; href?: string }[] = [
  { id: "features", label: "Features" },
  { id: "how", label: "How it Works" },
  { id: "templates", label: "Templates" },
  { id: "pricing", label: "Pricing" },
  { id: "faq", label: "FAQ" },
  { id: "contact", label: "Contact" },
];

const BLOG_LINK = { id: "blog", label: "Blog", href: "/blog" };

const CATEGORIES = ["Restaurant", "Clinic", "Manufacturer", "Salon", "Gym", "CA", "Real Estate", "School"];

const FEATURES = [
  { icon: LayoutTemplate, title: "Website Builder", desc: "A guided editor with 12 ready-made sections. Publish a polished multi-page site without touching a line of code." },
  { icon: Sparkles, title: "AI Content", desc: "AI drafts your headlines, service descriptions and About page from your business details — edit anything you like." },
  { icon: Search, title: "SEO & AEO", desc: "Meta tags, sitemap, schema markup and answer-engine optimization so customers find you on Google." },
  { icon: MapPin, title: "Google Maps & GMB", desc: "Embedded directions, business hours and Google Business Profile links that capture nearby searches." },
  ...(SHOW_LEADS
    ? [{ icon: Inbox, title: "Lead CRM", desc: "Every enquiry lands in your lead inbox with statuses, notes and follow-up tracking built right in." }]
    : []),
  { icon: MessageCircle, title: "WhatsApp & Call CTAs", desc: "One-tap WhatsApp chat and click-to-call buttons that turn casual visitors into real conversations." },
];

const STEPS = [
  { icon: ClipboardList, title: "Business details", desc: "Tell us your name, category, services and contact info — takes two minutes." },
  { icon: LayoutGrid, title: "Choose template", desc: "Pick a professionally designed template made for your industry." },
  { icon: Sparkles, title: "AI writes your content", desc: "Our AI drafts headlines, descriptions and SEO copy, ready to edit." },
  {
    icon: Rocket,
    title: SHOW_LEADS ? "Publish & get leads" : "Publish your website",
    desc: "Go live in minutes and start receiving enquiries on WhatsApp.",
  },
];

const STEP_FILL = ["w-1/4", "w-2/4", "w-3/4", "w-full"];

const STATS = [
  { icon: Building2, value: "500+", label: "Businesses online" },
  { icon: LayoutGrid, value: "40+", label: "Business categories" },
  { icon: TrendingUp, value: "95+", label: "Avg. SEO score" },
  { icon: Headset, value: "24/7", label: "Support" },
];

const FAQS = [
  {
    q: "Do I need coding knowledge?",
    a: "Not at all. You answer a few questions about your business, choose a template, and our AI writes the content for you. Your website is ready in about 15 minutes — no coding, no design skills needed.",
  },
  {
    q: "Can I use my own domain?",
    a: "Yes, it is included in the plan. Every site gets a free yourname.websetu.in address, and you can connect a domain you own (bought from GoDaddy, Hostinger, BigRock or any registrar). You pay the registrar for the domain; your WebSetu price stays ₹599/month. The dashboard shows the exact DNS records to add, step by step.",
  },
  {
    q: "What happens after the free trial?",
    a: `Every account starts with a ${TRIAL_LABEL}. When it ends, pick a plan that fits to keep your site live. Your website${SHOW_LEADS ? ", content and leads are" : " and content are"} preserved — nothing is deleted.`,
  },
  {
    q: "Will my website appear on Google?",
    a: "Yes. WebSetu generates SEO meta tags, a sitemap and schema markup for every page, and connects your Google Business Profile. Most businesses start appearing in local search within days.",
  },
  ...(SHOW_LEADS
    ? [{
        q: "Can I manage leads?",
        a: "Absolutely. Every form submission, WhatsApp click and call is captured in your lead inbox with statuses like New, Contacted and Converted, plus notes and follow-up tracking.",
      }]
    : []),
];

// `website` is a honeypot field: hidden from people, filled in by bots. The
// server accepts and discards submissions that carry it.
const EMPTY_LEAD_FORM = { name: "", email: "", phone: "", businessType: "", message: "", website: "" };

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">{children}</p>;
}

function SectionHeading({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div className="mx-auto mb-12 max-w-2xl text-center">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{title}</h2>
      {sub ? <p className="mt-4 text-base text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function FadeIn({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.55, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

function scrollToId(e: ReactMouseEvent<HTMLAnchorElement>, id: string) {
  e.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * Short, plain-language policies. They are shown in a dialog from the footer —
 * previously those links pointed at "#" and did nothing.
 */
/**
 * @param serverTheme the platform palette, resolved on the server.
 *
 * Passed in rather than read from the store because this page is shown to
 * signed-out visitors, who never run the store's hydrate() — the only thing
 * that used to fetch the palette. The store value remains the fallback for any
 * caller that renders this without one.
 */
export default function LandingView({
  platformTheme: serverTheme,
  hasBlogPosts = false,
}: {
  platformTheme?: PlatformTheme;
  /** Whether the platform blog has at least one published post. */
  hasBlogPosts?: boolean;
}) {
  const router = useRouter();
  const user = useApp((s) => s.user);
  const storeTheme = useApp((s) => s.platformTheme);
  const platformTheme = serverTheme ?? storeTheme;
  const storePlans = useApp((s) => s.plans);
  const setAuthMode = useApp((s) => s.setAuthMode);
  const openSite = useApp((s) => s.openSite);
  const { toast } = useToast();

  const [menuOpen, setMenuOpen] = useState(false);
  const [yearly, setYearly] = useState(false);
  const [heroImgOk, setHeroImgOk] = useState(true);
  const [templates, setTemplates] = useState<TemplateDef[]>([]);
  const [fetchedPlans, setFetchedPlans] = useState<Plan[]>([]);
  const [contactOpen, setContactOpen] = useState(false);
  const [leadForm, setLeadForm] = useState(EMPTY_LEAD_FORM);
  const [leadBusy, setLeadBusy] = useState(false);
  const [leadError, setLeadError] = useState("");
  const [legal, setLegal] = useState<"privacy" | "terms" | null>(null);

  // Public catalog: /api/plans returns { plans, templates }.
  useEffect(() => {
    api
      .get<{ plans: Plan[]; templates: TemplateDef[] }>("/api/plans")
      .then((d) => {
        setFetchedPlans(d.plans || []);
        setTemplates(d.templates && d.templates.length > 0 ? d.templates : FALLBACK_TEMPLATES);
      })
      .catch(() => setTemplates(FALLBACK_TEMPLATES));
  }, []);

  const plans = storePlans.length > 0 ? storePlans : fetchedPlans;

  const goRegister = () => {
    if (user) {
      router.push("/onboarding");
      return;
    }
    setAuthMode("register");
    router.push("/login");
  };

  const goLogin = () => {
    setAuthMode("login");
    router.push("/login");
  };

  const goDashboard = () => {
    router.push(user?.role === "ADMIN" ? "/admin" : "/dashboard");
  };

  const handleNavClick = (e: ReactMouseEvent<HTMLAnchorElement>, id: string) => {
    scrollToId(e, id);
    setMenuOpen(false);
  };

  async function submitLead(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLeadBusy(true);
    setLeadError("");
    try {
      const res = await api.post<{ message?: string }>("/api/platform-lead", { ...leadForm, source: "CONTACT" });
      toast({
        title: "Request received 🎉",
        description: res.message || "Our team will reach out to you within 24 hours.",
      });
      setContactOpen(false);
      setLeadForm(EMPTY_LEAD_FORM);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not submit. Please try again.";
      setLeadError(msg);
      toast({ title: "Could not send request", description: msg, variant: "destructive" });
    } finally {
      setLeadBusy(false);
    }
  }

  const navLinks = hasBlogPosts ? [...NAV_LINKS, BLOG_LINK] : NAV_LINKS;

  const navButtons = user ? (
    <Button onClick={goDashboard} className="bg-emerald-600 text-white hover:bg-emerald-700">
      Dashboard
    </Button>
  ) : (
    <div className="flex items-center gap-2">
      <Button variant="ghost" onClick={goLogin} className="text-zinc-700 hover:text-emerald-700">
        Log in
      </Button>
      <Button onClick={goRegister} className="bg-emerald-600 text-white hover:bg-emerald-700">
        Create Your Website
      </Button>
    </div>
  );

  return (
    // `ws-theme` + the palette variables let a platform admin restyle the whole
    // marketing page (see globals.css and Admin -> Appearance).
    <div className="ws-theme contents" style={themeVars(platformTheme) as React.CSSProperties}>
      {/* ---------- Navbar ---------- */}
      <header className="sticky top-0 z-50 border-b border-border/80 bg-white/80 backdrop-blur-md">
        <nav aria-label="Main navigation" className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <a
            href="/"
            className="flex items-center gap-2.5"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 text-lg font-bold text-white shadow-sm">
              W
            </span>
            <span className="text-lg font-bold tracking-tight text-foreground">WebSetu</span>
          </a>

          <div className="hidden items-center gap-7 lg:flex">
            {navLinks.map((l) => (
              <a
                key={l.id}
                href={l.href ?? `#${l.id}`}
                // A real page navigates; a section id scrolls.
                onClick={l.href ? undefined : (e) => scrollToId(e, l.id)}
                className="rounded text-sm font-medium text-zinc-600 transition-colors hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
              >
                {l.label}
              </a>
            ))}
          </div>

          <div className="hidden lg:block">{navButtons}</div>

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border text-zinc-700 lg:hidden"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </nav>

        {menuOpen ? (
          <div className="border-t border-border bg-white px-4 py-4 lg:hidden">
            <div className="flex flex-col gap-1">
              {navLinks.map((l) => (
                <a
                  key={l.id}
                  href={l.href ?? `#${l.id}`}
                  onClick={l.href ? () => setMenuOpen(false) : (e) => handleNavClick(e, l.id)}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-700 hover:bg-emerald-50 hover:text-emerald-700"
                >
                  {l.label}
                </a>
              ))}
            </div>
            <div className="mt-3 flex flex-col gap-2 border-t border-zinc-100 pt-3">
              {user ? (
                <Button onClick={goDashboard} className="w-full bg-emerald-600 text-white hover:bg-emerald-700">
                  Dashboard
                </Button>
              ) : (
                <>
                  <Button variant="outline" onClick={goLogin} className="w-full">
                    Log in
                  </Button>
                  <Button onClick={goRegister} className="w-full bg-emerald-600 text-white hover:bg-emerald-700">
                    Create Your Website
                  </Button>
                </>
              )}
            </div>
          </div>
        ) : null}
      </header>

      <main>
        {/* ---------- Hero ---------- */}
        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute -left-32 top-10 h-80 w-80 rounded-full bg-emerald-100 opacity-60 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-amber-100 opacity-50 blur-3xl" />

          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-2 lg:pt-20">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            >
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-xs font-semibold text-emerald-800">
                🇮🇳 India&apos;s Business Website Platform
              </span>
              <h1 className="mt-6 text-4xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-5xl lg:text-[3.4rem]">
                Your Business,{" "}
                <span className="bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                  Online in 15 Minutes
                </span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-zinc-600 sm:text-lg">
                Give us your business details — we create and operate your complete online presence. Website + Google +
                SEO {SHOW_LEADS ? "+ Leads " : ""}+ WhatsApp + Analytics. No coding. No hassle.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button
                  size="lg"
                  onClick={goRegister}
                  className="h-12 bg-emerald-600 px-7 text-base text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700"
                >
                  Create Your Website
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => openSite("sharma-electricals", "public")}
                  className="h-12 border-zinc-300 px-6 text-base text-zinc-700 hover:border-emerald-300 hover:text-emerald-700"
                >
                  <ExternalLink className="h-4 w-4" />
                  View Demo Website
                </Button>
              </div>
              <p className="mt-5 text-sm text-muted-foreground">{TRIAL_LABEL} · No credit card required · Cancel anytime</p>
            </motion.div>

            {/* Mock browser window */}
            <motion.div
              initial={{ opacity: 0, y: 32 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
              className="relative"
            >
              <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-2xl shadow-emerald-900/10">
                <div className="flex items-center gap-2 border-b border-zinc-100 bg-zinc-50 px-4 py-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  <span className="ml-3 flex-1 truncate rounded-md border border-border bg-white px-3 py-1 text-xs text-muted-foreground">
                    https://sharmaelectricals.in
                  </span>
                </div>
                <div className="relative h-28 bg-gradient-to-br from-emerald-600 to-teal-700 sm:h-36">
                  {heroImgOk ? (
                    <img
                      src="/images/hero-business.jpg"
                      alt="Business website hero preview"
                      className="absolute inset-0 h-full w-full object-cover"
                      onError={() => setHeroImgOk(false)}
                    />
                  ) : null}
                  <div className="absolute inset-0 flex flex-col justify-end gap-2 bg-gradient-to-t from-black/40 via-black/10 to-transparent p-5">
                    <div className="h-3.5 w-44 rounded bg-white/85" />
                    <div className="h-2 w-60 max-w-full rounded bg-white/55" />
                  </div>
                </div>
                <div className="space-y-4 p-5">
                  <div className="space-y-2">
                    <div className="h-3 w-1/2 rounded bg-zinc-200" />
                    <div className="h-2 w-3/4 rounded bg-zinc-100" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {["Wiring & Repairs", "Panel Setup", "24×7 Support"].map((s) => (
                      <div key={s} className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
                        <div className="mb-2 h-6 w-6 rounded-lg bg-emerald-100" />
                        <p className="truncate text-[10px] font-medium text-zinc-600">{s}</p>
                        <div className="mt-1.5 h-1.5 w-full rounded bg-zinc-200" />
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[10px] font-semibold text-white">
                      Get a Free Quote
                    </span>
                    <span className="rounded-lg border border-border px-3 py-1.5 text-[10px] font-medium text-zinc-600">
                      Call Now
                    </span>
                  </div>
                </div>
              </div>

              {/* Floating stat chips */}
              <div className="absolute -right-3 -top-5 hidden items-center gap-2.5 rounded-2xl border border-border bg-white px-4 py-2.5 shadow-xl shadow-zinc-900/10 sm:flex">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100">
                  <Users className="h-4 w-4 text-emerald-700" />
                </span>
                <span>
                  <span className="block text-sm font-bold text-foreground">500+</span>
                  <span className="block text-[10px] text-muted-foreground">businesses online</span>
                </span>
              </div>
              <div className="absolute -bottom-5 -left-3 hidden items-center gap-2.5 rounded-2xl border border-border bg-white px-4 py-2.5 shadow-xl shadow-zinc-900/10 sm:flex">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100">
                  <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                </span>
                <span>
                  <span className="block text-sm font-bold text-foreground">★ 4.9</span>
                  <span className="block text-[10px] text-muted-foreground">customer rating</span>
                </span>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ---------- Trust bar ---------- */}
        <section className="border-y border-border bg-zinc-50 py-10">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <p className="text-center text-sm font-medium text-muted-foreground">
              Works for <span className="font-bold text-foreground">40+ business categories</span>
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
              {CATEGORIES.map((c) => (
                <span
                  key={c}
                  className="rounded-full border border-border bg-white px-4 py-1.5 text-sm text-zinc-600 shadow-sm"
                >
                  {c}
                </span>
              ))}
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-sm font-semibold text-emerald-700">
                +37 more
              </span>
            </div>
          </div>
        </section>

        {/* ---------- Features ---------- */}
        <section id="features" className="scroll-mt-20 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading
              eyebrow="Features"
              title="Everything you need to win online"
              sub="One platform that builds, hosts and grows your business website — so you can focus on your customers."
            />
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f, i) => (
                <FadeIn key={f.title} delay={i * 0.06}>
                  <div className="group h-full rounded-2xl border border-border bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-900/5">
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 transition-colors group-hover:bg-emerald-100">
                      <f.icon className="h-6 w-6 text-emerald-600" />
                    </span>
                    <h3 className="mt-5 text-lg font-semibold text-foreground">{f.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- How it works ---------- */}
        <section id="how" className="scroll-mt-20 border-y border-border bg-zinc-50 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading
              eyebrow="How it works"
              title="From zero to live in four simple steps"
              sub="No designers, no developers, no back-and-forth. Just answer, choose, publish."
            />
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <FadeIn key={s.title} delay={i * 0.08}>
                  <div className="h-full rounded-2xl border border-border bg-white p-6 shadow-sm">
                    <div className="mb-5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                      <div className={cn("h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-600", STEP_FILL[i])} />
                    </div>
                    <span className="text-xs font-bold tracking-wider text-emerald-700">STEP {i + 1}</span>
                    <div className="mt-3 flex items-center gap-2.5">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50">
                        <s.icon className="h-5 w-5 text-emerald-600" />
                      </span>
                      <h3 className="font-semibold text-foreground">{s.title}</h3>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Templates ---------- */}
        <section id="templates" className="scroll-mt-20 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading
              eyebrow="Templates"
              title="Beautiful templates for every industry"
              sub="Hand-crafted designs that our AI fills with your content. Pick one and make it yours."
            />
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {templates.length === 0
                ? Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
                      <div className="h-28 animate-pulse bg-zinc-100" />
                      <div className="space-y-2 p-4">
                        <div className="h-4 w-1/2 animate-pulse rounded bg-zinc-100" />
                        <div className="h-3 w-1/3 animate-pulse rounded bg-zinc-100" />
                      </div>
                    </div>
                  ))
                : templates.slice(0, 6).map((t, i) => (
                    <FadeIn key={t.id} delay={i * 0.05}>
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={`Use the ${t.name} template`}
                        onClick={goRegister}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") goRegister();
                        }}
                        className="group h-full cursor-pointer overflow-hidden rounded-2xl border border-border bg-white shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-emerald-900/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                      >
                        <div className={cn("relative h-28 bg-gradient-to-br", t.gradient)}>
                          <div aria-hidden className="absolute inset-x-5 bottom-4 space-y-2">
                            <div className="h-2 w-1/2 rounded bg-white/60" />
                            <div className="h-1.5 w-1/3 rounded bg-white/40" />
                          </div>
                          {t.premium ? (
                            <Badge className="absolute right-3 top-3 border-amber-300 bg-amber-500 text-white shadow-sm">
                              Premium
                            </Badge>
                          ) : null}
                        </div>
                        <div className="p-4">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-semibold text-foreground">{t.name}</p>
                            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-600" />
                          </div>
                          <p className="mt-0.5 text-sm text-muted-foreground">{t.category}</p>
                        </div>
                      </div>
                    </FadeIn>
                  ))}
            </div>
          </div>
        </section>

        {/* ---------- Pricing ---------- */}
        <section id="pricing" className="scroll-mt-20 border-y border-border bg-zinc-50 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading
              eyebrow="Pricing"
              title="One simple price. Everything included."
              sub={`Start free for ${TRIAL_DAYS_LABEL}. Bring your own domain — your monthly price never changes. Cancel anytime.`}
            />

            <div className="mb-12 flex items-center justify-center gap-3">
              <span className={cn("text-sm font-medium", !yearly ? "text-foreground" : "text-muted-foreground")}>Monthly</span>
              <Switch
                checked={yearly}
                onCheckedChange={setYearly}
                aria-label="Toggle yearly pricing"
                className="data-[state=checked]:bg-emerald-600"
              />
              <span className={cn("text-sm font-medium", yearly ? "text-foreground" : "text-muted-foreground")}>Yearly</span>
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                2 months free
              </Badge>
            </div>

            <div
              className={cn(
                "grid grid-cols-1 gap-6 pt-3",
                plans.length === 1 ? "mx-auto max-w-md" : "md:grid-cols-2 lg:grid-cols-4",
              )}
            >
              {plans.length === 0
                ? Array.from({ length: 1 }).map((_, i) => (
                    <div key={i} className="h-96 animate-pulse rounded-2xl border border-border bg-white/60" />
                  ))
                : plans.map((p) => {
                    // Quote-only tiers cannot be signed up for — they open the
                    // sales conversation instead of the registration form.
                    const isCustom = isQuoteOnlyPlan(p);
                    const popular = p.popular;
                    const price = yearly ? p.priceYearly : p.priceMonthly;
                    return (
                      <div
                        key={p.id}
                        className={cn(
                          "relative flex h-full flex-col rounded-2xl border bg-white p-6 shadow-sm transition-shadow hover:shadow-lg",
                          popular ? "border-emerald-600 shadow-lg shadow-emerald-900/10 ring-2 ring-emerald-600 lg:scale-105" : "border-border"
                        )}
                      >
                        {popular ? (
                          <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 border-transparent bg-emerald-600 text-white shadow-sm">
                            MOST POPULAR
                          </Badge>
                        ) : null}

                        <h3 className="text-lg font-bold text-foreground">{p.name}</h3>
                        <p className="mt-1 min-h-10 text-sm text-muted-foreground">{p.tagline}</p>

                        <div className="mt-5 flex items-baseline gap-1.5">
                          {isCustom ? (
                            <span className="text-3xl font-bold tracking-tight text-foreground">Custom</span>
                          ) : (
                            <>
                              <span className="text-4xl font-bold tracking-tight text-foreground">
                                ₹{price.toLocaleString("en-IN")}
                              </span>
                              <span className="text-sm text-muted-foreground">/{yearly ? "year" : "month"}</span>
                            </>
                          )}
                        </div>
                        {yearly && !isCustom ? (
                          <Badge variant="outline" className="mt-2 w-fit border-amber-200 bg-amber-50 text-amber-800">
                            2 months free
                          </Badge>
                        ) : (
                          <p className="mt-2 text-xs text-muted-foreground">{isCustom ? "Tailored to your business" : "Billed monthly, cancel anytime"}</p>
                        )}

                        {/* Hard limits, straight from the plan record. AI credits
                            are an internal allowance and are not advertised here. */}
                        <dl className="mt-5 grid grid-cols-2 gap-2 rounded-xl border border-zinc-100 bg-zinc-50/80 p-3 text-center">
                          {([
                            [p.maxPages === -1 ? "∞" : String(p.maxPages), "Pages"],
                            [(p.maxPalettes ?? -1) === -1 ? "All" : String(p.maxPalettes), "Palettes"],
                          ] as const).map(([value, label]) => (
                            <div key={label}>
                              <dt className="sr-only">{label}</dt>
                              <dd className="text-sm font-bold text-foreground">{value}</dd>
                              <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{label}</p>
                            </div>
                          ))}
                        </dl>

                        <ul className="mt-5 flex-1 space-y-2.5">
                          {p.features.map((f) => (
                            <li key={f} className="flex items-start gap-2 text-sm text-zinc-600">
                              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                              {f}
                            </li>
                          ))}
                        </ul>

                        <Button
                          onClick={isCustom ? () => setContactOpen(true) : goRegister}
                          className={cn(
                            "mt-6 w-full",
                            popular
                              ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700"
                              : "border border-zinc-300 bg-white text-zinc-800 hover:border-emerald-300 hover:text-emerald-700"
                          )}
                          variant={popular ? "default" : "outline"}
                        >
                          {isCustom ? "Talk to Sales" : `Start ${TRIAL_DAYS_LABEL} Free Trial`}
                        </Button>
                      </div>
                    );
                  })}
            </div>
          </div>
        </section>

        {/* ---------- Stats band ---------- */}
        <section className="bg-zinc-900 py-14">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-10 px-4 sm:px-6 md:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label} className="text-center">
                <s.icon className="mx-auto h-6 w-6 text-emerald-400" />
                <p className="mt-3 text-3xl font-bold text-white sm:text-4xl">{s.value}</p>
                <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- FAQ ---------- */}
        <section id="faq" className="scroll-mt-20 py-20 sm:py-24">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <SectionHeading eyebrow="FAQ" title="Frequently asked questions" sub="Everything you need to know before getting started." />
            <FadeIn>
              <Accordion type="single" collapsible className="rounded-2xl border border-border bg-white px-6 shadow-sm">
                {FAQS.map((f, i) => (
                  <AccordionItem key={f.q} value={`faq-${i}`}>
                    <AccordionTrigger className="text-left text-base font-semibold text-foreground hover:text-emerald-700 hover:no-underline">
                      {f.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm leading-relaxed text-muted-foreground">{f.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </FadeIn>
          </div>
        </section>

        {/* ---------- Talk to a person ---------- */}
        <section id="contact" className="scroll-mt-20 border-t border-zinc-100 bg-[#f8fafc] py-20 sm:py-24">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <SectionHeading
              eyebrow="Talk to us"
              title="Prefer to speak to someone?"
              sub="Call any of us directly — no forms, no waiting for a reply."
            />
            <FadeIn>
              <div className={cn("grid gap-4", CONTACT.people.length > 1 && "sm:grid-cols-2")}>
                {CONTACT.people.map((person) => (
                  <a
                    key={person.href}
                    href={`tel:${person.href}`}
                    className="group flex items-center gap-4 rounded-2xl border border-border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 sm:p-5"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 transition-colors group-hover:bg-emerald-100">
                      <Phone className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-foreground">{person.name}</span>
                      <span className="mt-0.5 block text-sm font-medium text-emerald-700">{person.display}</span>
                    </span>
                  </a>
                ))}
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <a
                  href={`mailto:${CONTACT.email}`}
                  className="group flex items-center gap-4 rounded-2xl border border-border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 sm:p-5"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 transition-colors group-hover:bg-emerald-100">
                    <Mail className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-foreground">Email us</span>
                    <span className="mt-0.5 block break-all text-sm font-medium text-emerald-700">{CONTACT.email}</span>
                  </span>
                </a>
                <button
                  type="button"
                  onClick={() => setContactOpen(true)}
                  className="group flex items-center gap-4 rounded-2xl border border-border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 sm:p-5"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 transition-colors group-hover:bg-emerald-100">
                    <Headset className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-foreground">Request a callback</span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">We call back within 24 hours</span>
                  </span>
                </button>
              </div>
            </FadeIn>
          </div>
        </section>

        {/* ---------- Final CTA ---------- */}
        <section className="px-4 pb-20 sm:px-6">
          <FadeIn className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 px-6 py-16 text-center shadow-2xl shadow-emerald-900/25">
            <div aria-hidden className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
            <div aria-hidden className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-amber-400/20 blur-3xl" />
            <h2 className="relative text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Ready to bring your business online?
            </h2>
            <p className="relative mx-auto mt-4 max-w-xl text-emerald-100">
              Join 500+ businesses already growing with WebSetu. Your website{SHOW_LEADS ? ", leads" : ""} and Google
              presence — all in one place.
            </p>
            <Button
              size="lg"
              onClick={goRegister}
              className="relative mt-8 h-12 bg-white px-8 text-base font-semibold text-emerald-700 shadow-lg hover:bg-emerald-50"
            >
              Create Your Website
              <ArrowRight className="h-4 w-4" />
            </Button>
            <p className="relative mt-4 text-xs text-emerald-200">{TRIAL_LABEL} · No credit card required</p>
          </FadeIn>
        </section>
      </main>

      {/* ---------- Footer (mt-auto keeps it pinned to the bottom) ---------- */}
      <footer className="mt-auto bg-zinc-950 text-muted-foreground">
        {/* Closing prompt — the last thing a scrolling visitor sees */}
        <div className="border-b border-white/10">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-5 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-lg font-semibold text-white">Still deciding?</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Talk to our team — we will set up your first website with you, free.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={goRegister} className="bg-emerald-600 text-white hover:bg-emerald-700">
                Start free trial <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                variant="outline"
                onClick={() => setContactOpen(true)}
                className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
              >
                <Headset className="h-4 w-4" aria-hidden="true" /> Talk to sales
              </Button>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-12">
            {/* Brand */}
            <div className="lg:col-span-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 text-lg font-bold text-white">
                  W
                </span>
                <span className="text-lg font-bold tracking-tight text-white">WebSetu</span>
              </div>
              <p className="mt-4 max-w-sm text-sm leading-relaxed">
                Aapke business ko online lane ka complete solution — website, Google presence, SEO,{SHOW_LEADS ? " leads," : ""}
                WhatsApp and analytics in one place.
              </p>
              <ul className="mt-5 space-y-1.5 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" /> {TRIAL_LABEL}, no card needed
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" /> Your content stays yours
                </li>
              </ul>
            </div>

            {/* Product */}
            <nav aria-label="Product" className="lg:col-span-2">
              <p className="text-sm font-semibold text-white">Product</p>
              <ul className="mt-4 space-y-2.5 text-sm">
                {([
                  ["Features", "features"],
                  ["How it works", "how"],
                  ["Templates", "templates"],
                  ["Pricing", "pricing"],
                  ["FAQ", "faq"],
                ] as const).map(([label, id]) => (
                  <li key={id}>
                    <a
                      href={`#${id}`}
                      onClick={(e) => scrollToId(e, id)}
                      className="rounded transition-colors hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            {/* Account */}
            <nav aria-label="Account" className="lg:col-span-2">
              <p className="text-sm font-semibold text-white">Account</p>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li>
                  <button
                    type="button"
                    onClick={user ? goDashboard : goLogin}
                    className="rounded transition-colors hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  >
                    {user ? "Dashboard" : "Log in"}
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={goRegister}
                    className="rounded transition-colors hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  >
                    Create account
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => openSite("sharma-electricals", "public")}
                    className="rounded transition-colors hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  >
                    See a live example
                  </button>
                </li>
                <li>
                  <a
                    href="/blog"
                    className="rounded transition-colors hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  >
                    Blog
                  </a>
                </li>
              </ul>
            </nav>

            {/* Contact — real, actionable links rather than dead anchors */}
            <div className="sm:col-span-2 lg:col-span-4">
              <p className="text-sm font-semibold text-white">Get in touch</p>
              <ul className="mt-4 space-y-3 text-sm">
                <li>
                  <a
                    href={`mailto:${CONTACT.email}`}
                    className="group flex items-center gap-3 rounded transition-colors hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 text-emerald-400 transition-colors group-hover:bg-white/10">
                      <Mail className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span>
                      <span className="block text-xs text-muted-foreground">Email</span>
                      {CONTACT.email}
                    </span>
                  </a>
                </li>
                {/* One number here, the full team in the contact section above —
                    listing all four twice on one page just adds noise. */}
                <li>
                  <a
                    href={`tel:${CONTACT.people[0].href}`}
                    className="group flex items-center gap-3 rounded transition-colors hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 text-emerald-400 transition-colors group-hover:bg-white/10">
                      <Phone className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span>
                      <span className="block text-xs text-muted-foreground">{CONTACT.people[0].name}</span>
                      {CONTACT.people[0].display}
                    </span>
                  </a>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setContactOpen(true)}
                    className="group flex w-full items-center gap-3 rounded text-left transition-colors hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 text-emerald-400 transition-colors group-hover:bg-white/10">
                      <Headset className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span>
                      <span className="block text-xs text-muted-foreground">Sales</span>
                      Request a callback
                    </span>
                  </button>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 text-xs sm:flex-row">
            <p>© {new Date().getFullYear()} WebSetu. Made with ❤️ in India 🇮🇳</p>
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
              <button
                type="button"
                onClick={() => setLegal("privacy")}
                className="rounded transition-colors hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                Privacy
              </button>
              <button
                type="button"
                onClick={() => setLegal("terms")}
                className="rounded transition-colors hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                Terms
              </button>
              <button
                type="button"
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                className="flex items-center gap-1.5 rounded transition-colors hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                Back to top <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* ---------- Privacy / Terms ---------- */}
      <Dialog open={legal !== null} onOpenChange={(o) => !o && setLegal(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{legal === "terms" ? "Terms of Service" : "Privacy Policy"}</DialogTitle>
            <DialogDescription>
              {legal === "terms"
                ? "The short version of what you agree to when you use WebSetu."
                : "What we collect, why we collect it, and what we never do with it."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm leading-relaxed text-zinc-600">
            {(legal === "terms" ? TERMS : PRIVACY).map((item) => (
              <div key={item.heading}>
                <p className="font-semibold text-foreground">{item.heading}</p>
                <p className="mt-1">{item.body}</p>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Questions? Write to {CONTACT.email} and we will answer within one working day.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---------- Talk to Sales dialog ---------- */}
      <Dialog open={contactOpen} onOpenChange={setContactOpen}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Talk to Sales</DialogTitle>
            <DialogDescription>
              Tell us a bit about your business — our team will call you back within 24 hours.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitLead} className="space-y-4">
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              value={leadForm.website}
              onChange={(e) => setLeadForm((f) => ({ ...f, website: e.target.value }))}
              className="hidden"
            />
            <div className="space-y-1.5">
              <Label htmlFor="lead-name">Name *</Label>
              <Input
                id="lead-name"
                required
                autoComplete="name"
                value={leadForm.name}
                onChange={(e) => setLeadForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ramesh Sharma"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="lead-email">Email</Label>
                <Input
                  id="lead-email"
                  type="email"
                  autoComplete="email"
                  value={leadForm.email}
                  onChange={(e) => setLeadForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="you@business.in"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lead-phone">Phone</Label>
                <Input
                  id="lead-phone" inputMode="tel"
                  type="tel"
                  autoComplete="tel"
                  value={leadForm.phone}
                  onChange={(e) => setLeadForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+91 98765 43210"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-type">Business type</Label>
              <Input
                id="lead-type"
                value={leadForm.businessType}
                onChange={(e) => setLeadForm((f) => ({ ...f, businessType: e.target.value }))}
                placeholder="Restaurant, clinic, manufacturer…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-message">Message</Label>
              <Textarea
                id="lead-message"
                rows={3}
                value={leadForm.message}
                onChange={(e) => setLeadForm((f) => ({ ...f, message: e.target.value }))}
                placeholder="Tell us what you need…"
              />
            </div>
            {leadError ? <p className="text-sm font-medium text-red-600">{leadError}</p> : null}
            <DialogFooter>
              <Button
                type="submit"
                disabled={leadBusy}
                className="w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto"
              >
                {leadBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {leadBusy ? "Sending…" : "Send Request"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

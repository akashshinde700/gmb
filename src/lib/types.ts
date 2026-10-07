// WebSetu — Shared TypeScript contracts (used by frontend + backend)

export type UserRole = "CUSTOMER" | "ADMIN";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export type BusinessStatus = "DRAFT" | "PUBLISHED" | "SUSPENDED" | "EXPIRED" | "ARCHIVED";
export type SubscriptionStatus = "TRIALING" | "ACTIVE" | "PAST_DUE" | "EXPIRED" | "CANCELED";
export type LeadStatus = "NEW" | "CONTACTED" | "FOLLOW_UP" | "QUALIFIED" | "CONVERTED" | "CLOSED" | "SPAM";

export interface BusinessHours {
  mon?: string; tue?: string; wed?: string; thu?: string; fri?: string; sat?: string; sun?: string;
}

export interface SocialLinks {
  facebook?: string; instagram?: string; youtube?: string; linkedin?: string; x?: string; pinterest?: string;
}

export interface Business {
  id: string;
  name: string;
  slug: string;
  category: string;
  tagline: string;
  description: string;
  ownerName: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  city: string;
  state: string;
  country: string;
  pincode: string;
  establishedYear: string;
  gstin: string;
  logoUrl: string;
  coverUrl: string;
  brandPrimary: string;
  brandSecondary: string;
  brandAccent: string;
  templateId: string;
  gmbUrl: string;
  mapsUrl: string;
  placeId: string;
  upiId: string;
  paymentQrUrl: string;
  hours: BusinessHours;
  socials: SocialLinks;
  /**
   * Where each imported detail came from — { phone: { value, source, at } }.
   * Anything not listed here was typed by the owner, and nothing in it was
   * invented (see lib/places.ts).
   */
  facts?: Record<string, { value: string; source: "google" | "link" | "owner"; at?: string }>;
  status: BusinessStatus;
  createdAt: string;
}

export type SectionType =
  | "hero" | "about" | "stats" | "services" | "products" | "whyUs"
  | "gallery" | "testimonials" | "faq" | "blog" | "cta" | "payment" | "contact" | "hours";

/**
 * The genome behind a generated site, kept with the site itself.
 *
 * It is what makes a later change possible without rebuilding the whole page:
 * the section plan says which arrangement each section uses, and the business
 * genome says what the design was trying to be, so one section can be re-rolled
 * or re-written on its own.
 *
 * The shapes are repeated here rather than imported from lib/design-dna.ts,
 * which imports this file — the two must not depend on each other in a circle.
 */
export interface SiteDna {
  /** The stable seed every design choice was drawn from. */
  seed?: string;
  /** Human-readable design direction, e.g. "Premium editorial". */
  styleName: string;
  /** How the animation pack reads to a person, e.g. "Confident, unhurried motion". */
  motionLabel: string;
  business: {
    industry: string;
    subType: string;
    audience: string;
    personality: string;
    positioning: string;
    tone: string;
  };
  sectionPlan: { type: SectionType; variant: string }[];
  /**
   * What the site is for, decided by the director before anything was drawn:
   * a clinic earns appointments, a manufacturer earns quotation requests.
   */
  goal?: {
    key: string;
    label: string;
    primary: string;
    secondary: string | null;
    action: string;
  };
  /**
   * The director's brief, stage by stage — business understood, audience,
   * positioning, goal, design direction, page structure, components, content
   * and animation. Shown to the owner, because a person who can read the plan
   * can disagree with one line of it instead of disliking the whole site.
   */
  stages?: { name: string; detail: string }[];
}

/**
 * What the quality checker found when the site was generated.
 *
 * The shapes are structural copies of QualityIssue / QualityReport in
 * lib/site-quality.ts (which imports this file, so the dependency cannot run
 * the other way). `dimensions` is the eight scores the dashboard shows.
 */
export interface SiteQualityReport {
  score: number;
  dimensions?: Record<
    "design" | "mobile" | "seo" | "accessibility" | "performance" | "content" | "conversion" | "uniqueness",
    number
  >;
  issues: {
    area: string;
    dimension?: string;
    message: string;
    penalty: number;
    /** Set when the platform can apply this fix itself. */
    fix?: string;
  }[];
  checkedAt: string;
}

export interface SiteSection {
  id: string;
  type: SectionType;
  visible: boolean;
  content: Record<string, unknown>;
}

export interface SiteTheme {
  font: "modern" | "classic" | "elegant";
  radius: "sharp" | "rounded" | "pill";
  heroStyle: "image" | "gradient" | "split";
  cardStyle: "flat" | "shadow" | "outline";
  containerWidth: "normal" | "wide";
  /** Industry hero animation; absent means "auto". */
  motif?: "auto" | "none";
  /** Industry preset key that drives look & animation; absent means "from category". */
  industry?: string;
  /**
   * The rest of the Design DNA (see lib/design-dna.ts). All optional: a site
   * generated before these existed, or edited by hand, must keep rendering —
   * the renderer falls back to the old behaviour for anything absent.
   */
  shadow?: "none" | "soft" | "lifted" | "dramatic";
  button?: "solid" | "outline" | "soft" | "gradient" | "square";
  spacing?: "tight" | "normal" | "airy";
  header?: "sticky" | "minimal" | "topbar" | "centred";
  footer?: "columned" | "compact" | "statement";
  imageTreatment?: "plain" | "duotone" | "framed" | "soft-focus";
  /** Animation pack and intensity 0–4; the renderer gates motion by level. */
  motion?: { pack: "minimal" | "corporate" | "modern" | "premium" | "playful"; level: number };
  /** The genome this site was built from, so it can be shown and regenerated. */
  dna?: SiteDna;
  /**
   * How unlike the other sites in this trade this one is, 0–100, measured when
   * the site was generated. 100 means nothing similar existed, or this is the
   * first business in the trade.
   */
  uniqueness?: number;
  /** Output of the quality checker (lib/site-quality.ts). */
  quality?: SiteQualityReport;
  /**
   * The one test running on the site, if any (lib/experiments.ts). Stored with
   * the theme rather than in its own table: it is a property of the page, it
   * travels with the version history, and it has to be undone when it ends.
   */
  experiments?: {
    key: SectionType;
    status: "running" | "stopped";
    metric: "enquiries";
    variants: { id: "a" | "b"; content: Record<string, string>; source: "site" | "owner" | "ai" }[];
    startedAt: string;
    stoppedAt?: string;
  };
  /**
   * Autopilot: the platform's own maintenance pass over a published site.
   * Absent means "on" — a customer should not have to find a switch to get
   * their site kept in order.
   */
  autopilot?: {
    enabled?: boolean;
    lastRunAt?: string;
    /** What the last pass changed, in the owner's language. */
    lastChanged?: string[];
    lastScore?: number;
  };
}

export interface WebsiteData {
  seoTitle: string;
  seoDescription: string;
  keywords: string;
  ogImage: string;
  theme: SiteTheme;
  sections: SiteSection[];
  version: number;
  publishedAt: string | null;
}

export interface Service {
  id: string; name: string; description: string; image: string; icon: string;
  price: string; featured: boolean; sortOrder: number;
}

export interface Product {
  id: string; name: string; sku: string; category: string; shortDesc: string; description: string;
  price: number | null; salePrice: number | null; image: string; videoUrl: string; hidePrice: boolean; featured: boolean; sortOrder: number;
}

export interface GalleryItem { id: string; url: string; caption: string; alt: string; sortOrder: number; }
export interface Testimonial { id: string; name: string; role: string; content: string; rating: number; avatar: string; sortOrder: number; }
export interface Faq { id: string; question: string; answer: string; sortOrder: number; }

export interface BlogPost {
  id: string; title: string; slug: string; excerpt: string; content: string; cover: string;
  author: string; category: string; tags: string; published: boolean; publishedAt: string | null;
}

export interface Lead {
  id: string; name: string; phone: string; email: string; message: string; source: string;
  serviceName: string; status: LeadStatus; notes: string; createdAt: string;
}

export interface Plan {
  id: string; name: string; slug: string; tagline: string;
  priceMonthly: number; priceYearly: number; features: string[];
  maxPages: number; aiCredits: number;
  /** How many brand palettes this plan may choose from; -1 = the whole library. */
  maxPalettes: number;
  /** Custom domains bundled into this plan; -1 = unlimited. Add-on credits add to it. */
  maxDomains: number;
  /** Design changes allowed on this plan; -1 = unlimited (the default). */
  maxThemeChanges: number;
  popular: boolean; active: boolean; sortOrder: number;
  /** Set when the plan is dedicated to one customer (hidden from public pricing). */
  customForBusinessId?: string | null;
}

export interface Subscription {
  id: string; planId: string; cycle: "MONTHLY" | "YEARLY"; status: SubscriptionStatus;
  amount: number; startedAt: string; renewsAt: string | null; trialEndsAt: string | null;
  plan?: Plan;
}

/** How many times the customer may still restyle their website. */
export interface AppearanceAllowance {
  used: number;
  /** Total allowed; -1 means unlimited. */
  limit: number;
  canChange: boolean;
  unlimited: boolean;
  /** Changes left; -1 when unlimited. */
  remaining: number;
}

export interface TemplateDef {
  id: string; name: string; slug: string; category: string; description: string;
  premium: boolean; gradient: string; coverImage: string; theme: Partial<SiteTheme>;
}

export interface AnalyticsSummary {
  visits: number; uniqueVisits: number; leads: number;
  ctaCalls: number; ctaWhatsapp: number; ctaEmail: number; formSubmits: number;
  daily: { date: string; visits: number; leads: number }[];
}

export interface HealthCheck { key: string; label: string; pass: boolean; weight: number; }
export interface HealthReport { score: number; checks: HealthCheck[]; recommendations: string[]; }

// Full public payload for rendering a tenant website
export interface SitePayload {
  business: Business;
  website: WebsiteData;
  services: Service[];
  products: Product[];
  gallery: GalleryItem[];
  testimonials: Testimonial[];
  faqs: Faq[];
  blogPosts: Pick<BlogPost, "id" | "title" | "slug" | "excerpt" | "cover" | "publishedAt">[];
  /** Canonical custom hostname, or null when the site lives under /s/<slug>. */
  primaryDomain: string | null;
  subscriptionStatus: string;
  trialMode: boolean;
  published?: boolean;
}

// Auth API
export interface AuthResponse { token: string; user: SessionUser; business: Business | null; }

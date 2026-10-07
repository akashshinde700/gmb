// WebSetu — Shared TypeScript contracts (used by frontend + backend)

/**
 * What an account is for.
 *
 * RESELLER is an agency that builds sites for its own clients through the
 * Builder API: a normal account, plus a brand and API keys. It is not a
 * permission level — a reseller has no more access to other people's data than
 * a customer does. Admin is enabled out of band, never by signing up.
 */
export type UserRole = "CUSTOMER" | "ADMIN" | "RESELLER";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export type BusinessStatus = "DRAFT" | "PUBLISHED" | "SUSPENDED" | "EXPIRED" | "ARCHIVED";

/** What an order is doing. Terminal states: DELIVERED (can still re-open) and CANCELLED. */
export type OrderStatus = "NEW" | "CONFIRMED" | "PACKED" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED";

/** How the shop sells online. Stored per business in Business.commerceJson. */
export interface CommerceSettings {
  /** Off by default: a business that does not sell online must not sprout a cart. */
  enabled: boolean;
  deliveryCharge: number;
  /** Delivery becomes free at or above this subtotal; 0 means "no such rule". */
  freeDeliveryAbove: number;
  /** Below this, an order cannot be placed; 0 means "no minimum". */
  minOrder: number;
  pickup: boolean;
  cod: boolean;
}

/** One line of an order, as it was sold — name and price are a copy, not a join. */
export interface OrderItem {
  productId: string;
  name: string;
  qty: number;
  price: number;
}
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
  facts?: Record<string, { value: string; source: "google" | "link" | "owner" | "website"; at?: string }>;
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
   * Where this site's design came from, when it came in from a Figma file or a
   * design-token export (lib/figma.ts). Kept on the theme so the panel can say
   * it, the version history carries it, and a second import can be compared
   * against the first rather than against a mystery.
   */
  figma?: {
    source: "figma" | "tokens";
    fileName: string;
    fileKey: string;
    importedAt: string;
    confidence: "strong" | "partial" | "weak";
  };
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

/**
 * One visit's story, as the dashboard reads it: what the visitor did, in order,
 * and whether any of it turned into an enquiry. Actions carry their own time
 * because "tapped WhatsApp, then filled the form" is a different story from the
 * same two taps the other way round.
 */
export interface AnalyticsVisit {
  id: string;
  first: string;
  last: string;
  path: string;
  actions: { type: string; at: string }[];
  leadId: string;
  converted: boolean;
  lead: { id: string; name: string; phone: string; serviceName: string; status: string } | null;
}

export interface AnalyticsVisitReport {
  hours: number;
  visits: AnalyticsVisit[];
  /** Actions from pages cached before visits had ids — counted, not guessed at. */
  untracked: number;
  converted: number;
  day: string;
}

export interface AnalyticsSummary {
  visits: number; uniqueVisits: number; leads: number;
  ctaCalls: number; ctaWhatsapp: number; ctaEmail: number; formSubmits: number;
  /** Items added to a cart. Present on every payload; 0 for a business with no shop. */
  cartAdds?: number;
  /** Orders placed in the window, cancellations excluded. */
  orders?: number;
  /** Value of orders delivered in the window — earned, not merely placed. */
  orderValue?: number;
  daily: { date: string; visits: number; leads: number }[];
}

export interface HealthCheck { key: string; label: string; pass: boolean; weight: number; }
export interface HealthReport { score: number; checks: HealthCheck[]; recommendations: string[]; }

// Full public payload for rendering a tenant website
export interface OrderRecord {
  id: string;
  number: string;
  customerName: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  ownerNotes: string;
  items: OrderItem[];
  subtotal: number;
  delivery: number;
  total: number;
  fulfilment: "DELIVERY" | "PICKUP";
  payment: "COD" | "UPI" | "ENQUIRY";
  paymentStatus: "PENDING" | "PAID" | "REFUNDED";
  paymentRef: string;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}

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
  /**
   * The shop's rules, when it has a shop. The published site needs them to show
   * the delivery charge before checkout, and to hide the cart entirely on a site
   * that does not sell online.
   */
  commerce?: CommerceSettings;
  /**
   * The name the site's footer credit shows. The platform's by default; an
   * agency's name when the site was built through that agency, so their
   * customer never reads the platform's name on their own website.
   */
  credit?: string;
  subscriptionStatus: string;
  trialMode: boolean;
  published?: boolean;
}

// Auth API
export interface AuthResponse { token: string; user: SessionUser; business: Business | null; }

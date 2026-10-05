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
  status: BusinessStatus;
  createdAt: string;
}

export type SectionType =
  | "hero" | "about" | "stats" | "services" | "products" | "whyUs"
  | "gallery" | "testimonials" | "faq" | "blog" | "cta" | "payment" | "contact" | "hours";

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

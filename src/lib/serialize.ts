// WebSetu — DB row → API type serializers (parse JSON columns, ISO dates)
import { parseJson } from "@/lib/sections";
import type {
  BusinessHours, SocialLinks, SiteSection, SiteTheme,
} from "@/lib/types";

type BizRow = {
  id: string; name: string; slug: string; category: string; tagline: string; description: string;
  ownerName: string; phone: string; whatsapp: string; email: string; address: string; city: string;
  state: string; country: string; pincode: string; establishedYear: string; gstin: string; logoUrl: string;
  coverUrl: string; brandPrimary: string; brandSecondary: string; brandAccent: string; templateId: string;
  gmbUrl: string; mapsUrl: string; placeId: string; upiId: string; paymentQrUrl: string;
  hoursJson: string; socialsJson: string; status: string;
  createdAt: Date;
};

export function serializeBusiness(b: BizRow) {
  return {
    id: b.id, name: b.name, slug: b.slug, category: b.category, tagline: b.tagline,
    description: b.description, ownerName: b.ownerName, phone: b.phone, whatsapp: b.whatsapp,
    email: b.email, address: b.address, city: b.city, state: b.state, country: b.country,
    pincode: b.pincode, establishedYear: b.establishedYear, gstin: b.gstin, logoUrl: b.logoUrl,
    coverUrl: b.coverUrl, brandPrimary: b.brandPrimary, brandSecondary: b.brandSecondary,
    brandAccent: b.brandAccent, templateId: b.templateId, gmbUrl: b.gmbUrl, mapsUrl: b.mapsUrl,
    placeId: b.placeId, upiId: b.upiId, paymentQrUrl: b.paymentQrUrl,
    hours: parseJson<BusinessHours>(b.hoursJson, {}),
    socials: parseJson<SocialLinks>(b.socialsJson, {}),
    status: b.status, createdAt: b.createdAt.toISOString(),
  };
}

export function serializeWebsite(w: {
  seoTitle: string; seoDescription: string; keywords: string; ogImage: string;
  themeJson: string; sectionsJson: string; version: number; publishedAt: Date | null;
}) {
  return {
    seoTitle: w.seoTitle, seoDescription: w.seoDescription, keywords: w.keywords, ogImage: w.ogImage,
    theme: parseJson<SiteTheme>(w.themeJson, {}), sections: parseJson<SiteSection[]>(w.sectionsJson, []),
    version: w.version, publishedAt: w.publishedAt?.toISOString() ?? null,
  };
}

export function serializeSub(s: {
  id: string; planId: string; cycle: string; status: string; amount: number;
  startedAt: Date; renewsAt: Date | null; trialEndsAt: Date | null;
  plan?: { id: string; name: string; slug: string; tagline: string; priceMonthly: number; priceYearly: number; featuresJson: string; maxPages: number; aiCredits: number; popular: boolean; active: boolean; sortOrder: number } | null;
}) {
  return {
    id: s.id, planId: s.planId, cycle: s.cycle as "MONTHLY" | "YEARLY", status: s.status,
    amount: s.amount, startedAt: s.startedAt.toISOString(),
    renewsAt: s.renewsAt?.toISOString() ?? null, trialEndsAt: s.trialEndsAt?.toISOString() ?? null,
    plan: s.plan ? {
      id: s.plan.id, name: s.plan.name, slug: s.plan.slug, tagline: s.plan.tagline,
      priceMonthly: s.plan.priceMonthly, priceYearly: s.plan.priceYearly,
      features: parseJson<string[]>(s.plan.featuresJson, []),
      maxPages: s.plan.maxPages, aiCredits: s.plan.aiCredits, popular: s.plan.popular,
      active: s.plan.active, sortOrder: s.plan.sortOrder,
    } : undefined,
  };
}

export function serializePlan(p: {
  id: string; name: string; slug: string; tagline: string; priceMonthly: number; priceYearly: number;
  featuresJson: string; maxPages: number; aiCredits: number; popular: boolean; active: boolean; sortOrder: number;
}) {
  return {
    id: p.id, name: p.name, slug: p.slug, tagline: p.tagline, priceMonthly: p.priceMonthly,
    priceYearly: p.priceYearly, features: parseJson<string[]>(p.featuresJson, []),
    maxPages: p.maxPages, aiCredits: p.aiCredits, popular: p.popular, active: p.active, sortOrder: p.sortOrder,
  };
}

export function serializeTemplate(t: {
  id: string; name: string; slug: string; category: string; description: string; premium: boolean;
  themeJson: string; gradient: string; coverImage: string; active: boolean; sortOrder: number;
}) {
  return {
    id: t.id, name: t.name, slug: t.slug, category: t.category, description: t.description,
    premium: t.premium, theme: parseJson<Partial<SiteTheme>>(t.themeJson, {}),
    gradient: t.gradient, coverImage: t.coverImage, active: t.active, sortOrder: t.sortOrder,
  };
}

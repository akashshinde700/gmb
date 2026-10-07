// WebSetu — three concepts, before anything is created.
//
// The generator has always built three genomes and kept the most distinct one
// (see lib/uniqueness.ts). That is a good default and a bad shop window: the
// owner never saw a choice, and "every business gets a different website" is
// easier to believe when you have just looked at three of them.
//
// So the same three genomes are offered as three concepts — drawn, named and
// previewable — and the owner picks. The preview is not a screenshot: it is the
// real site renderer, running in preview mode on that genome's own tokens and
// section plan, so what they click is what they get.

import { resolveColors, type SiteBlueprint } from "@/lib/blueprint";
import { checkSite } from "@/lib/site-quality";
import { generateSite, type AiSiteContent } from "@/lib/sections";
import { profileFromSite, similarity, uniquenessPercent, type SiteProfile } from "@/lib/uniqueness";
import type { SitePayload, SiteSection, SiteTheme } from "@/lib/types";

/** The sections worth showing in a preview: identity, offer, and the ask. */
const PREVIEW_TYPES = ["hero", "services", "whyUs", "products", "gallery", "testimonials", "cta", "contact"];
const PREVIEW_LIMIT = 4;
const PREVIEW_TEXT = 400;

export interface ConceptBusiness {
  name: string;
  category: string;
  tagline: string;
  description: string;
  city: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  establishedYear: string;
  coverUrl: string;
  mapsUrl: string;
  state: string;
  pincode: string;
}

export interface ConceptInput {
  candidates: SiteBlueprint[];
  business: ConceptBusiness;
  ai: AiSiteContent | null;
  industry: string;
  aboutImage: string;
  heroImage: string;
  /** The colours the wizard offered, when the owner picked one. */
  submittedColors: { primary?: unknown; secondary?: unknown; accent?: unknown };
  templateLayout?: Record<string, unknown>;
  existingProfiles: SiteProfile[];
  /** Services the wizard collected, so the preview shows the owner's own list. */
  services: { name: string; description: string; icon: string }[];
  /**
   * The starter FAQs and generated gallery a new site is created with. Passing
   * them keeps a concept's score comparable with the finished site's instead of
   * being lower for content the platform is about to add anyway.
   */
  starterFaqCount?: number;
  starterGalleryCount?: number;
}

export interface Concept {
  /** 0, 1, 2 — what the wizard sends back when this one is chosen. */
  key: number;
  /** What to call it: "Warm editorial", "Quiet premium" … */
  styleName: string;
  colors: { primary: string; secondary: string; accent: string };
  design: {
    font: string; radius: string; cardStyle: string; shadow: string; spacing: string;
    button: string; header: string; footer: string; imageTreatment: string;
  };
  motion: { pack: string; level: number };
  /** The arrangements this concept would use, in page order. */
  sections: { type: string; variant: string }[];
  quality: number;
  /** 0–100, against the same-trade sites already live. */
  uniqueness: number;
  /** How this concept differs from the other two being offered. */
  apart: number;
  /** A word for the primary colour — "Indigo", "Plum" — so three concepts that
   *  happen to share a style name are still distinguishable at a glance. */
  colourName: string;
  /** A short line the owner can read: what makes this one different. */
  character: string;
  /** What the wizard renders. Trimmed — a preview is a few sections, not a page. */
  payload: SitePayload;
}

/**
 * A plain word for a hex colour. Names rather than numbers because the owner is
 * choosing, and "Indigo" is a choice where "#4c1d95" is a hex code.
 */
export function colourWord(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!m) return "Custom";
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2;
  const delta = max - min;
  const saturation = delta / (1 - Math.abs(2 * light - 1) || 1);
  // Near-black and near-white are named as neutrals however saturated they are:
  // slate-900 is a very dark blue, but nobody choosing a website calls it "Blue".
  if (delta < 0.06 || (light < 0.2 && saturation < 0.55)) {
    return light > 0.85 ? "Paper" : light < 0.2 ? "Charcoal" : light > 0.5 ? "Stone" : "Slate";
  }
  if (light > 0.92 && saturation < 0.35) return "Paper";
  let hue = 0;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue = (hue * 60 + 360) % 360;
  // Muted colours read as their own family rather than as a bright hue.
  const muted = saturation < 0.35;
  const bands: [number, string, string][] = [
    [15, "Crimson", "Rust"],
    [40, "Amber", "Bronze"],
    [65, "Gold", "Olive"],
    [95, "Lime", "Moss"],
    [150, "Emerald", "Forest"],
    [185, "Teal", "Pine"],
    [215, "Sky", "Steel"],
    [260, "Blue", "Indigo"],
    [290, "Indigo", "Plum"],
    [330, "Violet", "Aubergine"],
    [360, "Rose", "Wine"],
  ];
  const band = bands.find(([limit]) => hue <= limit) ?? bands[bands.length - 1];
  return muted ? band[2] : band[1];
}

/** Trim a section's content to what a preview needs, so the response stays small. */
function trimSection(section: SiteSection): SiteSection {
  const content: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(section.content ?? {})) {
    if (typeof value === "string") content[key] = value.length > PREVIEW_TEXT ? value.slice(0, PREVIEW_TEXT) : value;
    else if (Array.isArray(value)) content[key] = value.slice(0, 3);
    else if (typeof value === "number" || typeof value === "boolean") content[key] = value;
  }
  return { ...section, content };
}

/**
 * Why this look is different, in the owner's language — written from the genome
 * rather than from a model, so it cannot describe something the concept is not.
 */
export function characterOf(dna: SiteBlueprint["dna"]): string {
  const bits: string[] = [];
  const style = dna.design.styleName.toLowerCase();
  if (/premium|luxe|editorial|elegant/.test(style)) bits.push("quieter, more space, fewer things competing for attention");
  else if (/bold|vivid|striking|energetic/.test(style)) bits.push("bigger type and stronger colour, built to be noticed");
  else if (/friendly|warm|playful|gentle/.test(style)) bits.push("rounder shapes and warmer tones, easy to approach");
  else bits.push("clean and straight to the point");

  const radii = dna.design.radius;
  bits.push(radii === "sharp" ? "square corners" : radii === "pill" ? "soft, rounded cards" : "gently rounded corners");
  if (dna.motion.level >= 3) bits.push("more movement as the page scrolls");
  else if (dna.motion.level <= 1) bits.push("almost no movement, fastest to load");
  else bits.push("a little movement on the way in");
  return bits.join(" · ");
}

/**
 * Build the concepts, exactly as the generator would build the site.
 *
 * Deterministic: the same business, asked twice, gets the same three concepts in
 * the same order — which is what makes "you picked concept 2" mean anything by
 * the time the site is created.
 */
export function conceptsFor(input: ConceptInput): Concept[] {
  const { business, candidates, submittedColors, templateLayout, existingProfiles } = input;

  const built = candidates.map((candidate, index) => {
    const colours = resolveColors(submittedColors, candidate);
    const site = generateSite({
      business: {
        ...business,
        brandPrimary: colours.primary,
        brandSecondary: colours.secondary,
        brandAccent: colours.accent,
      },
      ai: input.ai,
      industry: input.industry,
      aboutImage: input.aboutImage,
      heroImage: input.heroImage,
      blueprint: candidate,
      seed: candidate.seed,
    });

    const theme: SiteTheme = {
      ...site.theme,
      font: candidate.look.font,
      radius: candidate.look.radius,
      cardStyle: candidate.look.cardStyle,
      shadow: candidate.dna.design.shadow,
      spacing: candidate.dna.design.spacing,
      button: candidate.dna.design.button,
      header: candidate.dna.design.header,
      footer: candidate.dna.design.footer,
      imageTreatment: candidate.dna.design.imageTreatment,
      motion: candidate.dna.motion,
      ...((templateLayout ?? {}) as object),
    };

    const profile = profileFromSite({
      brandPrimary: colours.primary,
      brandSecondary: colours.secondary,
      brandAccent: colours.accent,
      theme: theme as unknown as Record<string, never>,
      sections: site.sections.map((sec) => ({
        type: sec.type,
        visible: sec.visible,
        content: {
          visible: sec.visible,
          variant: candidate.dna.sectionPlan.find((c) => c.type === sec.type)?.variant ?? sec.content?.variant,
        },
      })),
    });

    // The same eight-dimension score a live site gets, run on what is being
    // offered — a concept that would ship at 62 is worth knowing about before
    // the owner falls in love with it.
    const quality = checkSite({
      sections: site.sections,
      theme,
      colors: colours,
      seoTitle: site.seoTitle,
      seoDescription: site.seoDescription,
      business: {
        phone: business.phone, whatsapp: business.whatsapp, email: business.email,
        city: business.city, description: business.description,
      },
      services: input.services,
      galleryCount: input.starterGalleryCount ?? 1,
      faqCount: input.starterFaqCount ?? 0,
      uniqueness: uniquenessPercent(existingProfiles.length ? closestScore(profile, existingProfiles) : null),
    });

    const ordered = candidate.dna.sectionPlan
      .map((plan) => site.sections.find((sec) => sec.type === plan.type && sec.visible !== false))
      .filter((sec): sec is SiteSection => Boolean(sec));
    const preview = ordered
      .filter((sec) => PREVIEW_TYPES.includes(sec.type))
      .slice(0, PREVIEW_LIMIT)
      .map(trimSection);
    // A page always previews its hero, even if the plan ordered something else
    // first, and never previews an empty card.
    const hero = site.sections.find((sec) => sec.type === "hero" && sec.visible !== false);
    if (hero && !preview.some((sec) => sec.type === "hero")) preview.unshift(trimSection(hero));

    const sections = candidate.dna.sectionPlan.map((plan) => ({ type: plan.type, variant: plan.variant }));

    return {
      key: index,
      styleName: candidate.dna.design.styleName,
      colors: colours,
      design: {
        font: candidate.look.font, radius: candidate.look.radius, cardStyle: candidate.look.cardStyle,
        shadow: candidate.dna.design.shadow, spacing: candidate.dna.design.spacing,
        button: candidate.dna.design.button, header: candidate.dna.design.header,
        footer: candidate.dna.design.footer, imageTreatment: candidate.dna.design.imageTreatment,
      },
      motion: candidate.dna.motion,
      sections,
      quality: quality.score,
      uniqueness: uniquenessPercent(existingProfiles.length ? closestScore(profile, existingProfiles) : null),
      apart: 100,
      colourName: colourWord(colours.primary),
      character: characterOf(candidate.dna),
      profile,
      preview,
      site,
    };
  });

  // How far apart the three are from each other. If two of them are nearly the
  // same, the owner is not being offered a choice and we should say so by
  // showing the number rather than by pretending.
  const withApart = built.map((concept, i) => {
    const others = built.filter((_, j) => j !== i);
    const apart = Math.round(100 - Math.max(...others.map((o) => similarity(concept.profile, o.profile).overall)) * 100);
    return { ...concept, apart: Math.max(0, Math.min(100, apart)) };
  });

  return withApart.map(({ profile: _profile, site: _site, ...concept }, index) => {
    return {
      ...concept,
      payload: {
        business: {
          id: `preview-${index}`,
          name: business.name,
          slug: "preview",
          category: business.category,
          tagline: business.tagline,
          description: business.description,
          ownerName: "",
          phone: business.phone,
          whatsapp: business.whatsapp,
          email: business.email,
          address: business.address,
          city: business.city,
          state: business.state,
          country: "India",
          pincode: business.pincode,
          establishedYear: business.establishedYear,
          gstin: "",
          logoUrl: "",
          coverUrl: business.coverUrl,
          brandPrimary: concept.colors.primary,
          brandSecondary: concept.colors.secondary,
          brandAccent: concept.colors.accent,
          templateId: "",
          gmbUrl: "",
          mapsUrl: business.mapsUrl,
          placeId: "",
          upiId: "",
          paymentQrUrl: "",
          hours: {},
          socials: {},
          status: "DRAFT" as const,
          facts: {},
          createdAt: new Date().toISOString(),
        },
        website: {
          seoTitle: "",
          seoDescription: "",
          keywords: "",
          ogImage: "",
          theme: _site.theme,
          sections: concept.preview,
          version: 0,
          publishedAt: null,
        },
        services: input.services.slice(0, 6).map((s, i) => ({
          id: `s${i}`, businessId: `preview-${index}`, name: s.name,
          description: s.description, icon: s.icon, image: "", price: "",
          featured: i < 3, sortOrder: i + 1,
        })),
        products: [],
        gallery: [],
        testimonials: [],
        faqs: [],
        blogPosts: [],
        primaryDomain: null,
        subscriptionStatus: "TRIAL",
        trialMode: true,
        published: false,
      },
    };
  });
}

function closestScore(profile: SiteProfile, existing: SiteProfile[]) {
  let worst: ReturnType<typeof similarity> | null = null;
  for (const other of existing) {
    const score = similarity(profile, other);
    if (!worst || score.overall > worst.overall) worst = score;
  }
  return worst;
}

import { db } from "@/lib/db";
import { HttpError, ok, readJson, requireBusiness, requireUser, route, str } from "@/lib/api";
import { consumeThemeChange } from "@/lib/appearance";
import { motionLabel, type DesignTokens } from "@/lib/design-dna";
import {
  FigmaError,
  fetchFigmaFile,
  figmaChangeSummary,
  parseFigmaUrl,
  readDesign,
  readFigmaDesign,
  recompose,
  sectionTypeFromName,
  tokensToDesign,
  type FigmaFileJson,
} from "@/lib/figma";
import { parseJson } from "@/lib/sections";
import { serializeWebsite } from "@/lib/serialize";
import { recordVersion } from "@/lib/site-history";
import { checkSite } from "@/lib/site-quality";
import type { SectionType, SiteSection, SiteTheme } from "@/lib/types";

/**
 * POST /api/figma/import — read a design system out of a Figma file.
 *
 * Two doors, one pipeline: a Figma link (with the owner's own token, which
 * lives on the server and is never sent back to the browser) or a design-token
 * JSON export pasted in by hand. Both end up in lib/figma.ts and both produce
 * the same thing: the theme tokens the file justifies, the section order its
 * frames describe, and a list of what would change.
 *
 * Nothing is written unless the caller asks for it (`apply: true`), and even
 * then the owner's content and their chosen colours are untouched — the file's
 * palette is reported and only applied when `applyPalette` is set, which is the
 * same rule a restyle follows.
 */

const TOKEN_PREFIX = "figma:token:";

function tokenKey(userId: string): string {
  return `${TOKEN_PREFIX}${userId}`;
}

/** The owner's stored token, or the operator's, or nothing. */
async function resolveToken(userId: string, provided: string): Promise<{ token: string; source: "account" | "server" | null }> {
  if (provided) return { token: provided, source: "account" };
  try {
    const row = await db.setting.findUnique({ where: { key: tokenKey(userId) } });
    const stored = row?.value ? (JSON.parse(row.value) as { token?: string })?.token ?? "" : "";
    if (stored) return { token: stored, source: "account" };
  } catch {
    /* an unreadable setting is the same as no token */
  }
  const env = (process.env.FIGMA_TOKEN || "").trim();
  if (env) return { token: env, source: "server" };
  return { token: "", source: null };
}

/**
 * Walk the file to one node, so a link with ?node-id= imports that frame only.
 *
 * A deep link can point at a page-like frame (whose children are the sections)
 * or straight at one section. Both work: a frame that names a section is
 * treated as that section, and its children come along in case they are the
 * sections of a page.
 */
function selectNode(file: FigmaFileJson, nodeId: string): FigmaFileJson {
  const stack: { node: NonNullable<FigmaFileJson["document"]> }[] = file.document ? [{ node: file.document }] : [];
  while (stack.length) {
    const { node } = stack.pop()!;
    if (node.id === nodeId || (node.id ?? "").replace(":", "-") === nodeId) {
      if (node.type === "PAGE") return file;
      const children = node.children ?? [];
      const named = sectionTypeFromName(node.name ?? "") !== null;
      const frames = named ? [node, ...children] : children.length ? children : [node];
      return { ...file, document: { type: "PAGE", name: node.name, children: frames } };
    }
    for (const child of node.children ?? []) stack.push({ node: child });
  }
  // A link naming a frame that no longer exists is a normal stale bookmark.
  throw new HttpError("That link points at a frame this file no longer has — open the file again and copy a fresh link", 422);
}

export const GET = route(async (req: Request) => {
  const session = await requireUser(req);
  const { source } = await resolveToken(session.id, "");
  return ok({
    /** Whether an import can run at all, and whose token it would use. */
    connected: Boolean(source),
    source,
  });
});

/**
 * DELETE /api/figma/import — forget the stored token.
 *
 * The owner pasted it here, so they can take it out here. Nothing else about
 * the site changes: a token is a key to Figma, not a property of the website.
 */
export const DELETE = route(async (req: Request) => {
  const session = await requireUser(req);
  await db.setting.deleteMany({ where: { key: tokenKey(session.id) } });
  const { source } = await resolveToken(session.id, "");
  return ok({ connected: Boolean(source), source, tokenRemoved: true });
});

export const POST = route(async (req: Request) => {
  const session = await requireUser(req);
  const business = await requireBusiness(session);
  const website = business.website;
  if (!website) throw new HttpError("Website not found", 404);

  const body = await readJson<{
    url?: unknown;
    tokens?: unknown;
    token?: unknown;
    apply?: unknown;
    applyPalette?: unknown;
  }>(req);

  const rawUrl = str(body.url, 500);
  const rawTokens = body.tokens;
  const providedToken = str(body.token, 200);
  const apply = body.apply === true;
  const applyPalette = body.applyPalette === true && apply;

  // A pasted token is remembered (server-side only) as soon as it is offered,
  // even on a dry run: the owner should paste it once, not once per attempt.
  if (providedToken) {
    if (providedToken.length < 20) throw new HttpError("That does not look like a Figma token", 422);
    await db.setting.upsert({
      where: { key: tokenKey(session.id) },
      create: { key: tokenKey(session.id), value: JSON.stringify({ token: providedToken }) },
      update: { value: JSON.stringify({ token: providedToken }) },
    });
  }

  const hasTokens = rawTokens !== undefined && rawTokens !== null && String(rawTokens).trim() !== "";
  if (!rawUrl && !hasTokens) {
    throw new HttpError("Paste a Figma link, or export your design tokens and paste them here", 422);
  }

  /* ---- read the design (either door) ---- */

  let file: FigmaFileJson | null = null;
  let fileKey = "";
  let wholeFile = true;
  let designSource: "figma" | "tokens" = "tokens";
  let design;

  if (rawUrl) {
    const parsed = parseFigmaUrl(rawUrl);
    if (!parsed) {
      throw new HttpError("That is not a Figma file link — copy it from the file's share button", 422);
    }
    const { token } = await resolveToken(session.id, providedToken);
    if (!token) {
      throw new HttpError(
        "Connect a Figma token first — Figma's API needs one, and it is kept on the server, never in the browser",
        422,
      );
    }
    try {
      const fetched = await fetchFigmaFile(parsed.key, token);
      file = parsed.nodeId ? selectNode(fetched, parsed.nodeId) : fetched;
      wholeFile = !parsed.nodeId;
      fileKey = parsed.key;
      designSource = "figma";
    } catch (e) {
      if (e instanceof FigmaError) throw new HttpError(e.message, e.status);
      throw e;
    }
  }

  if (file) {
    design = readFigmaDesign(file);
  } else {
    let parsedTokens: unknown = rawTokens;
    if (typeof rawTokens === "string") {
      try {
        parsedTokens = JSON.parse(rawTokens);
      } catch {
        throw new HttpError("Those design tokens are not valid JSON", 422);
      }
    }
    design = tokensToDesign(parsedTokens);
    if (!design.colors.length && !design.fonts.length && !design.radii.length) {
      throw new HttpError("No colours, type or corners were found in those tokens", 422);
    }
  }

  /* ---- map it onto this site ---- */

  const theme = parseJson<Partial<SiteTheme>>(website.themeJson, {});
  const sections = parseJson<SiteSection[]>(website.sectionsJson, []);
  const dna = theme.dna;
  const before: Omit<DesignTokens, "styleName"> = {
    font: theme.font ?? "modern",
    radius: theme.radius ?? "rounded",
    cardStyle: theme.cardStyle ?? "shadow",
    shadow: theme.shadow ?? "soft",
    button: theme.button ?? "solid",
    spacing: theme.spacing ?? "normal",
    header: theme.header ?? "sticky",
    footer: theme.footer ?? "columned",
    imageTreatment: theme.imageTreatment ?? "plain",
  };

  const seed = fileKey || dna?.seed || business.slug;
  const read = readDesign(design, before, seed, { fullFile: wholeFile });
  const after: Omit<DesignTokens, "styleName"> = { ...before, ...read.tokens };

  // Which sections this business has real data for. A design can ask for a
  // products section; we only add one when there are products to show.
  const [services, products, gallery, faqs, testimonials, posts] = await Promise.all([
    db.service.count({ where: { businessId: business.id } }),
    db.product.count({ where: { businessId: business.id } }),
    db.galleryItem.count({ where: { businessId: business.id } }),
    db.faq.count({ where: { businessId: business.id } }),
    db.testimonial.count({ where: { businessId: business.id } }),
    db.blogPost.count({ where: { businessId: business.id, published: true } }),
  ]);
  const hours = parseJson<Record<string, unknown>>(business.hoursJson, {});
  const available: Partial<Record<SectionType, boolean>> = {
    hero: true,
    about: Boolean((business.description || "").trim()),
    services: services > 0,
    products: products > 0,
    gallery: gallery > 0,
    testimonials: testimonials > 0,
    faq: faqs > 0,
    blog: posts > 0,
    hours: Object.keys(hours).length > 0,
    payment: Boolean(business.upiId || business.paymentQrUrl),
    contact: Boolean(business.phone || business.email || business.address),
    cta: true,
    stats: services + products + gallery > 2,
    whyUs: Boolean((business.description || "").trim()),
  };

  const composition = recompose(sections, read.sectionPlan, available);
  const paletteApplied = applyPalette && Boolean(read.palette.primary || read.palette.secondary || read.palette.accent);

  const changed = figmaChangeSummary({
    before,
    after,
    palette: read.palette,
    paletteApplied,
    framePlan: read.framePlan,
    added: composition.added,
    skipped: composition.skipped,
    reordered: composition.reordered,
    variants: composition.variants,
  });

  const plan = {
    source: designSource,
    fileName: design.fileName,
    fileKey,
    confidence: read.confidence,
    styleName: read.styleName,
    tokens: read.tokens,
    notes: read.notes,
    palette: read.palette,
    frames: read.framePlan,
    sections: read.sectionPlan.map((c) => c.type),
    quality: null as unknown,
  };

  if (!apply) {
    return ok({
      applied: false,
      plan,
      changed,
      preview: {
        font: after.font,
        radius: after.radius,
        shadow: after.shadow,
        button: after.button,
        spacing: after.spacing,
        header: after.header,
        footer: after.footer,
        imageTreatment: after.imageTreatment,
      },
      tokenSaved: Boolean(providedToken),
    });
  }

  if (read.confidence === "weak") {
    throw new HttpError(
      "Almost nothing in that file was readable as a design system — nothing was changed. Try the whole file rather than a single frame, or export your tokens.",
      422,
    );
  }

  // One design change, one allowance — same meter as the Theme panel and the
  // restyle box, because the customer is paying for the design decisions.
  await consumeThemeChange(business.id);

  const nextSections = composition.sections;
  const nextTheme: Partial<SiteTheme> = {
    ...theme,
    font: after.font,
    radius: after.radius,
    cardStyle: after.cardStyle,
    shadow: after.shadow,
    button: after.button,
    spacing: after.spacing,
    header: after.header,
    footer: after.footer,
    imageTreatment: after.imageTreatment,
    ...(theme.motion ? {} : { motion: { pack: "modern" as const, level: 2 } }),
    dna: dna
      ? { ...dna, styleName: read.styleName, sectionPlan: read.sectionPlan.length ? read.sectionPlan : dna.sectionPlan }
      : dna,
    // Where the design came from, so the panel can say it and a later import
    // can be compared against it rather than against a mystery.
    figma: {
      source: designSource,
      fileName: design.fileName.slice(0, 120),
      fileKey,
      importedAt: new Date().toISOString(),
      confidence: read.confidence,
    },
  };

  const quality = checkSite({
    sections: nextSections,
    theme: nextTheme,
    colors: paletteApplied
      ? {
          primary: read.palette.primary ?? business.brandPrimary,
          secondary: read.palette.secondary ?? business.brandSecondary,
          accent: read.palette.accent ?? business.brandAccent,
        }
      : { primary: business.brandPrimary, secondary: business.brandSecondary, accent: business.brandAccent },
    seoTitle: website.seoTitle,
    seoDescription: website.seoDescription,
    business: {
      name: business.name, phone: business.phone, whatsapp: business.whatsapp, email: business.email,
      city: business.city, address: business.address, description: business.description, hours: business.hoursJson,
    },
    services: await db.service.findMany({ where: { businessId: business.id }, select: { name: true, description: true } }),
    galleryCount: gallery,
    faqCount: faqs,
    testimonialCount: testimonials,
    uniqueness: theme.uniqueness,
  });

  const updated = await db.website.update({
    where: { id: website.id },
    data: {
      themeJson: JSON.stringify({ ...nextTheme, quality }),
      sectionsJson: JSON.stringify(nextSections),
      version: { increment: 1 },
    },
  });

  if (paletteApplied) {
    await db.business.update({
      where: { id: business.id },
      data: {
        brandPrimary: read.palette.primary ?? business.brandPrimary,
        brandSecondary: read.palette.secondary ?? business.brandSecondary,
        brandAccent: read.palette.accent ?? business.brandAccent,
      },
    });
  }

  await recordVersion({
    website: updated,
    label: `Imported a design from ${design.fileName}`.slice(0, 120),
    actor: business.ownerName || "Owner",
    // The colours go into the version too, so a restore after an import puts
    // the owner's own palette back rather than half the design.
    brand: {
      primary: paletteApplied ? read.palette.primary ?? business.brandPrimary : business.brandPrimary,
      secondary: paletteApplied ? read.palette.secondary ?? business.brandSecondary : business.brandSecondary,
      accent: paletteApplied ? read.palette.accent ?? business.brandAccent : business.brandAccent,
    },
  });

  return ok({
    applied: true,
    plan: { ...plan, quality },
    changed,
    paletteApplied,
    added: composition.added,
    skipped: composition.skipped,
    quality,
    website: serializeWebsite(updated),
    motionLabel: theme.motion ? motionLabel(theme.motion.pack) : null,
    tokenSaved: Boolean(providedToken),
  });
});

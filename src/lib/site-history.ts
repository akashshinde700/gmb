// WebSetu — site versions.
//
// A generator that changes a customer's live website must be able to put it
// back. Every change a site goes through — the first generation, an edit in the
// builder, a publish, a restyle, an automatic fix, a regenerated section, an
// autopilot run — records a version first, and any version can be restored.
//
// Versions live in the existing audit log rather than a table of their own: an
// audit row is already "who changed what, and when", and attaching the state it
// produced is what turns a log into an undo stack. That also means no migration
// for a feature the product needed yesterday.

import { db } from "@/lib/db";
import { parseJson } from "@/lib/sections";

/** How many versions are kept per site. Older ones are pruned. */
const KEEP = 8;

export interface SiteVersion {
  /** Audit row id — the handle used to restore. */
  id: string;
  /** What happened, in the owner's language ("Made it more premium"). */
  label: string;
  /** Who did it: the owner's name, "Autopilot", or "WebSetu". */
  actor: string;
  /** The quality score at the time, when one was recorded. */
  score?: number;
  createdAt: string;
}

interface SnapshotPayload {
  themeJson: string;
  sectionsJson: string;
  seoTitle: string;
  seoDescription: string;
  keywords: string;
  /**
   * The brand colours, when the change that produced this version could move
   * them (a design imported from Figma brings its own palette). Optional on
   * purpose: every version written before this existed has no brand block, and
   * restoring one must leave the colours alone rather than blank them.
   */
  brand?: { primary: string; secondary: string; accent: string };
}

export interface RecordVersionInput {
  website: {
    id: string;
    themeJson: string;
    sectionsJson: string;
    seoTitle: string;
    seoDescription: string;
    keywords: string;
  };
  /** Shown in the history list. Keep it human: "Regenerated the hero". */
  label: string;
  actor?: string;
  /** Pass the business's colours when this change is allowed to have moved them. */
  brand?: { primary: string; secondary: string; accent: string };
}

/**
 * Record the state a website is in now.
 *
 * Called *after* a change, so the newest version is the live site and each older
 * one is the previous state — which is what makes "go back to this" obvious.
 */
export async function recordVersion({ website, label, actor = "WebSetu", brand }: RecordVersionInput): Promise<void> {
  const payload: SnapshotPayload = {
    themeJson: website.themeJson,
    sectionsJson: website.sectionsJson,
    seoTitle: website.seoTitle,
    seoDescription: website.seoDescription,
    keywords: website.keywords,
    ...(brand ? { brand } : {}),
  };
  // The score travels with the version, so history can say "82 → 91".
  const score = parseJson<{ quality?: { score?: number } }>(website.themeJson, {}).quality?.score;

  await db.auditLog.create({
    data: {
      actor,
      action: "SITE_VERSION",
      entity: "Website",
      entityId: website.id,
      meta: JSON.stringify({ label, score, state: payload }),
    },
  });

  // Prune. A long history is nice; a database that grows without limit is not.
  const older = await db.auditLog.findMany({
    where: { entity: "Website", entityId: website.id, action: "SITE_VERSION" },
    orderBy: { createdAt: "desc" },
    skip: KEEP,
    select: { id: true },
  });
  if (older.length) {
    await db.auditLog.deleteMany({ where: { id: { in: older.map((v) => v.id) } } });
  }
}

/** The site's history, newest first, without the (large) stored states. */
export async function listVersions(websiteId: string): Promise<SiteVersion[]> {
  const rows = await db.auditLog.findMany({
    where: { entity: "Website", entityId: websiteId, action: "SITE_VERSION" },
    orderBy: { createdAt: "desc" },
    take: KEEP,
    select: { id: true, actor: true, meta: true, createdAt: true },
  });
  return rows.map((row) => {
    const meta = parseJson<{ label?: string; score?: number }>(row.meta, {});
    return {
      id: row.id,
      label: meta.label || "Saved",
      actor: row.actor || "WebSetu",
      ...(typeof meta.score === "number" ? { score: meta.score } : {}),
      createdAt: row.createdAt.toISOString(),
    };
  });
}

export interface RestoreResult {
  themeJson: string;
  sectionsJson: string;
  seoTitle: string;
  seoDescription: string;
  keywords: string;
  /** The colours as they were, when the version recorded them. */
  brand?: { primary: string; secondary: string; accent: string };
  /** The version that was restored, for the confirmation line. */
  label: string;
}

/**
 * The stored state behind one version, ready to write back.
 *
 * Returns null when the version does not exist or was written for another site —
 * a restore must never be able to touch a website the caller does not own.
 */
export async function versionState(websiteId: string, versionId: string): Promise<RestoreResult | null> {
  const row = await db.auditLog.findFirst({
    where: { id: versionId, entity: "Website", entityId: websiteId, action: "SITE_VERSION" },
    select: { meta: true },
  });
  if (!row) return null;
  const meta = parseJson<{ label?: string; state?: Partial<SnapshotPayload> }>(row.meta, {});
  const state = meta.state;
  if (!state || typeof state.themeJson !== "string" || typeof state.sectionsJson !== "string") return null;
  const brand = state.brand;
  const hex = /^#[0-9a-f]{6}$/i;
  const usableBrand =
    brand && hex.test(brand.primary ?? "") && hex.test(brand.secondary ?? "") && hex.test(brand.accent ?? "")
      ? { primary: brand.primary, secondary: brand.secondary, accent: brand.accent }
      : undefined;
  return {
    themeJson: state.themeJson,
    sectionsJson: state.sectionsJson,
    seoTitle: state.seoTitle ?? "",
    seoDescription: state.seoDescription ?? "",
    keywords: state.keywords ?? "",
    ...(usableBrand ? { brand: usableBrand } : {}),
    label: meta.label || "Saved",
  };
}

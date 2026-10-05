// WebSetu — server-side palette access.

import { db } from "@/lib/db";
import { HttpError } from "@/lib/api";
import { builtInPaletteRows, type BrandPalette, type PaletteScope } from "@/lib/palettes";

export const PALETTE_SCOPES: PaletteScope[] = ["BUSINESS", "PLATFORM", "BOTH"];
export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export interface PaletteRow {
  id: string;
  name: string;
  mood: string;
  primary: string;
  secondary: string;
  accent: string;
  scope: string;
  active: boolean;
  builtIn: boolean;
  sortOrder: number;
}

/**
 * Seed the built-in palettes the first time the table is read. Doing it here
 * rather than in prisma/seed.ts means an already-deployed database picks the
 * palettes up on its next request, with no seed run.
 */
export async function ensurePalettes(): Promise<void> {
  const count = await db.palette.count();
  if (count > 0) return;
  await db.palette.createMany({ data: builtInPaletteRows() });
}

export function toBrandPalette(row: PaletteRow): BrandPalette {
  return {
    id: row.id,
    name: row.name,
    mood: row.mood,
    colors: [row.primary, row.secondary, row.accent],
    scope: row.scope as PaletteScope,
    active: row.active,
    builtIn: row.builtIn,
    sortOrder: row.sortOrder,
  };
}

/** Palettes offered in a picker. `includeInactive` is for the admin library. */
export async function listPalettes(opts: {
  scope?: "BUSINESS" | "PLATFORM";
  includeInactive?: boolean;
} = {}): Promise<BrandPalette[]> {
  await ensurePalettes();
  const rows = await db.palette.findMany({
    where: {
      ...(opts.includeInactive ? {} : { active: true }),
      ...(opts.scope ? { OR: [{ scope: opts.scope }, { scope: "BOTH" }] } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(toBrandPalette);
}

/** Validate an admin-supplied palette body. Throws HttpError on bad input. */
export function readPaletteInput(body: Record<string, unknown>, partial = false) {
  const out: {
    name?: string; mood?: string; primary?: string; secondary?: string; accent?: string;
    scope?: string; active?: boolean; sortOrder?: number;
  } = {};

  if (body.name !== undefined || !partial) {
    const name = String(body.name ?? "").trim().slice(0, 60);
    if (name.length < 2) throw new HttpError("Palette name must be at least 2 characters");
    out.name = name;
  }
  if (body.mood !== undefined) out.mood = String(body.mood ?? "").trim().slice(0, 60);

  for (const key of ["primary", "secondary", "accent"] as const) {
    if (body[key] === undefined && partial) continue;
    const value = String(body[key] ?? "").trim().toLowerCase();
    if (!HEX_COLOR.test(value)) {
      throw new HttpError(`${key} must be a 6-digit hex colour like #059669`);
    }
    out[key] = value;
  }

  if (body.scope !== undefined) {
    const scope = String(body.scope);
    if (!PALETTE_SCOPES.includes(scope as PaletteScope)) throw new HttpError("Invalid palette scope");
    out.scope = scope;
  }
  if (body.active !== undefined) out.active = Boolean(body.active);
  if (body.sortOrder !== undefined) {
    const value = Number(body.sortOrder);
    if (!Number.isFinite(value)) throw new HttpError("sortOrder must be a number");
    out.sortOrder = Math.max(0, Math.min(9999, Math.trunc(value)));
  }
  return out;
}


/**
 * The palettes one customer may pick from.
 *
 * Precedence:
 *   1. an admin's per-customer override (explicit palette ids on the business)
 *   2. the subscription plan's `maxPalettes` allowance (-1 = all)
 *   3. during onboarding, when there is no business or plan yet, the entry
 *      plan's allowance so the wizard shows what a new signup actually gets
 *
 * The list is always cut from the front of the ordered library, so every plan
 * sees the same first N palettes and paying more only ever adds choices.
 */
export async function palettesForBusiness(businessId?: string | null): Promise<{
  palettes: BrandPalette[];
  total: number;
  limit: number;
  source: "override" | "plan" | "default";
}> {
  const all = await listPalettes({ scope: "BUSINESS" });

  if (businessId) {
    const business = await db.business.findUnique({
      where: { id: businessId },
      select: {
        allowedPalettesJson: true,
        subscription: { select: { plan: { select: { maxPalettes: true } } } },
      },
    });

    if (business) {
      const override = parseIds(business.allowedPalettesJson);
      if (override.length) {
        const allowed = new Set(override);
        // Order follows the library, not the order the ids were saved in.
        return { palettes: all.filter((p) => p.id && allowed.has(p.id)), total: all.length, limit: override.length, source: "override" };
      }
      const limit = business.subscription?.plan?.maxPalettes ?? -1;
      return { palettes: applyLimit(all, limit), total: all.length, limit, source: "plan" };
    }
  }

  // No business yet (onboarding): show what the cheapest active plan allows.
  const entryPlan = await db.plan.findFirst({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }],
    select: { maxPalettes: true },
  });
  const limit = entryPlan?.maxPalettes ?? -1;
  return { palettes: applyLimit(all, limit), total: all.length, limit, source: "default" };
}

function applyLimit(palettes: BrandPalette[], limit: number): BrandPalette[] {
  if (!Number.isFinite(limit) || limit < 0) return palettes;
  return palettes.slice(0, limit);
}

/** Parse the stored override, tolerating an empty or corrupt value. */
export function parseIds(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

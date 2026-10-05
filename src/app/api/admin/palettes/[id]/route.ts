import { db } from "@/lib/db";
import { audit, HttpError, ok, readJson, requireAdmin, route } from "@/lib/api";
import { readPaletteInput, toBrandPalette } from "@/lib/palette-store";
import { parseJson } from "@/lib/sections";
import { normalizeTheme, PLATFORM_THEME_KEY, type PlatformTheme } from "@/lib/platform-theme";

type Params = { params: Promise<{ id: string }> };

/** PUT /api/admin/palettes/[id] — edit a palette (built-ins included). */
export const PUT = route(async (req: Request, { params }: Params) => {
  const admin = await requireAdmin(req);
  const { id } = await params;

  const existing = await db.palette.findUnique({ where: { id } });
  if (!existing) throw new HttpError("Palette not found", 404);

  const body = await readJson<Record<string, unknown>>(req);
  const input = readPaletteInput(body, true);
  if (!Object.keys(input).length) throw new HttpError("Nothing to update");

  if (input.name && input.name !== existing.name) {
    const clash = await db.palette.findUnique({ where: { name: input.name } });
    if (clash) throw new HttpError("A palette with this name already exists", 409);
  }

  const palette = await db.palette.update({ where: { id }, data: input });

  // The live platform theme stores its colours by value, so an edit to the
  // palette it was set from has to be pushed through or the site keeps the old
  // colours until someone re-picks it.
  const setting = await db.setting.findUnique({ where: { key: PLATFORM_THEME_KEY } });
  if (setting) {
    const current = normalizeTheme(parseJson<Partial<PlatformTheme>>(setting.value, {}));
    if (current.palette === existing.name) {
      const updated: PlatformTheme = {
        palette: palette.name,
        primary: palette.primary,
        secondary: palette.secondary,
        accent: palette.accent,
      };
      await db.setting.update({ where: { key: PLATFORM_THEME_KEY }, data: { value: JSON.stringify(updated) } });
    }
  }

  await audit({
    actor: admin.id, action: "PALETTE_UPDATE", entity: "palette", entityId: id,
    meta: { name: palette.name, fields: Object.keys(input) },
  });
  return ok({ palette: toBrandPalette(palette) });
});

/**
 * DELETE /api/admin/palettes/[id] — remove a custom palette. Built-ins are
 * deactivated instead, so the list can always be restored.
 */
export const DELETE = route(async (req: Request, { params }: Params) => {
  const admin = await requireAdmin(req);
  const { id } = await params;

  const existing = await db.palette.findUnique({ where: { id } });
  if (!existing) throw new HttpError("Palette not found", 404);

  if (existing.builtIn) {
    const palette = await db.palette.update({ where: { id }, data: { active: false } });
    await audit({ actor: admin.id, action: "PALETTE_DISABLE", entity: "palette", entityId: id, meta: { name: existing.name } });
    return ok({ disabled: true, palette: toBrandPalette(palette), message: "Built-in palettes are retired rather than deleted." });
  }

  // A business stores its colours on its own row, so deleting the palette only
  // removes it from the picker — no tenant site changes colour.
  await db.palette.delete({ where: { id } });
  await audit({ actor: admin.id, action: "PALETTE_DELETE", entity: "palette", entityId: id, meta: { name: existing.name } });
  return ok({ deleted: true });
});

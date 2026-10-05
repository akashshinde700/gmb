import { db } from "@/lib/db";
import { audit, HttpError, ok, readJson, requireAdmin, route } from "@/lib/api";
import { ensurePalettes, listPalettes, readPaletteInput, toBrandPalette } from "@/lib/palette-store";

/** GET /api/admin/palettes — the full library, including retired palettes. */
export const GET = route(async (req: Request) => {
  await requireAdmin(req);
  return ok({ palettes: await listPalettes({ includeInactive: true }) });
});

/** POST /api/admin/palettes — add a palette. */
export const POST = route(async (req: Request) => {
  const admin = await requireAdmin(req);
  await ensurePalettes();

  const body = await readJson<Record<string, unknown>>(req);
  const input = readPaletteInput(body);

  const clash = await db.palette.findUnique({ where: { name: input.name! } });
  if (clash) throw new HttpError("A palette with this name already exists", 409);

  const last = await db.palette.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });

  const palette = await db.palette.create({
    data: {
      name: input.name!,
      mood: input.mood ?? "",
      primary: input.primary!,
      secondary: input.secondary!,
      accent: input.accent!,
      scope: input.scope ?? "BOTH",
      active: input.active ?? true,
      sortOrder: input.sortOrder ?? (last?.sortOrder ?? 0) + 1,
      builtIn: false,
    },
  });

  await audit({
    actor: admin.id, action: "PALETTE_CREATE", entity: "palette", entityId: palette.id,
    meta: { name: palette.name, scope: palette.scope },
  });
  return ok({ palette: toBrandPalette(palette) }, 201);
});

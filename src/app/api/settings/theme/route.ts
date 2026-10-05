import { db } from "@/lib/db";
import { audit, HttpError, ok, readJson, requireAdmin, route } from "@/lib/api";
import { listPalettes } from "@/lib/palette-store";
import { HEX_COLOR, PLATFORM_THEME_KEY, type PlatformTheme } from "@/lib/platform-theme";
// One reader, shared with the server components that render the public pages —
// two copies of this logic would be two places for the fallback to drift.
import { readPlatformTheme } from "@/lib/platform-theme-server";

/**
 * GET /api/settings/theme — public: the landing page and login screen are shown
 * to signed-out visitors and need the palette before any session exists.
 */
export const GET = route(async () => {
  return ok({
    theme: await readPlatformTheme(),
    palettes: await listPalettes({ scope: "PLATFORM" }),
  });
});

/** PUT /api/settings/theme — admin only: change the platform palette. */
export const PUT = route(async (req: Request) => {
  const admin = await requireAdmin(req);
  const body = await readJson<Partial<PlatformTheme>>(req);

  const requested = typeof body.palette === "string" ? body.palette.trim() : "";
  let theme: PlatformTheme;

  if (requested && requested !== "custom") {
    // Colours come from the stored palette, not from the request body, so a
    // caller cannot pass a palette name with unrelated colours.
    const palettes = await listPalettes({ scope: "PLATFORM" });
    const preset = palettes.find((p) => p.name === requested);
    if (!preset) throw new HttpError("Unknown palette — pick one from the palette library", 400);
    theme = {
      palette: preset.name,
      primary: preset.colors[0],
      secondary: preset.colors[1],
      accent: preset.colors[2],
    };
  } else {
    for (const key of ["primary", "secondary", "accent"] as const) {
      const value = body[key];
      if (typeof value !== "string" || !HEX_COLOR.test(value)) {
        throw new HttpError(`${key} must be a 6-digit hex colour like #059669`);
      }
    }
    theme = {
      palette: "custom",
      primary: body.primary!.toLowerCase(),
      secondary: body.secondary!.toLowerCase(),
      accent: body.accent!.toLowerCase(),
    };
  }

  await db.setting.upsert({
    where: { key: PLATFORM_THEME_KEY },
    update: { value: JSON.stringify(theme) },
    create: { key: PLATFORM_THEME_KEY, value: JSON.stringify(theme) },
  });
  await audit({
    actor: admin.id, action: "PLATFORM_THEME_UPDATE", entity: "setting", entityId: PLATFORM_THEME_KEY,
    meta: { palette: theme.palette, primary: theme.primary },
  });

  return ok({ theme });
});

// WebSetu — reading the platform palette on the server.
//
// The palette a platform admin picks in Admin -> Appearance has to reach the
// two pages that show it to signed-out visitors: the marketing page and the
// login screen. Both are server components, so they read it here rather than
// asking /api/settings/theme from the browser.
//
// It used to arrive only through the store's `hydrate()`, which the console
// calls. When "/" became a server component — so that an anonymous visitor
// stopped triggering a 401 on /api/auth/me — nothing on the public pages called
// hydrate() any more, and the palette silently stopped being fetched. Choosing
// a palette in the admin appeared to do nothing: the value was saved, the admin
// preview updated, and the pages it was meant to restyle kept the emerald
// fallback baked into globals.css.
//
// Reading it on the server also removes the flash: the correct colours are in
// the first painted frame instead of replacing the default ones a moment later.

import { db } from "@/lib/db";
import { parseJson } from "@/lib/sections";
import {
  DEFAULT_PLATFORM_THEME, HEX_COLOR, PLATFORM_THEME_KEY, type PlatformTheme,
} from "@/lib/platform-theme";

/** The stored platform palette, falling back to the built-in one. */
export async function readPlatformTheme(): Promise<PlatformTheme> {
  try {
    const row = await db.setting.findUnique({ where: { key: PLATFORM_THEME_KEY } });
    if (!row) return DEFAULT_PLATFORM_THEME;
    const stored = parseJson<Partial<PlatformTheme>>(row.value, {});
    const pick = (v: unknown, fallback: string) =>
      typeof v === "string" && HEX_COLOR.test(v) ? v.toLowerCase() : fallback;
    return {
      palette: typeof stored.palette === "string" && stored.palette
        ? stored.palette
        : DEFAULT_PLATFORM_THEME.palette,
      primary: pick(stored.primary, DEFAULT_PLATFORM_THEME.primary),
      secondary: pick(stored.secondary, DEFAULT_PLATFORM_THEME.secondary),
      accent: pick(stored.accent, DEFAULT_PLATFORM_THEME.accent),
    };
  } catch {
    // A database blip must not take the landing page down over its colours.
    return DEFAULT_PLATFORM_THEME;
  }
}

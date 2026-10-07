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
import { brandForHost } from "@/lib/reseller";
import {
  DEFAULT_PLATFORM_THEME, HEX_COLOR, PLATFORM_THEME_KEY, type PlatformTheme,
} from "@/lib/platform-theme";

/**
 * A darker version of a brand colour, for the secondary slot.
 *
 * White-label pages need a pair of colours, but a reseller only sets one — and
 * running their colour next to the platform's own dark green looked like an
 * accident. Scaling each channel is the cheapest honest answer; it is not a
 * design system, it just stops the two colours fighting.
 */
function darken(hex: string, amount = 0.45): string {
  const parts = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `#${parts.map((v) => Math.max(0, Math.round(v * (1 - amount))).toString(16).padStart(2, "0")).join("")}`;
}

/** The stored platform palette, falling back to the built-in one. */
export async function readPlatformTheme(host?: string | null): Promise<PlatformTheme> {
  try {
    const row = await db.setting.findUnique({ where: { key: PLATFORM_THEME_KEY } });
    if (!row) return DEFAULT_PLATFORM_THEME;
    const stored = parseJson<Partial<PlatformTheme>>(row.value, {});
    const pick = (v: unknown, fallback: string) =>
      typeof v === "string" && HEX_COLOR.test(v) ? v.toLowerCase() : fallback;
    const theme: PlatformTheme = {
      palette: typeof stored.palette === "string" && stored.palette
        ? stored.palette
        : DEFAULT_PLATFORM_THEME.palette,
      primary: pick(stored.primary, DEFAULT_PLATFORM_THEME.primary),
      secondary: pick(stored.secondary, DEFAULT_PLATFORM_THEME.secondary),
      accent: pick(stored.accent, DEFAULT_PLATFORM_THEME.accent),
    };
    // A reseller's own domain shows their colours, not the platform's. Nothing
    // else about the page changes — the same landing page, wearing the
    // agency's brand.
    if (host) {
      const brand = await brandForHost(host);
      if (brand.whiteLabel && brand.primaryColor) {
        return {
          palette: "custom",
          primary: brand.primaryColor,
          secondary: darken(brand.primaryColor),
          accent: theme.accent,
        };
      }
    }
    return theme;
  } catch {
    // A database blip must not take the landing page down over its colours.
    return DEFAULT_PLATFORM_THEME;
  }
}

// WebSetu — the platform's own colour palette (marketing site + login screen).
//
// Tenant websites have always had per-business palettes; this is the separate,
// single palette for WebSetu's own pages, editable by a platform admin.


export interface PlatformTheme {
  /** Name of a preset from BRAND_PALETTES, or "custom". */
  palette: string;
  primary: string;
  secondary: string;
  accent: string;
}

export const PLATFORM_THEME_KEY = "platform.theme";

export const DEFAULT_PLATFORM_THEME: PlatformTheme = {
  palette: "Emerald Fresh",
  primary: "#059669",
  secondary: "#064e3b",
  accent: "#f59e0b",
};

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** Coerce a stored value into a complete, valid theme (used where a DB lookup
 *  is not available, e.g. reading an existing Setting row). */
export function normalizeTheme(input: unknown): PlatformTheme {
  const raw = (input ?? {}) as Partial<PlatformTheme>;
  const pick = (value: unknown, fallback: string) =>
    typeof value === "string" && HEX_COLOR.test(value) ? value.toLowerCase() : fallback;
  return {
    palette: typeof raw.palette === "string" && raw.palette ? raw.palette : DEFAULT_PLATFORM_THEME.palette,
    primary: pick(raw.primary, DEFAULT_PLATFORM_THEME.primary),
    secondary: pick(raw.secondary, DEFAULT_PLATFORM_THEME.secondary),
    accent: pick(raw.accent, DEFAULT_PLATFORM_THEME.accent),
  };
}

/** CSS custom properties consumed by the `.ws-theme` layer in globals.css. */
export function themeVars(theme: PlatformTheme): Record<string, string> {
  return {
    "--ws-primary": theme.primary,
    "--ws-secondary": theme.secondary,
    "--ws-accent": theme.accent,
  };
}

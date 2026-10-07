// WebSetu — the per-section style a freeform edit can set.
//
// The generated site already has one look per business; this is what the owner
// changes afterwards, by hand, without regenerating anything. It is deliberately
// a small, named vocabulary rather than free CSS: named choices survive a
// redesign, render identically on every section type, and cannot produce a page
// that a non-designer would be embarrassed by at 3am.
//
// Storage: `section.content.__style`, a namespaced key inside content that the
// save endpoint already round-trips untouched. Nothing in the renderer's own
// content contract uses a `__` prefix, so an older section cannot collide with
// it, and an unreadable value is dropped rather than rendered.

import type { SiteSection } from "@/lib/types";

export const SECTION_BGS = ["inherit", "surface", "dark", "accent", "gradient"] as const;
export const SECTION_PADS = ["none", "compact", "normal", "airy"] as const;
export const SECTION_ALIGNS = ["left", "center"] as const;
export const SECTION_HEADS = ["s", "m", "l", "xl"] as const;
export const SECTION_COLS = [1, 2, 3, 4] as const;

export type SectionBg = (typeof SECTION_BGS)[number];
export type SectionPad = (typeof SECTION_PADS)[number];
export type SectionAlign = (typeof SECTION_ALIGNS)[number];
export type SectionHead = (typeof SECTION_HEADS)[number];
export type SectionCols = (typeof SECTION_COLS)[number];

export interface SectionStyle {
  bg?: SectionBg;
  pad?: SectionPad;
  align?: SectionAlign;
  head?: SectionHead;
  cols?: SectionCols;
  /** Hidden on phones, kept on desktop (a dense gallery, a long table). */
  hideMobile?: boolean;
}

/** Human labels, in the order the inspector shows them. */
export const BG_CHOICES: { value: SectionBg; label: string }[] = [
  { value: "inherit", label: "Default" },
  { value: "surface", label: "Tinted" },
  { value: "dark", label: "Dark" },
  { value: "accent", label: "Accent" },
  { value: "gradient", label: "Gradient" },
];

export const PAD_CHOICES: { value: SectionPad; label: string }[] = [
  { value: "none", label: "None" },
  { value: "compact", label: "Compact" },
  { value: "normal", label: "Normal" },
  { value: "airy", label: "Airy" },
];

export const ALIGN_CHOICES: { value: SectionAlign; label: string }[] = [
  { value: "left", label: "Left" },
  { value: "center", label: "Centre" },
];

export const HEAD_CHOICES: { value: SectionHead; label: string }[] = [
  { value: "s", label: "Small" },
  { value: "m", label: "Medium" },
  { value: "l", label: "Large" },
  { value: "xl", label: "Extra large" },
];

export const COL_CHOICES: { value: SectionCols; label: string }[] = [
  { value: 1, label: "1 column" },
  { value: 2, label: "2 columns" },
  { value: 3, label: "3 columns" },
  { value: 4, label: "4 columns" },
];

const inList = <T extends string | number>(list: readonly T[], value: unknown): value is T =>
  (list as readonly (string | number)[]).includes(value as string | number);

/** The style on a section, with anything unreadable dropped. Never throws. */
export function readSectionStyle(section: Pick<SiteSection, "content"> | null | undefined): SectionStyle {
  const raw = (section?.content as Record<string, unknown> | undefined)?.__style;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const source = raw as Record<string, unknown>;
  const style: SectionStyle = {};
  if (inList(SECTION_BGS, source.bg)) style.bg = source.bg;
  if (inList(SECTION_PADS, source.pad)) style.pad = source.pad;
  if (inList(SECTION_ALIGNS, source.align)) style.align = source.align;
  if (inList(SECTION_HEADS, source.head)) style.head = source.head;
  if (inList(SECTION_COLS, source.cols)) style.cols = source.cols;
  if (source.hideMobile === true) style.hideMobile = true;
  return style;
}

/** Drop empty values, so clearing a control really clears it out of the JSON. */
function compact(style: SectionStyle): SectionStyle {
  const out: SectionStyle = {};
  if (style.bg && style.bg !== "inherit") out.bg = style.bg;
  if (style.pad && style.pad !== "normal") out.pad = style.pad;
  if (style.align && style.align !== "left") out.align = style.align;
  if (style.head) out.head = style.head;
  if (style.cols) out.cols = style.cols;
  if (style.hideMobile) out.hideMobile = true;
  return out;
}

/**
 * A copy of the section with one style key changed.
 *
 * `value === undefined` clears the key. Returns a new section — the editor keeps
 * an undo stack, and mutating the section it was given would make every entry in
 * that stack point at the same object.
 */
export function withSectionStyle(section: SiteSection, key: keyof SectionStyle, value: unknown): SiteSection {
  const next = compact({ ...readSectionStyle(section), [key]: value });
  const content = { ...(section.content ?? {}) };
  if (Object.keys(next).length) content.__style = next;
  else delete content.__style;
  return { ...section, content };
}

/** `data-ws-*` attributes the stylesheet hangs off. Empty style → no attributes. */
export function styleAttributes(style: SectionStyle): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (style.bg && style.bg !== "inherit") attrs["data-ws-bg"] = style.bg;
  if (style.pad && style.pad !== "normal") attrs["data-ws-pad"] = style.pad;
  if (style.align && style.align !== "left") attrs["data-ws-align"] = style.align;
  if (style.head) attrs["data-ws-head"] = style.head;
  if (style.cols) attrs["data-ws-cols"] = String(style.cols);
  if (style.hideMobile) attrs["data-ws-hide-mobile"] = "1";
  return attrs;
}

/** True when the style would change nothing — used to skip a needless wrapper. */
export function isPlainStyle(style: SectionStyle): boolean {
  return Object.keys(styleAttributes(style)).length === 0;
}

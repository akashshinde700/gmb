// WebSetu — the freeform editor's document model.
//
// Everything the visual editor does to a site is a pure function over a list of
// sections: no React, no fetch, no DOM. That is what makes the interesting parts
// testable — that undo really restores the previous document, that moving a
// section to index 0 does not duplicate it, that clearing a field removes the
// key instead of storing an empty string — and it is what lets the editor keep
// an undo stack without the sections in it sharing objects.
//
// The document is exactly the shape the save endpoint already accepts
// (`PUT /api/website` takes `sections: SiteSection[]`), so nothing new is
// persisted and an old site opens in the editor unchanged.

import type { SiteSection, SectionType } from "@/lib/types";
import { SECTION_LIBRARY } from "@/lib/sections";
import { readSectionStyle, withSectionStyle, type SectionStyle } from "@/lib/section-style";

export interface EditorDoc {
  sections: SiteSection[];
}

const KNOWN_TYPES = new Set<string>(SECTION_LIBRARY.map((s) => s.type as string));

/** A section type's name in the UI ("whyUs" is not a thing to show a plumber). */
export function typeLabel(type: SectionType): string {
  return SECTION_LIBRARY.find((s) => s.type === type)?.name ?? type;
}

/** Longest value a text field may hold; keeps a paste from becoming the page. */
const LIMIT = 2000;

function mapSection(doc: EditorDoc, id: string, fn: (s: SiteSection) => SiteSection): EditorDoc {
  return { ...doc, sections: doc.sections.map((s) => (s.id === id ? fn(s) : s)) };
}

function cloneContent(section: SiteSection): Record<string, unknown> {
  return { ...(section.content ?? {}) };
}

/**
 * Set one content key.
 *
 * An empty string deletes the key rather than storing "" — the difference
 * matters for the generator's own fallbacks (`c.heading || preset.heading`),
 * which an empty string would defeat and a missing key would not.
 */
export function setField(doc: EditorDoc, id: string, key: string, value: unknown): EditorDoc {
  const text = typeof value === "string" ? value.slice(0, LIMIT) : value;
  return mapSection(doc, id, (section) => {
    const content = cloneContent(section);
    if (text === "" || text === undefined || text === null) delete content[key];
    else content[key] = text;
    return { ...section, content };
  });
}

export function setStyle(doc: EditorDoc, id: string, key: keyof SectionStyle, value: unknown): EditorDoc {
  return mapSection(doc, id, (section) => withSectionStyle(section, key, value));
}

/** The list a section keeps in `content[key]` (whyUs points, FAQ questions). */
function readItems(section: SiteSection, key: string): Record<string, unknown>[] {
  const raw = section.content?.[key];
  if (!Array.isArray(raw)) return [];
  return raw.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row));
}

export function setItem(
  doc: EditorDoc, id: string, key: string, index: number, field: string, value: unknown,
): EditorDoc {
  const text = typeof value === "string" ? value.slice(0, LIMIT) : value;
  return mapSection(doc, id, (section) => {
    const items = readItems(section, key).map((row) => ({ ...row }));
    if (index < 0 || index >= items.length) return section;
    if (text === "" || text === undefined || text === null) delete items[index][field];
    else items[index][field] = text;
    const content = cloneContent(section);
    content[key] = items;
    return { ...section, content };
  });
}

export function addItem(doc: EditorDoc, id: string, key: string, max = 12): EditorDoc {
  return mapSection(doc, id, (section) => {
    const items = readItems(section, key).map((row) => ({ ...row }));
    if (items.length >= max) return section;
    items.push({});
    const content = cloneContent(section);
    content[key] = items;
    return { ...section, content };
  });
}

export function removeItem(doc: EditorDoc, id: string, key: string, index: number): EditorDoc {
  return mapSection(doc, id, (section) => {
    const items = readItems(section, key).map((row) => ({ ...row }));
    if (index < 0 || index >= items.length) return section;
    items.splice(index, 1);
    const content = cloneContent(section);
    if (items.length) content[key] = items;
    else delete content[key];
    return { ...section, content };
  });
}

export function moveItem(doc: EditorDoc, id: string, key: string, from: number, to: number): EditorDoc {
  return mapSection(doc, id, (section) => {
    const items = readItems(section, key).map((row) => ({ ...row }));
    if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) return section;
    const [row] = items.splice(from, 1);
    items.splice(to, 0, row);
    const content = cloneContent(section);
    content[key] = items;
    return { ...section, content };
  });
}

/** Move a section to a new index in the page order. Out-of-range is a no-op. */
export function moveSection(doc: EditorDoc, id: string, to: number): EditorDoc {
  const from = doc.sections.findIndex((s) => s.id === id);
  const target = Math.max(0, Math.min(doc.sections.length - 1, to));
  if (from < 0 || from === target) return doc;
  const sections = [...doc.sections];
  const [section] = sections.splice(from, 1);
  sections.splice(target, 0, section);
  return { ...doc, sections };
}

/** Drag-and-drop hands over a target section rather than an index. */
export function moveSectionBefore(doc: EditorDoc, id: string, beforeId: string): EditorDoc {
  const to = doc.sections.findIndex((s) => s.id === beforeId);
  if (to < 0) return doc;
  const from = doc.sections.findIndex((s) => s.id === id);
  if (from < 0) return doc;
  // Removing from before the target shifts the target left by one.
  return moveSection(doc, id, from < to ? to - 1 : to);
}

export function toggleVisible(doc: EditorDoc, id: string): EditorDoc {
  return mapSection(doc, id, (s) => ({ ...s, visible: s.visible === false }));
}

export function removeSection(doc: EditorDoc, id: string): EditorDoc {
  return { ...doc, sections: doc.sections.filter((s) => s.id !== id) };
}

export function duplicateSection(doc: EditorDoc, id: string): EditorDoc {
  const at = doc.sections.findIndex((s) => s.id === id);
  if (at < 0) return doc;
  const copy: SiteSection = {
    ...doc.sections[at],
    id: `s_${Math.random().toString(36).slice(2, 10)}`,
    content: { ...(doc.sections[at].content ?? {}) },
  };
  const sections = [...doc.sections];
  sections.splice(at + 1, 0, copy);
  return { ...doc, sections };
}

/**
 * A new section of a given type, dropped in after `afterId`.
 *
 * It starts with a heading from the library and nothing else: an empty list
 * renders nothing (the sections hide themselves), which is honest — the owner
 * adds rows, and until they do the page looks exactly as it did before.
 */
export function addSection(doc: EditorDoc, type: SectionType, afterId?: string): EditorDoc {
  if (!KNOWN_TYPES.has(type)) return doc;
  const section: SiteSection = {
    id: `s_${Math.random().toString(36).slice(2, 10)}`,
    type,
    visible: true,
    content: headingFor(type) ? { title: headingFor(type) } : {},
  };
  const at = afterId ? doc.sections.findIndex((s) => s.id === afterId) : -1;
  const sections = [...doc.sections];
  sections.splice(at < 0 ? sections.length : at + 1, 0, section);
  return { ...doc, sections };
}

function headingFor(type: SectionType): string {
  switch (type) {
    case "services": case "products": return "What We Offer";
    case "whyUs": return "Why Choose Us";
    case "gallery": return "Our Work";
    case "testimonials": return "What Customers Say";
    case "faq": return "Common Questions";
    case "cta": return "Ready to get started?";
    case "contact": return "Get in Touch";
    case "hours": return "Opening Hours";
    case "payment": return "Pay Now";
    case "about": return "About Us";
    case "stats": case "hero": case "blog": return "";
    default: return "";
  }
}

/** Stable string for dirty-checking and for noticing "nothing actually changed". */
export function docSignature(doc: EditorDoc): string {
  return JSON.stringify(doc.sections);
}

/**
 * The change list a save shows back to the owner.
 *
 * Deterministic and derived from the two documents — never from what the UI
 * thinks it did — so the list cannot claim a change that did not happen or miss
 * one that did.
 */
export function summarizeChanges(before: EditorDoc, after: EditorDoc): string[] {
  const out: string[] = [];
  const byId = new Map(before.sections.map((s) => [s.id, s]));

  for (const section of after.sections) {
    const prior = byId.get(section.id);
    const label = typeLabel(section.type);
    if (!prior) {
      out.push(`${label}: added`);
      continue;
    }
    const keys = new Set([...Object.keys(prior.content ?? {}), ...Object.keys(section.content ?? {})]);
    let changed = 0;
    for (const key of keys) {
      if (key === "__style") continue;
      const a = JSON.stringify(prior.content?.[key] ?? null);
      const b = JSON.stringify(section.content?.[key] ?? null);
      if (a !== b) changed++;
    }
    if (changed) out.push(`${label}: ${changed} field${changed === 1 ? "" : "s"} changed`);
    const styleBefore = readSectionStyle(prior);
    const styleAfter = readSectionStyle(section);
    if (JSON.stringify(styleBefore) !== JSON.stringify(styleAfter)) out.push(`${label}: layout style changed`);
    if (prior.visible !== section.visible) out.push(`${label}: ${section.visible === false ? "hidden" : "shown"}`);
  }

  for (const section of before.sections) {
    if (!after.sections.some((s) => s.id === section.id)) out.push(`${typeLabel(section.type)}: removed`);
  }

  const order = (doc: EditorDoc) => doc.sections.map((s) => s.id).join(">");
  if (order(before) !== order(after) && out.every((line) => !line.endsWith("added"))) {
    out.push("Page order changed");
  }
  return out;
}

/**
 * The undo stack.
 *
 * Documents are immutable, so a history entry is a reference to a whole
 * document — cheap, and impossible for two entries to drift into the same
 * object. Pushing after an undo drops the redo tail, which is what every editor
 * does and what the owner expects.
 */
export class EditorHistory {
  private docs: EditorDoc[] = [];
  private labels: string[] = [];
  private index = 0;
  private readonly cap: number;
  private lastKey = "";
  private lastAt = 0;

  constructor(doc: EditorDoc, cap = 60) {
    this.cap = Math.max(2, cap);
    this.docs = [doc];
    this.labels = ["Opened"];
  }

  get current(): EditorDoc {
    return this.docs[this.index];
  }
  get canUndo(): boolean {
    return this.index > 0;
  }
  get canRedo(): boolean {
    return this.index < this.docs.length - 1;
  }
  /** The label of the step that would be undone — shown on the Undo button. */
  get undoLabel(): string {
    return this.canUndo ? this.labels[this.index] : "";
  }
  get depth(): number {
    return this.docs.length;
  }

  push(doc: EditorDoc, label: string): EditorDoc {
    if (docSignature(doc) === docSignature(this.docs[this.index])) return doc;
    this.docs = this.docs.slice(0, this.index + 1);
    this.docs.push(doc);
    this.labels.push(label);
    if (this.docs.length > this.cap) {
      this.docs.shift();
      this.labels.shift();
    }
    this.index = this.docs.length - 1;
    return doc;
  }

  /**
   * A keystroke is not an undo step.
   *
   * Typing in one field replaces the top of the stack instead of pushing a new
   * entry, until the owner stops for a moment or moves to another field — the
   * difference between pressing Undo once and pressing it forty times.
   */
  pushCoalesced(doc: EditorDoc, label: string, key: string, now = Date.now()): EditorDoc {
    const sameField = key !== "" && key === this.lastKey && now - this.lastAt < 1500 && this.canUndo;
    this.lastKey = key;
    this.lastAt = now;
    if (docSignature(doc) === docSignature(this.docs[this.index])) return doc;
    if (sameField) {
      this.docs[this.index] = doc;
      this.labels[this.index] = label;
      return doc;
    }
    return this.push(doc, label);
  }

  undo(): EditorDoc {
    if (this.canUndo) this.index--;
    return this.current;
  }
  redo(): EditorDoc {
    if (this.canRedo) this.index++;
    return this.current;
  }
  /** Keeps the stack, moves the baseline — used after a successful save. */
  markSaved(): void {
    this.docs = [this.docs[this.index]];
    this.labels = ["Saved"];
    this.index = 0;
  }
}

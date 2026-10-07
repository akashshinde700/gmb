// WebSetu — what a section lets you change, per section type.
//
// This is the freeform editor's half of the content contract. Every key here is
// one a section component actually reads (src/components/site/sections.tsx); the
// editor can therefore offer exactly the fields that do something, and nothing
// that quietly does not. It is data, not JSX, so a test can walk it and fail the
// build the day a section type gains a field nobody can edit — the failure mode
// the old form-based editor shipped once already (a Blog section with no way to
// change its title).
//
// The variant options are the values the renderers switch on. An unknown value
// falls through to the default layout, which is why the list is closed.

import type { SectionType } from "@/lib/types";

export type FieldKind = "text" | "textarea" | "image" | "select" | "items" | "url";

export interface ItemField {
  key: string;
  label: string;
  kind: "text" | "textarea";
  placeholder?: string;
}

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  placeholder?: string;
  /** Longest value the section renders sensibly; the editor caps input here. */
  max?: number;
  options?: { value: string; label: string }[];
  itemFields?: ItemField[];
  /** Item arrays are capped: a page is not a database. */
  maxItems?: number;
}

const body = (key = "body", label = "Text", placeholder = ""): FieldDef => ({
  key, label, kind: "textarea", max: 2000, placeholder,
});

/** Variant selects, named the way the layouts read on screen. */
const variant = (options: { value: string; label: string }[]): FieldDef => ({
  key: "variant", label: "Layout", kind: "select", options,
});

export const SECTION_FIELDS: Record<SectionType, FieldDef[]> = {
  hero: [
    { key: "badge", label: "Small badge", kind: "text", max: 60, placeholder: "e.g. Since 1998" },
    { key: "heading", label: "Headline", kind: "text", max: 120 },
    { key: "subheading", label: "Sub-headline", kind: "textarea", max: 300 },
    { key: "ctaPrimary", label: "Main button", kind: "text", max: 40 },
    { key: "ctaSecondary", label: "Second button", kind: "text", max: 40 },
    { key: "image", label: "Photo", kind: "image" },
    {
      key: "ctaPrimaryAction", label: "Main button goes to", kind: "select",
      options: [
      { value: "form", label: "Opens the enquiry form" },
      { value: "call", label: "Starts a phone call" },
      { value: "whatsapp", label: "Opens WhatsApp" },
      { value: "directions", label: "Opens directions" },
      { value: "menu", label: "Jumps to the services" },
    ],
    },
    {
      key: "ctaSecondaryAction", label: "Second button goes to", kind: "select",
      options: [
      { value: "form", label: "Opens the enquiry form" },
      { value: "call", label: "Starts a phone call" },
      { value: "whatsapp", label: "Opens WhatsApp" },
      { value: "directions", label: "Opens directions" },
      { value: "menu", label: "Jumps to the services" },
    ],
    },
    variant([
      { value: "banner", label: "Full banner" },
      { value: "editorial", label: "Editorial" },
      { value: "centred", label: "Centred" },
      { value: "split", label: "Split with photo" },
    ]),
  ],
  about: [
    { key: "title", label: "Heading", kind: "text", max: 90 },
    body(),
    { key: "image", label: "Photo", kind: "image" },
    variant([
      { value: "split", label: "Photo + text" },
      { value: "timeline", label: "Steps" },
      { value: "bento", label: "Bento" },
    ]),
  ],
  stats: [
    {
      key: "items", label: "Figures", kind: "items", maxItems: 6,
      itemFields: [
        { key: "value", label: "Number", kind: "text", placeholder: "e.g. 12+" },
        { key: "label", label: "What it counts", kind: "text", placeholder: "e.g. Years in business" },
      ],
    },
    variant([
      { value: "row", label: "Row" },
      { value: "cards", label: "Cards" },
      { value: "band", label: "Full-width band" },
    ]),
  ],
  services: [
    { key: "title", label: "Heading", kind: "text", max: 90 },
    { key: "subtitle", label: "Sub-heading", kind: "text", max: 160 },
    variant([
      { value: "grid", label: "Cards" },
      { value: "list", label: "List" },
      { value: "process", label: "Numbered process" },
    ]),
  ],
  products: [
    { key: "title", label: "Heading", kind: "text", max: 90 },
    { key: "subtitle", label: "Sub-heading", kind: "text", max: 160 },
  ],
  whyUs: [
    { key: "title", label: "Heading", kind: "text", max: 90 },
    {
      key: "items", label: "Reasons", kind: "items", maxItems: 6,
      itemFields: [
        { key: "title", label: "Point", kind: "text" },
        { key: "description", label: "One line about it", kind: "textarea" },
      ],
    },
    variant([
      { value: "cards", label: "Cards" },
      { value: "numbered", label: "Numbered" },
      { value: "bento", label: "Bento" },
    ]),
  ],
  gallery: [
    { key: "title", label: "Heading", kind: "text", max: 90 },
    { key: "subtitle", label: "Sub-heading", kind: "text", max: 160 },
    variant([
      { value: "grid", label: "Grid" },
      { value: "filmstrip", label: "Filmstrip" },
      { value: "masonry", label: "Masonry" },
    ]),
  ],
  testimonials: [
    { key: "title", label: "Heading", kind: "text", max: 90 },
    { key: "subtitle", label: "Sub-heading", kind: "text", max: 160 },
    variant([
      { value: "grid", label: "Grid" },
      { value: "spotlight", label: "Spotlight" },
      { value: "wall", label: "Wall" },
    ]),
  ],
  faq: [
    { key: "title", label: "Heading", kind: "text", max: 90 },
    {
      key: "items", label: "Questions", kind: "items", maxItems: 12,
      itemFields: [
        { key: "question", label: "Question", kind: "text" },
        { key: "answer", label: "Answer", kind: "textarea" },
      ],
    },
    variant([
      { value: "accordion", label: "Accordion" },
      { value: "two-col", label: "Two columns" },
    ]),
  ],
  blog: [
    { key: "title", label: "Heading", kind: "text", max: 90 },
    { key: "subtitle", label: "Sub-heading", kind: "text", max: 160 },
    variant([
      { value: "grid", label: "Cards" },
      { value: "list", label: "List" },
    ]),
  ],
  cta: [
    { key: "title", label: "Heading", kind: "text", max: 90 },
    { key: "subtitle", label: "Sub-heading", kind: "textarea", max: 240 },
    { key: "primary", label: "Main button", kind: "text", max: 40 },
    { key: "secondary", label: "Second button", kind: "text", max: 40 },
    { key: "image", label: "Photo", kind: "image" },
    {
      key: "primaryAction", label: "Main button goes to", kind: "select",
      options: [
      { value: "form", label: "Opens the enquiry form" },
      { value: "call", label: "Starts a phone call" },
      { value: "whatsapp", label: "Opens WhatsApp" },
      { value: "directions", label: "Opens directions" },
      { value: "menu", label: "Jumps to the services" },
    ],
    },
    {
      key: "secondaryAction", label: "Second button goes to", kind: "select",
      options: [
      { value: "form", label: "Opens the enquiry form" },
      { value: "call", label: "Starts a phone call" },
      { value: "whatsapp", label: "Opens WhatsApp" },
      { value: "directions", label: "Opens directions" },
      { value: "menu", label: "Jumps to the services" },
    ],
    },
    variant([
      { value: "banner", label: "Banner" },
      { value: "split", label: "Split with photo" },
    ]),
  ],
  payment: [
    { key: "title", label: "Heading", kind: "text", max: 90 },
    { key: "subtitle", label: "Sub-heading", kind: "text", max: 160 },
    { key: "note", label: "Note under the QR", kind: "textarea", max: 240 },
  ],
  hours: [{ key: "title", label: "Heading", kind: "text", max: 90 }],
  contact: [
    { key: "title", label: "Heading", kind: "text", max: 90 },
    { key: "subtitle", label: "Sub-heading", kind: "text", max: 160 },
    { key: "mapUrl", label: "Map link", kind: "url" },
    variant([
      { value: "form-side", label: "Form beside details" },
      { value: "form-below", label: "Form below" },
    ]),
  ],
};

/** Section types whose body is a list the owner can add rows to. */
export function itemFieldsFor(type: SectionType): ItemField[] | undefined {
  return SECTION_FIELDS[type].find((f) => f.kind === "items")?.itemFields;
}

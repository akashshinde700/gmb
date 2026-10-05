// WebSetu — brand colour palettes.
//
// Palettes live in the database (model `Palette`) so a platform admin can add,
// edit and retire them from the admin console. The list below is the built-in
// set the table is seeded from on first use, and the fallback the UI renders
// with if the API is unreachable.
//
// `scope` decides where a palette can be picked:
//   BUSINESS — tenant websites only
//   PLATFORM — WebSetu's own landing + login pages only
//   BOTH     — offered in both pickers

export type PaletteScope = "BUSINESS" | "PLATFORM" | "BOTH";

export interface BrandPalette {
  id?: string;
  name: string;
  mood: string;
  /** [primary, secondary, accent] — kept as a tuple for the existing pickers. */
  colors: [string, string, string];
  scope?: PaletteScope;
  builtIn?: boolean;
  active?: boolean;
  sortOrder?: number;
}

export const BRAND_PALETTES: BrandPalette[] = [
  // — greens & teals ————————————————————————————————
  { name: "Emerald Fresh", mood: "Trust · Nature", colors: ["#059669", "#064e3b", "#f59e0b"] },
  { name: "Teal Calm", mood: "Clinic · Wellness", colors: ["#0d9488", "#134e4a", "#f59e0b"] },
  { name: "Forest Green", mood: "Organic · Farm", colors: ["#16a34a", "#14532d", "#facc15"] },
  { name: "Mint Studio", mood: "Salon · Spa", colors: ["#10b981", "#065f46", "#fb7185"] },
  { name: "Olive Craft", mood: "Handmade · Decor", colors: ["#4d7c0f", "#1a2e05", "#f59e0b"] },

  // — blues ——————————————————————————————————————
  { name: "Corporate Navy", mood: "Corporate · B2B", colors: ["#1e40af", "#172554", "#f59e0b"] },
  { name: "Sky Modern", mood: "Tech · Startup", colors: ["#0284c7", "#0c4a6e", "#f97316"] },
  { name: "Indigo Pro", mood: "Consulting · Legal", colors: ["#4f46e5", "#1e1b4b", "#f59e0b"] },
  { name: "Steel Blue", mood: "Industrial · Auto", colors: ["#0369a1", "#082f49", "#eab308"] },

  // — warm ———————————————————————————————————————
  { name: "Golden Warm", mood: "Heritage · Retail", colors: ["#d97706", "#78350f", "#fbbf24"] },
  { name: "Sunset Spice", mood: "Restaurant · Food", colors: ["#ea580c", "#9a3412", "#fbbf24"] },
  { name: "Coffee Brown", mood: "Cafe · Bakery", colors: ["#92400e", "#451a03", "#fbbf24"] },
  { name: "Terracotta", mood: "Pottery · Interiors", colors: ["#c2410c", "#431407", "#fcd34d"] },
  { name: "Amber Trade", mood: "Wholesale · Grain", colors: ["#b45309", "#451a03", "#65a30d"] },

  // — reds, pinks & purples ——————————————————————————
  { name: "Crimson Bold", mood: "Gym · Sports", colors: ["#dc2626", "#450a0a", "#fbbf24"] },
  { name: "Wine Maroon", mood: "Sweets · Events", colors: ["#9f1239", "#4c0519", "#fb923c"] },
  { name: "Rose Boutique", mood: "Beauty · Fashion", colors: ["#e11d48", "#4c0519", "#f59e0b"] },
  { name: "Royal Purple", mood: "Premium · Luxury", colors: ["#7c3aed", "#3b0764", "#f59e0b"] },
  { name: "Plum Elegant", mood: "Jewellery · Bridal", colors: ["#a21caf", "#4a044e", "#fbbf24"] },
  { name: "Saffron Festive", mood: "Puja · Catering", colors: ["#f97316", "#7c2d12", "#be123c"] },

  // — neutrals ———————————————————————————————————
  { name: "Slate Mono", mood: "Minimal · Modern", colors: ["#3f3f46", "#18181b", "#f59e0b"] },
  { name: "Graphite Sharp", mood: "Photography · Studio", colors: ["#334155", "#020617", "#38bdf8"] },
  { name: "Charcoal Gold", mood: "Real estate · Premium", colors: ["#27272a", "#09090b", "#d4af37"] },
];

/** Built-in seed rows, in list order, all offered in both pickers. */
export function builtInPaletteRows() {
  return BRAND_PALETTES.map((p, i) => ({
    name: p.name,
    mood: p.mood,
    primary: p.colors[0],
    secondary: p.colors[1],
    accent: p.colors[2],
    scope: "BOTH",
    builtIn: true,
    active: true,
    sortOrder: i + 1,
  }));
}

/** Filter a palette list down to one picker's scope. */
export function forScope(palettes: BrandPalette[], scope: "BUSINESS" | "PLATFORM"): BrandPalette[] {
  return palettes.filter((p) => {
    if (p.active === false) return false;
    const s = p.scope ?? "BOTH";
    return s === "BOTH" || s === scope;
  });
}

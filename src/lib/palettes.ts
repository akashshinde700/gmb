// WebSetu — Curated brand color palettes for tenant websites.
// Shared by dashboard ThemePanel + onboarding Branding step.
export interface BrandPalette {
  name: string;
  mood: string;
  colors: [string, string, string]; // [primary, secondary, accent]
}

export const BRAND_PALETTES: BrandPalette[] = [
  { name: "Emerald Fresh", mood: "Trust · Nature", colors: ["#059669", "#064e3b", "#f59e0b"] },
  { name: "Teal Calm", mood: "Clinic · Wellness", colors: ["#0d9488", "#134e4a", "#f59e0b"] },
  { name: "Golden Warm", mood: "Heritage · Retail", colors: ["#d97706", "#78350f", "#fbbf24"] },
  { name: "Sunset Spice", mood: "Restaurant · Food", colors: ["#ea580c", "#9a3412", "#fbbf24"] },
  { name: "Rose Boutique", mood: "Beauty · Fashion", colors: ["#e11d48", "#4c0519", "#f59e0b"] },
  { name: "Royal Purple", mood: "Premium · Luxury", colors: ["#7c3aed", "#3b0764", "#f59e0b"] },
  { name: "Corporate Navy", mood: "Corporate · B2B", colors: ["#1e40af", "#172554", "#f59e0b"] },
  { name: "Forest Green", mood: "Organic · Farm", colors: ["#16a34a", "#14532d", "#facc15"] },
  { name: "Wine Maroon", mood: "Sweets · Events", colors: ["#9f1239", "#4c0519", "#fb923c"] },
  { name: "Coffee Brown", mood: "Cafe · Bakery", colors: ["#92400e", "#451a03", "#fbbf24"] },
  { name: "Slate Mono", mood: "Minimal · Modern", colors: ["#3f3f46", "#18181b", "#f59e0b"] },
  { name: "Crimson Bold", mood: "Gym · Sports", colors: ["#dc2626", "#450a0a", "#fbbf24"] },
];

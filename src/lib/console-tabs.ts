// WebSetu — the console's tab slugs, in one place.
//
// These strings are now URLs, which makes them a contract: they appear in
// bookmarks, in support links and in browser history. Renaming one breaks those
// for everybody, so they stay exactly as the tabs were already named rather
// than being "tidied up" into something prettier.
//
// No imports, so route files, the store and tests can all share this list.

export const DASHBOARD_TABS = [
  "overview", "builder", "business", "services", "products", "gallery",
  "testimonials", "faqs", "blog", "leads", "orders", "seo", "analytics",
  "hosting", "subscription", "settings",
] as const;

export const ADMIN_TABS = [
  "overview", "customers", "plans", "templates", "coupons", "leads",
  "blog", "appearance", "domains", "ai",
] as const;

export type DashboardTabSlug = (typeof DASHBOARD_TABS)[number];
export type AdminTabSlug = (typeof ADMIN_TABS)[number];

export function isDashboardTab(value: string): value is DashboardTabSlug {
  return (DASHBOARD_TABS as readonly string[]).includes(value);
}

export function isAdminTab(value: string): value is AdminTabSlug {
  return (ADMIN_TABS as readonly string[]).includes(value);
}

/** Human label for a tab slug — used for the browser tab title. */
const TITLES: Record<string, string> = {
  overview: "Overview",
  builder: "Website Builder",
  business: "Business Profile",
  services: "Services",
  products: "Products",
  gallery: "Gallery",
  testimonials: "Testimonials",
  faqs: "FAQs",
  blog: "Blog",
  leads: "Leads",
  orders: "Orders",
  seo: "SEO",
  analytics: "Analytics",
  hosting: "Hosting & Email",
  subscription: "Subscription",
  settings: "Settings",
  customers: "Customers",
  plans: "Plans",
  templates: "Templates",
  coupons: "Coupons",
  appearance: "Appearance",
  domains: "Domains",
  ai: "AI Manager",
};

export function tabTitle(slug: string): string {
  return TITLES[slug] ?? slug;
}

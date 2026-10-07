"use client";
// WebSetu — global app state (session, routing, notifications)
import { create } from "zustand";
import { api } from "@/lib/api-client";
import { clearOnboardingDraft } from "@/lib/onboarding-draft";
import type { AppearanceAllowance, Business, Plan, SessionUser, Subscription, WebsiteData } from "@/lib/types";
import { DEFAULT_PLATFORM_THEME, type PlatformTheme } from "@/lib/platform-theme";

export type View = "home" | "auth" | "onboarding" | "dashboard" | "admin" | "site";
export type DashboardTab =
  | "overview" | "builder" | "business" | "services" | "products" | "gallery"
  | "testimonials" | "faqs" | "blog" | "leads" | "orders" | "seo" | "analytics"
  | "hosting" | "subscription" | "settings";
export type AdminTab = "overview" | "customers" | "plans" | "templates" | "coupons" | "leads" | "blog" | "appearance" | "domains" | "ai";

export interface BusinessWithMeta extends Business {
  website: WebsiteData | null;
  subscription: Subscription | null;
  /** Remaining design changes — absent until /api/auth/me has answered. */
  appearance?: AppearanceAllowance | null;
  /** Verified custom hostname serving this site, when one is connected. */
  primaryDomain?: string | null;
}

interface AppState {
  hydrated: boolean;
  view: View;
  authMode: "login" | "register";
  user: SessionUser | null;
  business: BusinessWithMeta | null;
  plans: Plan[];
  dashboardTab: DashboardTab;
  adminTab: AdminTab;
  siteSlug: string | null;
  siteOrigin: "public" | "dashboard";
  unreadNotifications: number;
  /** Palette for WebSetu's own landing + login pages (admin-controlled). */
  platformTheme: PlatformTheme;

  setView: (v: View) => void;
  setAuthMode: (m: "login" | "register") => void;
  setBusiness: (b: BusinessWithMeta | null) => void;
  patchBusiness: (b: Partial<BusinessWithMeta>) => void;
  setDashboardTab: (t: DashboardTab) => void;
  setAdminTab: (t: AdminTab) => void;
  /** URL-driven update: sets tab state without pushing a new history entry. */
  syncTabs: (tabs: Partial<Pick<AppState, "dashboardTab" | "adminTab" | "view">>) => void;
  openSite: (slug: string, origin?: "public" | "dashboard") => void;
  setUnread: (n: number) => void;
  setPlatformTheme: (t: PlatformTheme) => void;

  /** True while this browser is inside a customer account opened from Admin. */
  impersonating: boolean;
  /** Put the admin session back, from the copy parked at impersonation time. */
  returnToAdmin: () => Promise<void>;

  hydrate: () => Promise<void>;
  logout: () => void;
  /** Sign out of this browser and invalidate every other session too. */
  logoutEverywhere: () => Promise<void>;
}

/**
 * The router, handed over by <RouteSync> once the app mounts.
 *
 * Zustand lives outside React, so it cannot call useRouter(). Rather than
 * rewrite every navigation call site in two 3,800-line views, the store keeps
 * the same `setDashboardTab`/`openSite` API and delegates the actual navigation
 * here. Before it is installed — during SSR, or before mount — navigation
 * degrades to a plain state change, which is exactly right: there is no history
 * to push to yet.
 */
let navigate: ((path: string) => void) | null = null;

export function installNavigator(fn: (path: string) => void) {
  navigate = fn;
}

/** Path for a dashboard tab. The tab slug IS the URL segment, deliberately. */
export function dashboardPath(tab: DashboardTab): string {
  return tab === "overview" ? "/dashboard" : `/dashboard/${tab}`;
}

export function adminPath(tab: AdminTab): string {
  return tab === "overview" ? "/admin" : `/admin/${tab}`;
}

/**
 * Translate a legacy hash route to its real path.
 *
 * Links of the form /#/dashboard were emailed to customers before the console
 * had real URLs — those messages are sitting in inboxes and must keep working,
 * so this stays for good rather than being a migration step.
 */
export function pathForLegacyHash(hash: string): string | null {
  const h = hash.replace(/^#\/?/, "");
  if (!h) return null;
  if (h.startsWith("site/")) return `/preview/${h.slice(5)}`;
  if (h.startsWith("dashboard")) return "/dashboard";
  if (h.startsWith("admin")) return "/admin";
  if (h.startsWith("onboarding")) return "/onboarding";
  if (h.startsWith("login")) return "/login";
  return null;
}

function parseHash(): { view: View; slug: string | null } {
  const h = window.location.hash.replace(/^#\/?/, "");
  if (h.startsWith("site/")) return { view: "site", slug: h.slice(5) };
  if (h.startsWith("dashboard")) return { view: "dashboard", slug: null };
  if (h.startsWith("admin")) return { view: "admin", slug: null };
  if (h.startsWith("onboarding")) return { view: "onboarding", slug: null };
  if (h.startsWith("login")) return { view: "auth", slug: null };
  return { view: "home", slug: null };
}

export const useApp = create<AppState>((set, get) => ({
  hydrated: false,
  view: "home",
  authMode: "login",
  user: null,
  business: null,
  plans: [],
  dashboardTab: "overview",
  adminTab: "overview",
  siteSlug: null,
  siteOrigin: "public",
  unreadNotifications: 0,
  platformTheme: DEFAULT_PLATFORM_THEME,
  impersonating: false,

  setView: (v) => set({ view: v }),
  setAuthMode: (m) => set({ authMode: m }),
  setBusiness: (b) => set({ business: b }),
  patchBusiness: (b) => {
    const cur = get().business;
    if (cur) set({ business: { ...cur, ...b } });
  },
  // These two are what every nav item, quick action and dropdown already call.
  // Changing what they do — rather than changing the hundreds of places that
  // call them — is what makes real URLs a contained change.
  setDashboardTab: (t) => {
    set({ dashboardTab: t });
    navigate?.(dashboardPath(t));
  },
  setAdminTab: (t) => {
    set({ adminTab: t });
    navigate?.(adminPath(t));
  },
  /** Used by <RouteSync> when the URL is the source of the change, so it does
   *  not push the history entry it is already reacting to. */
  syncTabs: (tabs) => set(tabs),
  openSite: (slug, origin = "dashboard") => {
    set({ view: "site", siteSlug: slug, siteOrigin: origin });
    // A published site has its own public URL; an unpublished one is only
    // viewable by its owner, which is what /preview is for.
    navigate?.(origin === "public" ? `/s/${slug}` : `/preview/${slug}`);
  },
  setUnread: (n) => set({ unreadNotifications: n }),
  setPlatformTheme: (t) => set({ platformTheme: t }),

  hydrate: async () => {
    const { view, slug } = parseHash();
    set({ view, siteSlug: slug });

    api.get<{ plans: Plan[] }>("/api/plans").then((d) => set({ plans: d.plans })).catch(() => {});
    // Public palette for the marketing + login screens. A failure here just
    // leaves the built-in default in place.
    api
      .get<{ theme: PlatformTheme }>("/api/settings/theme")
      .then((d) => set({ platformTheme: d.theme }))
      .catch(() => {});

    // The session is an httpOnly cookie the browser attaches by itself, so
    // there is nothing to check before asking: /api/auth/me answers 401 when
    // there is no session, which is simply "not logged in".
    try {
      const d = await api.get<{
        user: SessionUser;
        business: BusinessWithMeta | null;
        impersonating?: boolean;
      }>("/api/auth/me");
      set({ user: d.user, business: d.business, impersonating: !!d.impersonating });
    } catch {
      /* not signed in */
    }
    set({ hydrated: true });
  },

  returnToAdmin: async () => {
    await api.post("/api/admin/return");
    // A hard reload, not a router.push: the identity underneath this React tree
    // just changed, and everything it has cached was fetched as somebody else.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/admin");
  },

  logout: () => {
    // Clear local state first so the UI never shows a signed-in shell while the
    // request is in flight; the cookie is httpOnly, so only the server can
    // actually remove it.
    set({ user: null, business: null, view: "home", unreadNotifications: 0 });
    // A half-filled onboarding draft is business PII sitting in localStorage:
    // signing out is the customer saying "not on this device any more".
    clearOnboardingDraft();
    // Clear the session before navigating, not alongside it. The cookie is
    // httpOnly, so only the server can remove it — and the landing page is
    // server-rendered, so leaving while the request is still in flight renders
    // it as still signed in, complete with a "Go to dashboard" button.
    void api
      .post("/api/auth/logout")
      .catch(() => {})
      .finally(() => navigate?.("/"));
  },

  logoutEverywhere: async () => {
    await api.post("/api/auth/logout", { everywhere: true });
    set({ user: null, business: null, view: "home", unreadNotifications: 0 });
    clearOnboardingDraft();
    navigate?.("/");
  },
}));

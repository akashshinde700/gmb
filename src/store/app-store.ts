"use client";
// WebSetu — global app state (session, routing, notifications)
import { create } from "zustand";
import { api, getToken, setToken } from "@/lib/api-client";
import type { Business, Plan, SessionUser, Subscription, WebsiteData } from "@/lib/types";

export type View = "home" | "auth" | "onboarding" | "dashboard" | "admin" | "site";
export type DashboardTab =
  | "overview" | "builder" | "business" | "services" | "products" | "gallery"
  | "testimonials" | "faqs" | "blog" | "leads" | "seo" | "analytics" | "subscription" | "settings";
export type AdminTab = "overview" | "customers" | "plans" | "templates" | "coupons" | "leads";

export interface BusinessWithMeta extends Business {
  website: WebsiteData | null;
  subscription: Subscription | null;
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

  setView: (v: View) => void;
  setAuthMode: (m: "login" | "register") => void;
  setBusiness: (b: BusinessWithMeta | null) => void;
  patchBusiness: (b: Partial<BusinessWithMeta>) => void;
  setDashboardTab: (t: DashboardTab) => void;
  setAdminTab: (t: AdminTab) => void;
  openSite: (slug: string, origin?: "public" | "dashboard") => void;
  setUnread: (n: number) => void;

  hydrate: () => Promise<void>;
  logout: () => void;
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

  setView: (v) => set({ view: v }),
  setAuthMode: (m) => set({ authMode: m }),
  setBusiness: (b) => set({ business: b }),
  patchBusiness: (b) => {
    const cur = get().business;
    if (cur) set({ business: { ...cur, ...b } });
  },
  setDashboardTab: (t) => set({ dashboardTab: t }),
  setAdminTab: (t) => set({ adminTab: t }),
  openSite: (slug, origin = "dashboard") => {
    window.location.hash = `#/site/${slug}`;
    set({ view: "site", siteSlug: slug, siteOrigin: origin });
  },
  setUnread: (n) => set({ unreadNotifications: n }),

  hydrate: async () => {
    const { view, slug } = parseHash();
    set({ view, siteSlug: slug });

    api.get<{ plans: Plan[] }>("/api/plans").then((d) => set({ plans: d.plans })).catch(() => {});

    if (getToken()) {
      try {
        const d = await api.get<{ user: SessionUser; business: BusinessWithMeta | null }>("/api/auth/me");
        set({ user: d.user, business: d.business });
      } catch {
        setToken("");
      }
    }
    set({ hydrated: true });
  },

  logout: () => {
    setToken("");
    set({ user: null, business: null, view: "home", unreadNotifications: 0 });
    window.location.hash = "#/";
  },
}));

"use client";
// WebSetu — Customer Dashboard (Task 6-c)
// Sidebar + 14 tab views: overview, builder, business, 6x content CRUD,
// leads, seo, analytics, subscription, settings. All data via api client.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle, ArrowLeft, BarChart3, Bell, Briefcase, Building2, Check, CheckCircle2,
  ChevronDown, ChevronUp, Clock, Copy, CreditCard, Download, ExternalLink, Eye, EyeOff,
  Globe, GripVertical, HelpCircle, Image as ImageIcon, ImagePlus, Inbox, Info, LayoutDashboard,
  LayoutTemplate, Link2, Loader2, LogOut, Mail, MapPin, Menu, MessageCircle, Monitor,
  Newspaper, Package, Palette, Pencil, Phone, Play, Plus, QrCode, Quote, Rocket, Save, Search, Settings,
  ShieldCheck, Smartphone, Sparkles, Star, Tablet, Trash2, TrendingUp, Upload, Users, XCircle,
  Youtube,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { api } from "@/lib/api-client";
import { useApp } from "@/store/app-store";
import type { BusinessWithMeta, DashboardTab } from "@/store/app-store";
import { computeHealth } from "@/lib/health";
import { DEFAULT_THEME, SECTION_LIBRARY } from "@/lib/sections";
import { BRAND_PALETTES } from "@/lib/palettes";
import { isValidUpiId, upiDeepLink, youtubeId } from "@/lib/site-utils";
import QRCode from "react-qr-code";
import type {
  AnalyticsSummary, BlogPost, Business, Faq, GalleryItem, Lead,
  LeadStatus, Plan, Product, Service, SitePayload, SiteSection, SiteTheme, Testimonial, WebsiteData,
} from "@/lib/types";
import SiteRenderer from "@/components/site/site-renderer";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

/* ---------------------------------- style ---------------------------------- */

const SCROLL_CSS = `
.ws-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
.ws-scroll::-webkit-scrollbar-track { background: transparent; }
.ws-scroll::-webkit-scrollbar-thumb { background: #d4d4d8; border-radius: 999px; }
.ws-scroll::-webkit-scrollbar-thumb:hover { background: #a1a1aa; }
.ws-scroll { scrollbar-width: thin; scrollbar-color: #d4d4d8 transparent; }
`;

/* --------------------------------- helpers --------------------------------- */

type Rec = Record<string, unknown>;

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong. Please try again.";
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function rupee(n: number): string {
  return `₹${Number(n || 0).toLocaleString("en-IN")}`;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 120);
}

function daysUntil(iso: string | null | undefined): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** Small data-fetching hook */
function useFetch<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const run = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fn());
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, deps);
  useEffect(() => {
    void run();
  }, [run]);
  return { data, loading, error, refetch: run };
}

/* ------------------------------ shared widgets ------------------------------ */

function Labeled({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-zinc-600">{label}</Label>
      {children}
      {hint ? <p className="text-[11px] text-zinc-400">{hint}</p> : null}
    </div>
  );
}

function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-zinc-900 md:text-2xl">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tint = "emerald" }: {
  icon: LucideIcon; label: string; value: string | number; tint?: "emerald" | "amber" | "zinc";
}) {
  const tints: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    zinc: "bg-zinc-100 text-zinc-600",
  };
  return (
    <Card className="rounded-2xl p-4">
      <div className="flex items-center gap-3">
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", tints[tint])}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-zinc-500">{label}</p>
          <p className="text-lg font-bold text-zinc-900">{value}</p>
        </div>
      </div>
    </Card>
  );
}

function EmptyState({ icon: Icon, title, hint, action }: {
  icon: LucideIcon; title: string; hint?: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed bg-zinc-50/60 px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-zinc-400 shadow-sm">
        <Icon className="h-6 w-6" />
      </span>
      <p className="text-sm font-semibold text-zinc-700">{title}</p>
      {hint ? <p className="max-w-sm text-xs text-zinc-500">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

function LoadingRows({ n = 3 }: { n?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: n }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-2xl" />
      ))}
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const r = 52;
  const c = 2 * Math.PI * r;
  const color = pct >= 80 ? "#059669" : pct >= 50 ? "#d97706" : "#dc2626";
  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg viewBox="0 0 120 120" className="h-32 w-32 -rotate-90" role="img" aria-label={`Website health score ${score} out of 100`}>
        <circle cx="60" cy="60" r={r} fill="none" stroke="#e4e4e7" strokeWidth="10" />
        <circle
          cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-zinc-900">{score}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">/ 100</span>
      </div>
    </div>
  );
}

function DeleteConfirm({ onConfirm, label, disabled }: { onConfirm: () => void; label: string; disabled?: boolean }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-red-600" disabled={disabled} aria-label="Delete">
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete item?</AlertDialogTitle>
          <AlertDialogDescription>{label} This action cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-red-600 text-white hover:bg-red-700">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const LEAD_STATUS_STYLE: Record<string, string> = {
  NEW: "bg-emerald-100 text-emerald-700 border-emerald-200",
  CONTACTED: "bg-zinc-100 text-zinc-700 border-zinc-200",
  FOLLOW_UP: "bg-amber-100 text-amber-800 border-amber-200",
  QUALIFIED: "bg-amber-100 text-amber-800 border-amber-200",
  CONVERTED: "bg-emerald-100 text-emerald-700 border-emerald-200",
  CLOSED: "bg-zinc-100 text-zinc-500 border-zinc-200",
  SPAM: "bg-red-100 text-red-700 border-red-200",
};

function SubStatusBadge({ status }: { status: string }) {
  if (status === "ACTIVE") {
    return <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700">Active</Badge>;
  }
  if (status === "TRIALING") {
    return <Badge className="border-amber-200 bg-amber-100 text-amber-800">Trial</Badge>;
  }
  if (status === "PAST_DUE") {
    return <Badge className="border-red-200 bg-red-100 text-red-700">Past due</Badge>;
  }
  return <Badge variant="outline">{status}</Badge>;
}

/* --------------------------------- nav config -------------------------------- */

interface NavItem { tab: DashboardTab; label: string; icon: LucideIcon }
const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Website",
    items: [
      { tab: "overview", label: "Overview", icon: LayoutDashboard },
      { tab: "builder", label: "Website Builder", icon: Globe },
      { tab: "business", label: "Business Profile", icon: Building2 },
      { tab: "seo", label: "SEO", icon: Search },
    ],
  },
  {
    section: "Content",
    items: [
      { tab: "services", label: "Services", icon: Briefcase },
      { tab: "products", label: "Products", icon: Package },
      { tab: "gallery", label: "Gallery", icon: ImageIcon },
      { tab: "testimonials", label: "Testimonials", icon: Quote },
      { tab: "faqs", label: "FAQs", icon: HelpCircle },
      { tab: "blog", label: "Blog", icon: Newspaper },
    ],
  },
  {
    section: "Grow",
    items: [
      { tab: "leads", label: "Leads", icon: Inbox },
      { tab: "analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    section: "Account",
    items: [
      { tab: "subscription", label: "Subscription", icon: CreditCard },
      { tab: "settings", label: "Settings", icon: Settings },
    ],
  },
];

const SECTION_ICONS: Record<string, LucideIcon> = {
  "layout-template": LayoutTemplate,
  info: Info,
  "chart-bar": BarChart3,
  briefcase: Briefcase,
  package: Package,
  star: Star,
  image: ImageIcon,
  quote: Quote,
  "help-circle": HelpCircle,
  phone: Phone,
  clock: Clock,
  "map-pin": MapPin,
};

function BizStatusBadge({ status }: { status: string }) {
  if (status === "PUBLISHED") {
    return <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700">Published</Badge>;
  }
  if (status === "DRAFT") {
    return <Badge className="border-amber-200 bg-amber-100 text-amber-800">Draft</Badge>;
  }
  return <Badge variant="outline">{status}</Badge>;
}

function NavList({
  tab, onNavigate, newLeads,
}: { tab: DashboardTab; onNavigate?: () => void; newLeads: number }) {
  const setDashboardTab = useApp((s) => s.setDashboardTab);
  return (
    <nav aria-label="Dashboard navigation" className="flex-1 space-y-4 overflow-y-auto px-3 py-3 ws-scroll">
      {NAV.map((group) => (
        <div key={group.section}>
          <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-zinc-400">{group.section}</p>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const active = tab === item.tab;
              return (
                <button
                  key={item.tab}
                  type="button"
                  onClick={() => {
                    setDashboardTab(item.tab);
                    onNavigate?.();
                  }}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition",
                    active
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900",
                  )}
                >
                  <item.icon className={cn("h-4 w-4 shrink-0", active ? "text-white" : "text-zinc-400")} />
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.tab === "leads" && newLeads > 0 ? (
                    <span
                      className={cn(
                        "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold",
                        active ? "bg-white/20 text-white" : "bg-emerald-600 text-white",
                      )}
                    >
                      {newLeads}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

/* ----------------------------- notification bell ----------------------------- */

interface NotificationItem {
  id: string; title: string; body: string; read: boolean; createdAt: string;
}

function NotificationBell({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const setUnreadStore = useApp((s) => s.setUnread);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<{ notifications: NotificationItem[]; unread: number }>("/api/notifications");
      setItems(d.notifications);
      setUnread(d.unread);
      setUnreadStore(d.unread);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [setUnreadStore]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markAllRead() {
    try {
      await api.patch("/api/notifications", {});
      await load();
      toast({ title: "All notifications marked as read" });
    } catch (e) {
      toast({ title: "Could not update notifications", description: errMsg(e), variant: "destructive" });
    }
  }

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) void load(); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
          className={cn(
            "relative flex h-9 w-9 items-center justify-center rounded-xl text-zinc-500 transition hover:bg-zinc-200/60 hover:text-zinc-800",
            className,
          )}
        >
          <Bell className="h-4.5 w-4.5" />
          {unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 rounded-2xl p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold text-zinc-900">Notifications</p>
          {unread > 0 ? (
            <Button variant="ghost" size="sm" className="h-7 text-xs text-emerald-700 hover:text-emerald-800" onClick={markAllRead}>
              Mark all read
            </Button>
          ) : null}
        </div>
        <div className="ws-scroll max-h-96 overflow-y-auto">
          {loading && items.length === 0 ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-zinc-400">No notifications yet</p>
          ) : (
            items.map((n) => (
              <div key={n.id} className={cn("flex gap-3 border-b px-4 py-3 last:border-b-0", !n.read && "bg-emerald-50/50")}>
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read ? "bg-zinc-200" : "bg-emerald-500")} />
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-snug text-zinc-800">{n.title}</p>
                  {n.body ? <p className="mt-0.5 text-xs leading-snug text-zinc-500">{n.body}</p> : null}
                  <p className="mt-1 text-[10px] text-zinc-400">{timeAgo(n.createdAt)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ================================ main view ================================= */

interface ContentState {
  services: Service[]; products: Product[]; gallery: GalleryItem[];
  testimonials: Testimonial[]; faqs: Faq[]; blog: BlogPost[];
}
const EMPTY_CONTENT: ContentState = {
  services: [], products: [], gallery: [], testimonials: [], faqs: [], blog: [],
};

export default function DashboardView() {
  const business = useApp((s) => s.business);
  const tab = useApp((s) => s.dashboardTab);
  const user = useApp((s) => s.user);
  const logout = useApp((s) => s.logout);
  const openSite = useApp((s) => s.openSite);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [content, setContent] = useState<ContentState>(EMPTY_CONTENT);
  const [contentLoading, setContentLoading] = useState(true);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(true);

  const refetchContent = useCallback(async (type: keyof ContentState) => {
    try {
      const map: Record<keyof ContentState, unknown> = {
        services: await api.get<Service[]>(`/api/content/services`),
        products: await api.get<Product[]>(`/api/content/products`),
        gallery: await api.get<GalleryItem[]>(`/api/content/gallery`),
        testimonials: await api.get<Testimonial[]>(`/api/content/testimonials`),
        faqs: await api.get<Faq[]>(`/api/content/faqs`),
        blog: await api.get<BlogPost[]>(`/api/content/blog`),
      };
      setContent((c) => ({ ...c, [type]: map[type] }) as ContentState);
    } catch (e) {
      toast({ title: "Could not refresh content", description: errMsg(e), variant: "destructive" });
    }
  }, []);

  const refetchLeads = useCallback(async () => {
    setLeadsLoading(true);
    try {
      setLeads(await api.get<Lead[]>("/api/leads"));
    } catch {
      /* silent — tab shows empty state */
    } finally {
      setLeadsLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      setContentLoading(true);
      try {
        const [services, products, gallery, testimonials, faqs, blog] = await Promise.all([
          api.get<Service[]>("/api/content/services").catch(() => []),
          api.get<Product[]>("/api/content/products").catch(() => []),
          api.get<GalleryItem[]>("/api/content/gallery").catch(() => []),
          api.get<Testimonial[]>("/api/content/testimonials").catch(() => []),
          api.get<Faq[]>("/api/content/faqs").catch(() => []),
          api.get<BlogPost[]>("/api/content/blog").catch(() => []),
        ]);
        setContent({ services, products, gallery, testimonials, faqs, blog });
      } finally {
        setContentLoading(false);
      }
    })();
    void refetchLeads();
  }, [refetchLeads]);

  const newLeads = useMemo(() => leads.filter((l) => l.status === "NEW").length, [leads]);

  function applyLeadUpdate(updated: Lead) {
    setLeads((ls) => ls.map((l) => (l.id === updated.id ? updated : l)));
  }
  function applyLeadDelete(id: string) {
    setLeads((ls) => ls.filter((l) => l.id !== id));
  }

  if (!business) return null;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-100/70">
      <style>{SCROLL_CSS}</style>
      <div className="flex flex-1">
        {/* ---------- Desktop sidebar ---------- */}
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-zinc-50 lg:flex">
          <a href="#/" className="flex items-center gap-2 px-5 pb-2 pt-5" aria-label="WebSetu home">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-600 text-base font-bold text-white">W</span>
            <span className="text-lg font-bold tracking-tight text-zinc-900">WebSetu</span>
          </a>
          <BusinessCard business={business} />
          <NavList tab={tab} newLeads={newLeads} />
          <div className="space-y-2 border-t bg-zinc-50 p-3">
            <Button
              className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700"
              onClick={() => openSite(business.slug, "dashboard")}
            >
              <ExternalLink className="h-4 w-4" /> View Website
            </Button>
            <div className="flex items-center justify-between pt-1">
              <NotificationBell />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-1.5 text-left transition hover:bg-zinc-200/60"
                    aria-label="Account menu"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-800">
                      {(user?.name || "U").charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-zinc-800">{user?.name}</span>
                      <span className="block truncate text-[10px] text-zinc-400">{user?.email}</span>
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  <DropdownMenuLabel className="text-xs text-zinc-500">{user?.email}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => useApp.getState().setDashboardTab("settings")}>
                    <Settings className="h-4 w-4" /> Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={logout} className="text-red-600 focus:text-red-700">
                    <LogOut className="h-4 w-4" /> Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </aside>

        {/* ---------- Main column ---------- */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile topbar */}
          <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-white px-3 lg:hidden">
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="Open menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetHeader className="border-b p-4 text-left">
                  <SheetTitle>
                    <a href="#/" className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-sm font-bold text-white">W</span>
                      WebSetu
                    </a>
                  </SheetTitle>
                </SheetHeader>
                <div className="flex h-[calc(100%-4rem)] flex-col">
                  <NavList tab={tab} newLeads={newLeads} onNavigate={() => setSheetOpen(false)} />
                  <div className="space-y-2 border-t p-3">
                    <Button
                      className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => { setSheetOpen(false); openSite(business.slug, "dashboard"); }}
                    >
                      <ExternalLink className="h-4 w-4" /> View Website
                    </Button>
                    <Button variant="outline" className="w-full rounded-xl text-red-600 hover:text-red-700" onClick={logout}>
                      <LogOut className="h-4 w-4" /> Log out
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
            <a href="#/" className="flex items-center gap-2" aria-label="WebSetu home">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-sm font-bold text-white">W</span>
              <span className="font-bold tracking-tight text-zinc-900">WebSetu</span>
            </a>
            <span className="flex-1" />
            <NotificationBell />
          </header>

          {/* Mobile horizontal tab strip */}
          <div className="ws-scroll sticky top-14 z-30 flex gap-1 overflow-x-auto border-b bg-white px-3 py-2 lg:hidden">
            {NAV.flatMap((g) => g.items).map((item) => (
              <button
                key={item.tab}
                type="button"
                onClick={() => useApp.getState().setDashboardTab(item.tab)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition",
                  tab === item.tab ? "bg-emerald-600 text-white" : "bg-zinc-100 text-zinc-600",
                )}
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
                {item.tab === "leads" && newLeads > 0 ? (
                  <span className={cn("rounded-full px-1.5 text-[10px] font-bold", tab === item.tab ? "bg-white/20" : "bg-emerald-600 text-white")}>
                    {newLeads}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <main className="mx-auto w-full max-w-[1400px] flex-1 p-4 md:p-6">
            {tab === "overview" && <OverviewTab business={business} content={content} contentLoading={contentLoading} />}
            {tab === "builder" && <BuilderTab business={business} content={content} />}
            {tab === "business" && <BusinessTab business={business} />}
            {tab === "seo" && <SeoTab business={business} content={content} />}
            {tab === "services" && <ContentTab type="services" rows={content.services as unknown as Rec[]} loading={contentLoading} refetch={() => refetchContent("services")} />}
            {tab === "products" && <ContentTab type="products" rows={content.products as unknown as Rec[]} loading={contentLoading} refetch={() => refetchContent("products")} />}
            {tab === "gallery" && <ContentTab type="gallery" rows={content.gallery as unknown as Rec[]} loading={contentLoading} refetch={() => refetchContent("gallery")} />}
            {tab === "testimonials" && <ContentTab type="testimonials" rows={content.testimonials as unknown as Rec[]} loading={contentLoading} refetch={() => refetchContent("testimonials")} />}
            {tab === "faqs" && <ContentTab type="faqs" rows={content.faqs as unknown as Rec[]} loading={contentLoading} refetch={() => refetchContent("faqs")} />}
            {tab === "blog" && <ContentTab type="blog" rows={content.blog as unknown as Rec[]} loading={contentLoading} refetch={() => refetchContent("blog")} />}
            {tab === "leads" && (
              <LeadsTab leads={leads} loading={leadsLoading} refetch={refetchLeads} onApply={applyLeadUpdate} onDelete={applyLeadDelete} />
            )}
            {tab === "analytics" && <AnalyticsTab />}
            {tab === "subscription" && <SubscriptionTab business={business} servicesCount={content.services.length} />}
            {tab === "settings" && <SettingsTab />}
          </main>

          {/* Footer strip */}
          <footer className="mt-auto border-t bg-white px-4 py-3">
            <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
              <p>© {new Date().getFullYear()} WebSetu — your business, online in minutes.</p>
              <p className="flex items-center gap-1.5">
                <span className={cn("h-1.5 w-1.5 rounded-full", business.status === "PUBLISHED" ? "bg-emerald-500" : "bg-amber-500")} />
                {business.status === "PUBLISHED" ? "Site live" : "Site is a draft"} ·
                <button type="button" className="font-medium text-emerald-700 hover:underline" onClick={() => openSite(business.slug, "dashboard")}>
                  {business.slug}.websetu.in
                </button>
              </p>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

function BusinessCard({ business }: { business: BusinessWithMeta }) {
  const sub = business.subscription;
  return (
    <div className="mx-3 mt-2 flex items-center gap-3 rounded-2xl border bg-white p-3 shadow-sm">
      {business.logoUrl ? (
        <img src={business.logoUrl} alt={`${business.name} logo`} className="h-10 w-10 rounded-xl object-cover" />
      ) : (
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base font-bold text-white"
          style={{ background: `linear-gradient(135deg, ${business.brandPrimary}, ${business.brandSecondary})` }}
        >
          {business.name.charAt(0)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-zinc-900">{business.name}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <BizStatusBadge status={business.status} />
          {sub?.status === "TRIALING" ? (
            <Badge className="border-amber-200 bg-amber-100 text-amber-800">{daysUntil(sub.trialEndsAt)}d trial</Badge>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ================================ 1. OVERVIEW =============================== */

function OverviewTab({ business, content, contentLoading }: {
  business: BusinessWithMeta; content: ContentState; contentLoading: boolean;
}) {
  const setDashboardTab = useApp((s) => s.setDashboardTab);
  const openSite = useApp((s) => s.openSite);
  const { data: summary } = useFetch<AnalyticsSummary>(() => api.get<AnalyticsSummary>("/api/analytics/summary"), []);

  const counts = useMemo(
    () => ({
      services: content.services.length, products: content.products.length, gallery: content.gallery.length,
      testimonials: content.testimonials.length, faqs: content.faqs.length, blogPosts: content.blog.length,
    }),
    [content],
  );
  const health = useMemo(() => computeHealth(business, business.website ?? null, counts), [business, counts]);
  const ringColor = health.score >= 80 ? "text-emerald-600" : health.score >= 50 ? "text-amber-600" : "text-red-600";

  const plans = useApp((s) => s.plans);
  const sub = business.subscription;
  const planName = sub?.plan?.name ?? plans.find((p) => p.id === sub?.planId)?.name ?? "Free Trial";

  const quickActions: { label: string; icon: LucideIcon; tab: DashboardTab | "site" }[] = [
    { label: "Edit Website", icon: Globe, tab: "builder" },
    { label: "Add Service", icon: Briefcase, tab: "services" },
    { label: "Add Product", icon: Package, tab: "products" },
    { label: "View Leads", icon: Inbox, tab: "leads" },
    { label: "Edit SEO", icon: Search, tab: "seo" },
    { label: "View Website", icon: ExternalLink, tab: "site" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Namaste, ${business.ownerName || business.name} 👋`}
        subtitle="Here is how your website is performing and what to improve next."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Health card */}
        <Card className="rounded-2xl p-6 lg:col-span-2">
          <div className="flex flex-col items-start gap-6 sm:flex-row">
            <div className="flex flex-col items-center gap-2">
              {contentLoading ? <Skeleton className="h-32 w-32 rounded-full" /> : <ScoreRing score={health.score} />}
              <p className={cn("text-xs font-bold uppercase tracking-wider", ringColor)}>
                {health.score >= 80 ? "Great" : health.score >= 50 ? "Needs work" : "At risk"}
              </p>
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-bold text-zinc-900">Website Health</h2>
              <p className="text-xs text-zinc-500">Scored across content, contactability, SEO &amp; trust signals.</p>
              <ul className="ws-scroll mt-3 max-h-40 space-y-2 overflow-y-auto pr-1">
                {health.recommendations.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-zinc-700">
                    {health.score >= 80 && i === 0 ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    )}
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
              <Button size="sm" className="mt-3 rounded-xl bg-emerald-600 hover:bg-emerald-700" onClick={() => setDashboardTab("builder")}>
                Open Website Builder
              </Button>
            </div>
          </div>
        </Card>

        {/* Subscription mini-card */}
        <Card className="rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-zinc-900">Subscription</h2>
            {sub ? <SubStatusBadge status={sub.status} /> : <Badge variant="outline">No plan</Badge>}
          </div>
          <p className="mt-3 text-2xl font-bold text-zinc-900">{planName}</p>
          {sub?.status === "TRIALING" ? (
            <p className="mt-1 text-sm text-amber-700">
              Trial ends in <span className="font-bold">{daysUntil(sub.trialEndsAt)} days</span> ({fmtDate(sub.trialEndsAt)})
            </p>
          ) : sub?.status === "ACTIVE" ? (
            <p className="mt-1 text-sm text-zinc-500">Renews on {fmtDate(sub.renewsAt)} · {rupee(sub.amount)}/{sub.cycle === "YEARLY" ? "yr" : "mo"}</p>
          ) : (
            <p className="mt-1 text-sm text-zinc-500">Choose a plan to keep your site live.</p>
          )}
          <Button
            className="mt-4 w-full rounded-xl bg-amber-500 text-white hover:bg-amber-600"
            onClick={() => setDashboardTab("subscription")}
          >
            <Sparkles className="h-4 w-4" /> {sub?.status === "TRIALING" ? "Upgrade now" : "Manage plan"}
          </Button>
        </Card>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Users} label="Visitors (30d)" value={summary ? summary.visits : "—"} />
        <StatCard icon={Inbox} label="Leads (30d)" value={summary ? summary.leads : "—"} tint="amber" />
        <StatCard icon={MessageCircle} label="WhatsApp clicks" value={summary ? summary.ctaWhatsapp : "—"} />
        <StatCard icon={Phone} label="Calls clicked" value={summary ? summary.ctaCalls : "—"} tint="amber" />
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-zinc-400">Quick actions</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {quickActions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => (a.tab === "site" ? openSite(business.slug, "dashboard") : setDashboardTab(a.tab as DashboardTab))}
              className="flex flex-col items-center gap-2 rounded-2xl border bg-white p-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <a.icon className="h-5 w-5" />
              </span>
              <span className="text-xs font-semibold text-zinc-700">{a.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ================================ 2. BUILDER ================================ */

function defaultSectionContent(type: string, name: string): Rec {
  switch (type) {
    case "hero":
      return { badge: "", heading: "", subheading: "", ctaPrimary: "Get a Free Quote", ctaSecondary: "Call Now", image: "" };
    case "about":
      return { title: "About Us", body: "" };
    case "stats":
      return {
        items: [
          { value: "10+", label: "Years Experience" },
          { value: "500+", label: "Happy Customers" },
          { value: "1000+", label: "Projects Done" },
          { value: "24/7", label: "Support" },
        ],
      };
    case "whyUs":
      return {
        title: "Why Choose Us",
        items: [
          { title: "Experienced Team", description: "Skilled professionals with years of hands-on expertise." },
          { title: "Fair Pricing", description: "Transparent quotes with no hidden charges." },
        ],
      };
    case "faq":
      return { title: "Frequently Asked Questions", items: [] };
    case "cta":
      return { title: "Ready to get started?", subtitle: "Call, WhatsApp or send an enquiry — we respond fast.", primary: "Call Now", secondary: "WhatsApp Us" };
    case "payment":
      return {
        title: "Scan & Pay",
        subtitle: "Pay securely via UPI — scan the QR or tap the button below.",
        note: "After payment, share the screenshot on WhatsApp for confirmation.",
      };
    case "contact":
      return { title: "Contact Us", subtitle: "Send an enquiry and we will get back to you within 24 hours.", mapUrl: "" };
    case "hours":
      return { title: "Business Hours" };
    default:
      return { title: name, subtitle: "" };
  }
}

function BuilderTab({ business, content }: { business: BusinessWithMeta; content: ContentState }) {
  const patchBusiness = useApp((s) => s.patchBusiness);
  const setBusiness = useApp((s) => s.setBusiness);
  const openSite = useApp((s) => s.openSite);
  const website = business.website;

  const [sections, setSections] = useState<SiteSection[]>(website?.sections ?? []);
  const [theme, setTheme] = useState<SiteTheme>({ ...DEFAULT_THEME, ...(website?.theme ?? {}) });
  const [seo, setSeo] = useState({
    seoTitle: website?.seoTitle ?? "",
    seoDescription: website?.seoDescription ?? "",
    keywords: website?.keywords ?? "",
  });
  const [dirty, setDirty] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [saving, setSaving] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // re-sync when store website object is replaced (after save / publish / me refresh)
  useEffect(() => {
    if (!website) return;
    setSections(website.sections || []);
    setTheme({ ...DEFAULT_THEME, ...(website.theme ?? {}) });
    setSeo({
      seoTitle: website.seoTitle ?? "",
      seoDescription: website.seoDescription ?? "",
      keywords: website.keywords ?? "",
    });
    setDirty(false);
  }, [website]);

  const published = business.status === "PUBLISHED";
  const editing = sections.find((s) => s.id === editingId) ?? null;

  const mutate = (fn: (prev: SiteSection[]) => SiteSection[]) => {
    setSections((prev) => fn(prev));
    setDirty(true);
  };

  function toggleVisible(id: string) {
    mutate((prev) => prev.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s)));
  }
  function move(id: string, dir: -1 | 1) {
    mutate((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      const to = idx + dir;
      if (idx < 0 || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [row] = next.splice(idx, 1);
      next.splice(to, 0, row);
      return next;
    });
  }
  function removeSection(id: string) {
    mutate((prev) => prev.filter((s) => s.id !== id));
    if (editingId === id) setEditingId(null);
  }
  function saveSectionContent(id: string, c: Rec) {
    mutate((prev) => prev.map((s) => (s.id === id ? { ...s, content: c } : s)));
    setEditingId(null);
    toast({ title: "Section updated", description: "Remember to Save Draft, then Publish." });
  }
  function addSection(type: string, name: string) {
    const id = `s_${Math.random().toString(36).slice(2, 10)}`;
    mutate((prev) => [...prev, { id, type: type as SiteSection["type"], visible: true, content: defaultSectionContent(type, name) }]);
    toast({ title: `${name} section added`, description: "Edit it to add your content, then Save Draft." });
  }

  async function saveDraft(silent = false): Promise<boolean> {
    setSaving(true);
    try {
      const w = await api.put<WebsiteData>("/api/website", {
        sections, theme,
        seoTitle: seo.seoTitle, seoDescription: seo.seoDescription, keywords: seo.keywords,
      });
      patchBusiness({ website: w });
      setDirty(false);
      if (!silent) {
        toast({ title: "Draft saved", description: "Changes are saved. Publish to make them live." });
      }
      return true;
    } catch (e) {
      toast({ title: "Could not save draft", description: errMsg(e), variant: "destructive" });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function refreshMe() {
    try {
      const me = await api.get<{ business: BusinessWithMeta | null }>("/api/auth/me");
      if (me.business) setBusiness(me.business);
    } catch {
      /* ignore */
    }
  }

  async function publish() {
    setPublishing(true);
    try {
      const saved = await saveDraft(true);
      if (!saved) return;
      await api.post("/api/website/publish");
      toast({ title: "Website published 🎉", description: `Your site is live at ${business.slug}.websetu.in — share it with customers!` });
      setPublishOpen(false);
      await refreshMe();
    } catch (e) {
      toast({ title: "Cannot publish yet", description: errMsg(e), variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  }

  async function unpublish() {
    try {
      await api.post("/api/website/publish", { unpublish: true });
      toast({ title: "Website unpublished", description: "Your site is now a draft and hidden from visitors." });
      await refreshMe();
    } catch (e) {
      toast({ title: "Could not unpublish", description: errMsg(e), variant: "destructive" });
    }
  }

  // brand color updates: instant store patch (live preview) + debounced API save
  const brandTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function updateBrand(key: "brandPrimary" | "brandSecondary" | "brandAccent", value: string) {
    patchBusiness({ [key]: value });
    if (brandTimer.current) clearTimeout(brandTimer.current);
    brandTimer.current = setTimeout(() => {
      const b = useApp.getState().business;
      if (!b) return;
      api.put("/api/business", { brandPrimary: b.brandPrimary, brandSecondary: b.brandSecondary, brandAccent: b.brandAccent })
        .then(() => toast({ title: "Brand colors saved" }))
        .catch(() => {});
    }, 800);
  }

  const payload: SitePayload = useMemo(() => ({
    business,
    website: {
      seoTitle: seo.seoTitle,
      seoDescription: seo.seoDescription,
      keywords: seo.keywords,
      ogImage: website?.ogImage ?? "",
      theme,
      sections,
      version: website?.version ?? 0,
      publishedAt: website?.publishedAt ?? null,
    },
    services: content.services,
    products: content.products,
    gallery: content.gallery,
    testimonials: content.testimonials,
    faqs: content.faqs,
    blogPosts: content.blog
      .filter((p) => p.published)
      .map(({ id, title, slug, excerpt, cover, publishedAt }) => ({ id, title, slug, excerpt, cover, publishedAt })),
    subscriptionStatus: business.subscription?.status ?? "TRIALING",
    trialMode: business.subscription?.status === "TRIALING",
  }), [business, website, seo, theme, sections, content]);

  if (!website) {
    return (
      <Alert className="rounded-2xl border-amber-200 bg-amber-50">
        <AlertCircle className="h-4 w-4 text-amber-600" />
        <AlertTitle>No website found</AlertTitle>
        <AlertDescription>Complete onboarding to generate your website first.</AlertDescription>
      </Alert>
    );
  }

  const presentTypes = new Set(sections.map((s) => s.type));
  const addable = SECTION_LIBRARY.filter((l) => !presentTypes.has(l.type));

  return (
    <div className="space-y-4">
      {/* Builder top bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-white p-3 shadow-sm">
        <div className="flex items-center gap-1 rounded-xl bg-zinc-100 p-1">
          {([
            { d: "desktop" as const, icon: Monitor, label: "Desktop preview" },
            { d: "tablet" as const, icon: Tablet, label: "Tablet preview" },
            { d: "mobile" as const, icon: Smartphone, label: "Mobile preview" },
          ]).map((x) => (
            <button
              key={x.d}
              type="button"
              aria-label={x.label}
              aria-pressed={device === x.d}
              onClick={() => setDevice(x.d)}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg transition",
                device === x.d ? "bg-white text-emerald-700 shadow-sm" : "text-zinc-500 hover:text-zinc-800",
              )}
            >
              <x.icon className="h-4 w-4" />
            </button>
          ))}
        </div>
        {dirty ? (
          <span className="flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Unsaved changes
          </span>
        ) : (
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> All changes saved
          </span>
        )}
        <span className="flex-1" />
        {published ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="rounded-xl border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Live <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => void publish()} disabled={publishing}>
                <Rocket className="h-4 w-4" /> {dirty ? "Publish changes" : "Re-publish"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openSite(business.slug, "dashboard")}>
                <ExternalLink className="h-4 w-4" /> View live site
              </DropdownMenuItem>
              <DropdownMenuItem onClick={unpublish} className="text-red-600 focus:text-red-700">
                <EyeOff className="h-4 w-4" /> Unpublish
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <AlertDialog open={publishOpen} onOpenChange={setPublishOpen}>
            <AlertDialogTrigger asChild>
              <Button className="rounded-xl bg-emerald-600 hover:bg-emerald-700" disabled={publishing}>
                {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />} Publish
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Publish your website?</AlertDialogTitle>
                <AlertDialogDescription>
                  We will run quick checks (phone, address, SEO title, sections) and make your site live at{" "}
                  <span className="font-semibold text-zinc-800">{business.slug}.websetu.in</span>. Unsaved edits are saved first.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Not yet</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => { e.preventDefault(); void publish(); }}
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />} Publish now
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        <Button variant="outline" className="rounded-xl" onClick={() => void saveDraft()} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Draft
        </Button>
      </div>

      {/* 3-pane body */}
      <div className="grid items-start gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4">
          {editing ? (
            <SectionEditor
              key={editing.id}
              section={editing}
              onSave={(c) => saveSectionContent(editing.id, c)}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <>
              <ThemePanel theme={theme} setTheme={(t) => { setTheme(t); setDirty(true); }} onUpdateBrand={updateBrand} business={business} />
              <Card className="rounded-2xl p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-zinc-900">Sections</h2>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" className="rounded-lg bg-emerald-600 hover:bg-emerald-700" disabled={addable.length === 0}>
                        <Plus className="h-4 w-4" /> Add section
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64">
                      {addable.map((l) => (
                        <DropdownMenuItem key={l.type} onClick={() => addSection(l.type, l.name)}>
                          <Plus className="h-4 w-4" />
                          <div>
                            <p className="text-sm font-medium">{l.name}</p>
                            <p className="text-xs text-zinc-400">{l.description}</p>
                          </div>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="ws-scroll max-h-96 space-y-2 overflow-y-auto pr-1">
                  {sections.map((s, idx) => {
                    const lib = SECTION_LIBRARY.find((l) => l.type === s.type);
                    const Icon = SECTION_ICONS[lib?.icon ?? ""] ?? Info;
                    return (
                      <div
                        key={s.id}
                        className={cn(
                          "flex items-center gap-2 rounded-xl border bg-white p-2.5 transition",
                          s.visible ? "border-zinc-200" : "border-dashed border-zinc-300 opacity-70",
                        )}
                      >
                        <GripVertical className="h-4 w-4 shrink-0 text-zinc-300" />
                        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", s.visible ? "bg-emerald-50 text-emerald-600" : "bg-zinc-100 text-zinc-400")}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-zinc-800">{lib?.name ?? s.type}</p>
                          <p className="truncate text-[11px] text-zinc-400">{lib?.description ?? ""}</p>
                        </div>
                        <Switch
                          checked={s.visible}
                          onCheckedChange={() => toggleVisible(s.id)}
                          aria-label={`Toggle ${lib?.name ?? s.type} visibility`}
                        />
                        <div className="flex flex-col">
                          <button
                            type="button" aria-label="Move up" disabled={idx === 0}
                            onClick={() => move(s.id, -1)}
                            className="flex h-4 w-5 items-center justify-center rounded text-zinc-400 hover:text-zinc-700 disabled:opacity-30"
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button" aria-label="Move down" disabled={idx === sections.length - 1}
                            onClick={() => move(s.id, 1)}
                            className="flex h-4 w-5 items-center justify-center rounded text-zinc-400 hover:text-zinc-700 disabled:opacity-30"
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-emerald-700" onClick={() => setEditingId(s.id)} aria-label={`Edit ${lib?.name ?? s.type}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {s.type !== "hero" ? (
                          <DeleteConfirm
                            label={`The "${lib?.name ?? s.type}" section will be removed from your page.`}
                            onConfirm={() => removeSection(s.id)}
                          />
                        ) : (
                          <span className="w-8" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
              <SeoCard seo={seo} setSeo={(s) => { setSeo(s); setDirty(true); }} />
            </>
          )}
        </div>

        {/* Preview pane */}
        <div className="rounded-2xl border bg-zinc-100 p-3 md:p-4">
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Live preview</p>
            <Badge variant="outline" className="bg-white text-zinc-500">{device}</Badge>
          </div>
          <div
            className={cn(
              "mx-auto overflow-hidden rounded-xl border bg-white shadow-sm",
              device === "mobile" ? "max-w-[420px]" : device === "tablet" ? "max-w-[820px]" : "w-full",
            )}
          >
            <div className="ws-scroll h-[600px] overflow-y-auto">
              <SiteRenderer payload={payload} mode="preview" device={device} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- theme panel -------------------------------- */

function ThemePanel({ theme, setTheme, onUpdateBrand, business }: {
  theme: SiteTheme;
  setTheme: (t: SiteTheme) => void;
  onUpdateBrand: (key: "brandPrimary" | "brandSecondary" | "brandAccent", value: string) => void;
  business: BusinessWithMeta;
}) {
  const [open, setOpen] = useState(false);
  const set = (k: keyof SiteTheme, v: string) => setTheme({ ...theme, [k]: v } as SiteTheme);

  // active palette = one whose colors match the current brand colors exactly
  const activePalette = BRAND_PALETTES.find(
    (p) =>
      p.colors[0].toLowerCase() === (business.brandPrimary || "").toLowerCase() &&
      p.colors[1].toLowerCase() === (business.brandSecondary || "").toLowerCase() &&
      p.colors[2].toLowerCase() === (business.brandAccent || "").toLowerCase(),
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="rounded-2xl p-4">
        <CollapsibleTrigger asChild>
          <button type="button" className="flex w-full items-center justify-between" aria-expanded={open}>
            <span className="flex items-center gap-2 text-sm font-bold text-zinc-900">
              <Sparkles className="h-4 w-4 text-amber-500" /> Theme &amp; Branding
            </span>
            <ChevronDown className={cn("h-4 w-4 text-zinc-400 transition-transform", open && "rotate-180")} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Labeled label="Font">
              <Select value={theme.font} onValueChange={(v) => set("font", v)}>
                <SelectTrigger className="w-full rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="modern">Modern</SelectItem>
                  <SelectItem value="classic">Classic</SelectItem>
                  <SelectItem value="elegant">Elegant</SelectItem>
                </SelectContent>
              </Select>
            </Labeled>
            <Labeled label="Corners">
              <Select value={theme.radius} onValueChange={(v) => set("radius", v)}>
                <SelectTrigger className="w-full rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sharp">Sharp</SelectItem>
                  <SelectItem value="rounded">Rounded</SelectItem>
                  <SelectItem value="pill">Pill</SelectItem>
                </SelectContent>
              </Select>
            </Labeled>
            <Labeled label="Hero style">
              <Select value={theme.heroStyle} onValueChange={(v) => set("heroStyle", v)}>
                <SelectTrigger className="w-full rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gradient">Gradient</SelectItem>
                  <SelectItem value="image">Image</SelectItem>
                  <SelectItem value="split">Split</SelectItem>
                </SelectContent>
              </Select>
            </Labeled>
            <Labeled label="Cards">
              <Select value={theme.cardStyle} onValueChange={(v) => set("cardStyle", v)}>
                <SelectTrigger className="w-full rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="flat">Flat</SelectItem>
                  <SelectItem value="shadow">Shadow</SelectItem>
                  <SelectItem value="outline">Outline</SelectItem>
                </SelectContent>
              </Select>
            </Labeled>
            <Labeled label="Layout width" >
              <Select value={theme.containerWidth} onValueChange={(v) => set("containerWidth", v)}>
                <SelectTrigger className="w-full rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="wide">Wide</SelectItem>
                </SelectContent>
              </Select>
            </Labeled>
          </div>
          <Separator />
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-zinc-600">
              <Palette className="h-3.5 w-3.5 text-amber-500" /> Color palettes
              {activePalette && (
                <span className="ml-auto rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                  {activePalette.name}
                </span>
              )}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {BRAND_PALETTES.map((p) => {
                const active = activePalette?.name === p.name;
                return (
                  <button
                    key={p.name}
                    type="button"
                    aria-label={`Apply ${p.name} palette`}
                    aria-pressed={active}
                    onClick={() => {
                      onUpdateBrand("brandPrimary", p.colors[0]);
                      onUpdateBrand("brandSecondary", p.colors[1]);
                      onUpdateBrand("brandAccent", p.colors[2]);
                    }}
                    className={cn(
                      "group flex items-center gap-2 rounded-xl border bg-white p-2 text-left transition hover:border-emerald-300 hover:shadow-sm",
                      active ? "border-emerald-500 ring-1 ring-emerald-500" : "border-zinc-200",
                    )}
                  >
                    <span className="flex h-7 w-12 shrink-0 overflow-hidden rounded-md border shadow-sm">
                      <span className="h-full flex-1" style={{ background: p.colors[0] }} />
                      <span className="h-full flex-1" style={{ background: p.colors[1] }} />
                      <span className="h-full flex-1" style={{ background: p.colors[2] }} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[11px] font-semibold text-zinc-800">{p.name}</span>
                      <span className="block truncate text-[10px] text-zinc-400">{p.mood}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-zinc-400">
              One click applies the full palette to your live preview — or fine-tune each color below.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {([
              { key: "brandPrimary" as const, label: "Primary" },
              { key: "brandSecondary" as const, label: "Secondary" },
              { key: "brandAccent" as const, label: "Accent" },
            ]).map((c) => (
              <label key={c.key} className="flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border p-2 transition hover:border-emerald-300">
                <span
                  className="h-8 w-full rounded-lg border"
                  style={{ background: (business[c.key] as string) || "#059669" }}
                />
                <span className="text-[10px] font-medium text-zinc-500">{c.label}</span>
                <input
                  type="color"
                  value={(business[c.key] as string) || "#059669"}
                  onChange={(e) => onUpdateBrand(c.key, e.target.value)}
                  className="sr-only"
                  aria-label={`${c.label} color picker`}
                />
              </label>
            ))}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

/* ------------------------------- SEO editor --------------------------------- */

interface SeoValue { seoTitle: string; seoDescription: string; keywords: string }

function SeoFields({ value, onChange }: { value: SeoValue; onChange: (v: SeoValue) => void }) {
  return (
    <div className="space-y-4">
      <Labeled label="SEO Title" hint={`${value.seoTitle.length}/60 characters — keep your business name + city`}>
        <Input
          value={value.seoTitle}
          maxLength={60}
          onChange={(e) => onChange({ ...value, seoTitle: e.target.value })}
          placeholder="Sharma Electricals — Trusted Electrician in Pune"
          className="rounded-xl"
        />
      </Labeled>
      <Labeled label="Meta Description" hint={`${value.seoDescription.length}/160 characters — this shows in Google results`}>
        <Textarea
          value={value.seoDescription}
          maxLength={160}
          rows={3}
          onChange={(e) => onChange({ ...value, seoDescription: e.target.value })}
          placeholder="24/7 electrician in Pune for wiring, repairs and installations. Call now for a free quote."
          className="rounded-xl"
        />
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-zinc-100">
          <div
            className={cn("h-full transition-all", value.seoDescription.length >= 80 ? "bg-emerald-500" : "bg-amber-500")}
            style={{ width: `${Math.min(100, (value.seoDescription.length / 160) * 100)}%` }}
          />
        </div>
      </Labeled>
      <Labeled label="Keywords" hint="Comma-separated: your category + city combinations">
        <Textarea
          value={value.keywords}
          rows={2}
          onChange={(e) => onChange({ ...value, keywords: e.target.value })}
          placeholder="electrician in pune, wiring repair pune, emergency electrician"
          className="rounded-xl"
        />
      </Labeled>
    </div>
  );
}

function SeoCard({ seo, setSeo }: { seo: SeoValue; setSeo: (v: SeoValue) => void }) {
  return (
    <Card className="rounded-2xl p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-900">
        <Search className="h-4 w-4 text-emerald-600" /> SEO
      </h2>
      <SeoFields value={seo} onChange={setSeo} />
    </Card>
  );
}

/* ----------------------------- section editor ------------------------------- */

function ItemsListEditor({ items, onChange, keys, labels, max = 6 }: {
  items: Rec[]; onChange: (next: Rec[]) => void;
  keys: [string, string]; labels: [string, string]; max?: number;
}) {
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="space-y-2 rounded-xl border bg-zinc-50 p-2.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Item {i + 1}</p>
            <Button
              variant="ghost" size="icon" className="h-6 w-6 text-zinc-400 hover:text-red-600"
              aria-label="Remove item"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Input
            value={String(it[keys[0]] ?? "")}
            placeholder={labels[0]}
            className="rounded-lg bg-white"
            onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, [keys[0]]: e.target.value } : x)))}
          />
          <Input
            value={String(it[keys[1]] ?? "")}
            placeholder={labels[1]}
            className="rounded-lg bg-white"
            onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, [keys[1]]: e.target.value } : x)))}
          />
        </div>
      ))}
      <Button
        variant="outline" size="sm" className="w-full rounded-xl"
        disabled={items.length >= max}
        onClick={() => onChange([...items, { [keys[0]]: "", [keys[1]]: "" }])}
      >
        <Plus className="h-4 w-4" /> Add item {items.length >= max ? `(max ${max})` : ""}
      </Button>
    </div>
  );
}

function SectionEditor({ section, onSave, onCancel }: {
  section: SiteSection;
  onSave: (content: Rec) => void;
  onCancel: () => void;
}) {
  const [c, setC] = useState<Rec>({ ...section.content });
  const set = (k: string, v: unknown) => setC((p) => ({ ...p, [k]: v }));
  const lib = SECTION_LIBRARY.find((l) => l.type === section.type);
  const items = Array.isArray(c.items) ? (c.items as Rec[]) : [];
  const setItems = (next: Rec[]) => set("items", next);

  const strField = (key: string, label: string, placeholder?: string) => (
    <Labeled key={key} label={label}>
      <Input value={String(c[key] ?? "")} placeholder={placeholder} className="rounded-xl" onChange={(e) => set(key, e.target.value)} />
    </Labeled>
  );

  return (
    <Card className="rounded-2xl p-4">
      <div className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onCancel} aria-label="Back to sections">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-sm font-bold text-zinc-900">Edit {lib?.name ?? section.type}</h2>
          <p className="text-[11px] text-zinc-400">{lib?.description}</p>
        </div>
      </div>

      <div className="ws-scroll max-h-[560px] space-y-4 overflow-y-auto pr-1">
        {section.type === "hero" && (
          <>
            {strField("badge", "Badge", "★ Trusted in Pune")}
            {strField("heading", "Heading", "Sharma Electricals")}
            <Labeled label="Subheading">
              <Textarea value={String(c.subheading ?? "")} rows={3} className="rounded-xl" onChange={(e) => set("subheading", e.target.value)} />
            </Labeled>
            {strField("ctaPrimary", "Primary button", "Get a Free Quote")}
            {strField("ctaSecondary", "Secondary button", "Call Now")}
            {strField("image", "Background image URL", "https://…")}
          </>
        )}
        {section.type === "about" && (
          <>
            {strField("title", "Title")}
            <Labeled label="Body">
              <Textarea value={String(c.body ?? "")} rows={6} className="rounded-xl" onChange={(e) => set("body", e.target.value)} />
            </Labeled>
          </>
        )}
        {section.type === "stats" && (
          <ItemsListEditor items={items} onChange={setItems} keys={["value", "label"]} labels={["Value (e.g. 15+)", "Label (e.g. Years Experience)"]} max={6} />
        )}
        {section.type === "whyUs" && (
          <>
            {strField("title", "Title")}
            <ItemsListEditor items={items} onChange={setItems} keys={["title", "description"]} labels={["Title", "Description"]} max={6} />
          </>
        )}
        {section.type === "faq" && (
          <>
            {strField("title", "Title")}
            <ItemsListEditor items={items} onChange={setItems} keys={["question", "answer"]} labels={["Question", "Answer"]} max={12} />
          </>
        )}
        {section.type === "cta" && (
          <>
            {strField("title", "Title")}
            <Labeled label="Subtitle">
              <Textarea value={String(c.subtitle ?? "")} rows={2} className="rounded-xl" onChange={(e) => set("subtitle", e.target.value)} />
            </Labeled>
            {strField("primary", "Primary button")}
            {strField("secondary", "Secondary button")}
          </>
        )}
        {section.type === "payment" && (
          <>
            {strField("title", "Title", "Scan & Pay")}
            <Labeled label="Subtitle">
              <Textarea value={String(c.subtitle ?? "")} rows={2} className="rounded-xl" onChange={(e) => set("subtitle", e.target.value)} />
            </Labeled>
            <Labeled label="Note under the QR">
              <Textarea value={String(c.note ?? "")} rows={2} className="rounded-xl" placeholder="After payment, share the screenshot on WhatsApp…" onChange={(e) => set("note", e.target.value)} />
            </Labeled>
            <Alert className="rounded-xl border-emerald-200 bg-emerald-50">
              <QrCode className="h-4 w-4 text-emerald-600" />
              <AlertTitle className="text-sm text-emerald-900">QR code comes from your business profile</AlertTitle>
              <AlertDescription className="text-xs text-emerald-800">
                Add your UPI ID or upload your QR image in <strong>Business → Payments &amp; QR</strong>. Visitors see this section only after you set that up.
              </AlertDescription>
            </Alert>
          </>
        )}
        {section.type === "contact" && (
          <>
            {strField("title", "Title")}
            <Labeled label="Subtitle">
              <Textarea value={String(c.subtitle ?? "")} rows={2} className="rounded-xl" onChange={(e) => set("subtitle", e.target.value)} />
            </Labeled>
            {strField("mapUrl", "Google Maps embed URL", "https://maps.google.com/…")}
          </>
        )}
        {["services", "products", "gallery", "testimonials", "hours"].includes(section.type) && (
          <>
            {strField("title", "Title")}
            {section.type !== "hours" && strField("subtitle", "Subtitle")}
            {["services", "products", "gallery", "testimonials"].includes(section.type) ? (
              <p className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700">
                Content for this section is managed from the {section.type.charAt(0).toUpperCase() + section.type.slice(1)} tab in the sidebar.
              </p>
            ) : null}
          </>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <Button className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700" onClick={() => onSave(c)}>
          <Save className="h-4 w-4" /> Save section
        </Button>
        <Button variant="outline" className="rounded-xl" onClick={onCancel}>Cancel</Button>
      </div>
    </Card>
  );
}

/* ============================ 3. BUSINESS PROFILE =========================== */

const SOCIAL_FIELDS: { key: keyof Business["socials"]; label: string }[] = [
  { key: "facebook", label: "Facebook URL" },
  { key: "instagram", label: "Instagram URL" },
  { key: "youtube", label: "YouTube URL" },
  { key: "linkedin", label: "LinkedIn URL" },
  { key: "x", label: "X (Twitter) URL" },
  { key: "pinterest", label: "Pinterest URL" },
];

const DAY_KEYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function BusinessTab({ business }: { business: BusinessWithMeta }) {
  const patchBusiness = useApp((s) => s.patchBusiness);
  const [form, setForm] = useState({
    name: business.name, tagline: business.tagline, description: business.description,
    ownerName: business.ownerName, phone: business.phone, whatsapp: business.whatsapp,
    email: business.email, address: business.address, city: business.city, state: business.state,
    pincode: business.pincode, establishedYear: business.establishedYear, gstin: business.gstin,
    logoUrl: business.logoUrl, coverUrl: business.coverUrl, gmbUrl: business.gmbUrl, mapsUrl: business.mapsUrl,
    upiId: business.upiId ?? "", paymentQrUrl: business.paymentQrUrl ?? "",
  });
  const [hours, setHours] = useState<Rec>(() => {
    const stored = (business.hours ?? {}) as Rec;
    return Object.fromEntries(DAY_KEYS.map((d) => [d, String(stored[d] ?? "")]));
  });
  const [socials, setSocials] = useState<Rec>(() => {
    const stored = (business.socials ?? {}) as Rec;
    return Object.fromEntries(SOCIAL_FIELDS.map((f) => [f.key, String(stored[f.key] ?? "")]));
  });
  const [saving, setSaving] = useState(false);

  const setF = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  async function save() {
    setSaving(true);
    try {
      const updated = await api.put<Business>("/api/business", {
        ...form,
        hours: Object.fromEntries(Object.entries(hours).filter(([, v]) => String(v).trim() !== "")),
        socials: Object.fromEntries(Object.entries(socials).filter(([, v]) => String(v).trim() !== "")),
      });
      patchBusiness(updated);
      toast({ title: "Profile saved", description: "Your business details are up to date." });
    } catch (e) {
      toast({ title: "Could not save profile", description: errMsg(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Business Profile" subtitle="These details power your website, Google presence and enquiry forms." />

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Card className="rounded-2xl p-6">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-zinc-400">Business details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Labeled label="Business name"><Input className="rounded-xl" value={form.name} onChange={(e) => setF("name", e.target.value)} /></Labeled>
            <Labeled label="Owner name"><Input className="rounded-xl" value={form.ownerName} onChange={(e) => setF("ownerName", e.target.value)} /></Labeled>
            <div className="sm:col-span-2">
              <Labeled label="Tagline"><Input className="rounded-xl" value={form.tagline} onChange={(e) => setF("tagline", e.target.value)} placeholder="Trusted electricians in Pune since 1998" /></Labeled>
            </div>
            <div className="sm:col-span-2">
              <Labeled label="Description" hint="2–3 lines helps SEO and AI answer engines">
                <Textarea className="rounded-xl" rows={4} value={form.description} onChange={(e) => setF("description", e.target.value)} />
              </Labeled>
            </div>
            <Labeled label="Phone"><Input className="rounded-xl" value={form.phone} onChange={(e) => setF("phone", e.target.value)} /></Labeled>
            <Labeled label="WhatsApp"><Input className="rounded-xl" value={form.whatsapp} onChange={(e) => setF("whatsapp", e.target.value)} /></Labeled>
            <Labeled label="Email"><Input className="rounded-xl" type="email" value={form.email} onChange={(e) => setF("email", e.target.value)} /></Labeled>
            <Labeled label="Established year"><Input className="rounded-xl" value={form.establishedYear} onChange={(e) => setF("establishedYear", e.target.value)} placeholder="1998" /></Labeled>
            <div className="sm:col-span-2">
              <Labeled label="Address"><Input className="rounded-xl" value={form.address} onChange={(e) => setF("address", e.target.value)} /></Labeled>
            </div>
            <Labeled label="City"><Input className="rounded-xl" value={form.city} onChange={(e) => setF("city", e.target.value)} /></Labeled>
            <Labeled label="State"><Input className="rounded-xl" value={form.state} onChange={(e) => setF("state", e.target.value)} /></Labeled>
            <Labeled label="Pincode"><Input className="rounded-xl" value={form.pincode} onChange={(e) => setF("pincode", e.target.value)} /></Labeled>
            <Labeled label="GSTIN"><Input className="rounded-xl" value={form.gstin} onChange={(e) => setF("gstin", e.target.value)} placeholder="Optional" /></Labeled>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="rounded-2xl p-6">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-zinc-400">Images &amp; Google</h2>
            <div className="space-y-4">
              <ImageInput
                label="Business logo"
                value={form.logoUrl}
                onChange={(v) => setF("logoUrl", v)}
                hint="Square logo works best — shown in your website header & footer."
                maxWidth={480}
                square
              />
              <ImageInput
                label="Cover image"
                value={form.coverUrl}
                onChange={(v) => setF("coverUrl", v)}
                hint="Wide photo of your shop, team or work — used in the hero & about sections."
                maxWidth={1400}
              />
              <Labeled label="Google Business Profile URL" hint="Link your GMB listing for local SEO">
                <Input className="rounded-xl" value={form.gmbUrl} onChange={(e) => setF("gmbUrl", e.target.value)} placeholder="https://business.google.com/…" />
              </Labeled>
              <Labeled label="Google Maps URL">
                <Input className="rounded-xl" value={form.mapsUrl} onChange={(e) => setF("mapsUrl", e.target.value)} placeholder="https://maps.app.goo.gl/…" />
              </Labeled>
            </div>
          </Card>

          <Card className="rounded-2xl p-6">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-zinc-400">
              <QrCode className="h-4 w-4 text-emerald-600" /> Payments &amp; QR code
            </h2>
            <p className="mb-4 text-xs text-zinc-500">
              Let customers pay you directly — a <strong>Scan &amp; Pay</strong> section with your QR + UPI ID appears on your website.
            </p>
            <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-start">
              {/* live QR preview */}
              <div className="mx-auto w-fit rounded-2xl border-2 border-emerald-100 bg-white p-3 shadow-sm">
                {form.upiId && isValidUpiId(form.upiId) && !form.paymentQrUrl ? (
                  <QRCode value={upiDeepLink(form.upiId, form.name, "Website payment")} size={132} bgColor="#ffffff" fgColor="#134e4a" />
                ) : form.paymentQrUrl ? (
                  <img src={form.paymentQrUrl} alt="Payment QR preview" className="h-[132px] w-[132px] object-contain" />
                ) : (
                  <div className="flex h-[132px] w-[132px] flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-zinc-200 text-zinc-300">
                    <QrCode className="h-8 w-8" />
                    <span className="text-[10px] font-medium">QR preview</span>
                  </div>
                )}
                <p className="mt-1.5 text-center text-[9px] font-bold uppercase tracking-widest text-zinc-400">Live preview</p>
              </div>
              <div className="space-y-4">
                <Labeled
                  label="UPI ID"
                  hint={form.upiId && !isValidUpiId(form.upiId)
                    ? "Looks invalid — format should be like name@okhdfcbank or shop@paytm"
                    : "A QR is generated automatically from your UPI ID"}
                >
                  <Input
                    className={cn("rounded-xl font-mono", form.upiId && !isValidUpiId(form.upiId) && "border-red-300 focus-visible:ring-red-200")}
                    value={form.upiId}
                    onChange={(e) => setF("upiId", e.target.value)}
                    placeholder="yourname@okhdfcbank"
                  />
                </Labeled>
                <ImageInput
                  label="Your bank / GPay QR image (optional)"
                  value={form.paymentQrUrl}
                  onChange={(v) => setF("paymentQrUrl", v)}
                  hint="Already have a printed QR from your bank or GPay? Upload it — it replaces the auto-generated QR."
                  maxWidth={800}
                  square
                />
                {form.upiId && isValidUpiId(form.upiId) && (
                  <div className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>
                      Visitors will see a <strong>Pay Now</strong> button that opens GPay/PhonePe/Paytm with your UPI ID
                      pre-filled — plus the QR to scan.
                    </span>
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card className="rounded-2xl p-6">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-zinc-400">Social profiles</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {SOCIAL_FIELDS.map((f) => (
                <Labeled key={f.key} label={f.label}>
                  <Input
                    className="rounded-xl"
                    value={String(socials[f.key] ?? "")}
                    onChange={(e) => setSocials((p) => ({ ...p, [f.key]: e.target.value }))}
                    placeholder="https://…"
                  />
                </Labeled>
              ))}
            </div>
          </Card>

          <Card className="rounded-2xl p-6">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-zinc-400">Business hours</h2>
            <div className="space-y-2">
              {DAY_KEYS.map((d) => (
                <div key={d} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs font-semibold text-zinc-600">{d.slice(0, 3)}</span>
                  <Input
                    className="rounded-xl"
                    value={String(hours[d] ?? "")}
                    placeholder="9:00 AM – 7:00 PM or Closed"
                    onChange={(e) => setHours((p) => ({ ...p, [d]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div className="sticky bottom-4 z-10 flex justify-end">
        <Button className="rounded-xl bg-emerald-600 px-6 shadow-lg hover:bg-emerald-700" onClick={() => void save()} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save profile
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------ image input --------------------------------- */

/** Max bytes accepted by POST /api/upload (server enforces the same limit). */
const UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
/** Files at or under this size are uploaded as-is; bigger ones are downscaled first. */
const UPLOAD_DIRECT_LIMIT = 400 * 1024;

/** Downscale an image file via canvas and return a JPEG File (never dataURLs). */
async function downscaleToJpegFile(file: File, maxWidth: number): Promise<File> {
  const objUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error("Could not read this image."));
      im.src = objUrl;
    });
    const scale = Math.min(1, maxWidth / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not process this image — try a different one.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) throw new Error("Could not process this image — try a different one.");
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "image"}.jpg`, { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(objUrl);
  }
}

/**
 * File upload (small file as-is, big file canvas-downscaled) via POST /api/upload,
 * or pasted URL — value is always a URL (/api/uploads/…, https or legacy dataURL), with live preview.
 */
function ImageInput({ label, value, onChange, hint, maxWidth = 1600, square = false }: {
  label: string; value: string; onChange: (v: string) => void;
  hint?: string; maxWidth?: number; square?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function pick(file: File) {
    setErr(null);
    if (!file.type.startsWith("image/")) {
      setErr("Please choose an image file (JPG, PNG, WebP).");
      return;
    }
    if (file.size > UPLOAD_MAX_BYTES) {
      setErr("Image is too large — keep it under 4 MB.");
      return;
    }
    setBusy(true);
    void (async () => {
      try {
        // Small files upload untouched (SVG/PNG stay crisp); big photos are downscaled first.
        const toUpload = file.size > UPLOAD_DIRECT_LIMIT ? await downscaleToJpegFile(file, maxWidth) : file;
        const res = await api.upload<{ url: string }>("/api/upload", toUpload);
        onChange(res.url);
      } catch (e) {
        setErr(errMsg(e));
      } finally {
        setBusy(false);
      }
    })();
  }

  return (
    <div>
      <Label className="text-xs font-medium text-zinc-600">{label}</Label>
      <div className="mt-1.5 flex items-start gap-3">
        {value ? (
          <div className="relative shrink-0">
            <img
              src={value}
              alt={`${label} preview`}
              className={cn("rounded-xl border object-cover", square ? "h-20 w-20" : "h-20 w-32")}
            />
            <button
              type="button"
              aria-label="Remove image"
              disabled={busy}
              onClick={() => onChange("")}
              className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900 text-white shadow transition hover:bg-red-600 disabled:opacity-50"
            >
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label={`Upload ${label}`}
            disabled={busy}
            className={cn(
              "flex shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 text-zinc-400 transition hover:border-emerald-400 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-70",
              square ? "h-20 w-20" : "h-20 w-32",
            )}
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
            <span className="text-[10px] font-medium">{busy ? "Uploading…" : "Upload"}</span>
          </button>
        )}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="relative">
            <Link2 className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <Input
              className="rounded-xl pl-8"
              value={value.startsWith("data:") ? "" : value}
              placeholder={busy ? "Uploading…" : "or paste image URL (https://…)"}
              disabled={busy}
              onChange={(e) => onChange(e.target.value)}
            />
          </div>
          <p className="text-[11px] leading-snug text-zinc-400">
            {err ? <span className="font-medium text-red-600">{err}</span> : hint || "Upload from your phone/computer, or paste a hosted URL."}
          </p>
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) pick(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/* ========================= 4. CONTENT CRUD (x6 types) ======================= */

type CrudType = "services" | "products" | "gallery" | "testimonials" | "faqs" | "blog";

interface CrudField {
  key: string; label: string;
  type: "text" | "textarea" | "number" | "switch" | "select" | "image";
  options?: { value: string; label: string }[];
  placeholder?: string; required?: boolean; full?: boolean; hint?: string;
}

interface CrudCfg {
  singular: string; addLabel: string; icon: LucideIcon;
  empty: string; emptyHint: string;
  fields: CrudField[];
  defaults: Rec;
  rowTitle: (r: Rec) => string;
  rowSub: (r: Rec) => string;
  rowThumb?: (r: Rec) => string;
  rowBadges?: (r: Rec) => React.ReactNode;
}

const SERVICE_ICON_OPTIONS = ["zap", "factory", "wrench", "sun", "coffee", "sparkles", "star", "shield"]
  .map((v) => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }));

const CRUD_CONFIG: Record<CrudType, CrudCfg> = {
  services: {
    singular: "service", addLabel: "Add Service", icon: Briefcase,
    empty: "No services yet — add your first service",
    emptyHint: "Services are what customers search for. Add at least 3 for a strong website.",
    fields: [
      { key: "name", label: "Service name", type: "text", required: true, placeholder: "House wiring repair" },
      { key: "icon", label: "Icon", type: "select", options: SERVICE_ICON_OPTIONS },
      { key: "price", label: "Price label", type: "text", placeholder: "₹499 onwards" },
      { key: "description", label: "Description", type: "textarea", full: true, placeholder: "What is included, how long it takes…" },
      { key: "image", label: "Service photo", type: "image", full: true, hint: "Shown at the top of the service card on your website" },
      { key: "featured", label: "Featured service", type: "switch" },
    ],
    defaults: { name: "", icon: "zap", price: "", description: "", image: "", featured: false },
    rowTitle: (r) => String(r.name ?? ""),
    rowSub: (r) => truncate(String(r.description ?? ""), 140),
    rowThumb: (r) => String(r.image ?? ""),
    rowBadges: (r) => (
      <>
        {r.featured ? <Badge className="border-amber-200 bg-amber-100 text-amber-800"><Star className="h-3 w-3" /> Featured</Badge> : null}
        {r.price ? <Badge variant="outline">{String(r.price)}</Badge> : null}
      </>
    ),
  },
  products: {
    singular: "product", addLabel: "Add Product", icon: Package,
    empty: "No products yet — add your first product",
    emptyHint: "Show your catalogue with prices. Customers can enquire about any product.",
    fields: [
      { key: "name", label: "Product name", type: "text", required: true },
      { key: "sku", label: "SKU", type: "text", placeholder: "Optional" },
      { key: "category", label: "Category", type: "text", placeholder: "e.g. Wiring" },
      { key: "price", label: "Price (₹)", type: "number", placeholder: "999" },
      { key: "salePrice", label: "Sale price (₹)", type: "number", placeholder: "Optional" },
      { key: "shortDesc", label: "Short description", type: "text", full: true, placeholder: "One line shown on the card" },
      { key: "description", label: "Full description", type: "textarea", full: true },
      { key: "image", label: "Product photo", type: "image", full: true, hint: "Upload a clear photo — shown on your website catalogue" },
      { key: "videoUrl", label: "YouTube video link", type: "text", full: true, hint: "Paste a YouTube link (watch, youtu.be or shorts) — a play button appears on the product card" },
      { key: "hidePrice", label: "Hide price (enquire only)", type: "switch" },
      { key: "featured", label: "Featured product", type: "switch" },
    ],
    defaults: { name: "", sku: "", category: "", price: "", salePrice: "", shortDesc: "", description: "", image: "", videoUrl: "", hidePrice: false, featured: false },
    rowTitle: (r) => String(r.name ?? ""),
    rowSub: (r) => truncate(String(r.shortDesc || r.description || ""), 140),
    rowThumb: (r) => String(r.image ?? ""),
    rowBadges: (r) => (
      <>
        {r.videoUrl && youtubeId(String(r.videoUrl)) ? <Badge className="border-red-200 bg-red-50 text-red-700"><Youtube className="h-3 w-3" /> Video</Badge> : null}
        {r.hidePrice ? <Badge variant="outline">Price hidden</Badge>
          : r.salePrice ? <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700">{rupee(Number(r.salePrice))}</Badge>
          : r.price ? <Badge variant="outline">{rupee(Number(r.price))}</Badge> : null}
        {r.featured ? <Badge className="border-amber-200 bg-amber-100 text-amber-800"><Star className="h-3 w-3" /> Featured</Badge> : null}
      </>
    ),
  },
  gallery: {
    singular: "photo", addLabel: "Add Photo", icon: ImageIcon,
    empty: "No photos yet — showcase your work",
    emptyHint: "Real photos of your work build trust. Add 4–8 of your best ones.",
    fields: [
      { key: "url", label: "Photo", type: "image", required: true, full: true },
      { key: "caption", label: "Caption", type: "text", placeholder: "Office wiring project, Baner" },
      { key: "alt", label: "Alt text (SEO)", type: "text", placeholder: "Describe the photo for Google" },
    ],
    defaults: { url: "", caption: "", alt: "" },
    rowTitle: (r) => String(r.caption || "Untitled photo"),
    rowSub: (r) => String(r.alt ?? ""),
    rowThumb: (r) => String(r.url ?? ""),
  },
  testimonials: {
    singular: "testimonial", addLabel: "Add Testimonial", icon: Quote,
    empty: "No testimonials yet — add your first review",
    emptyHint: "Real customer reviews are the #1 trust signal on local business websites.",
    fields: [
      { key: "name", label: "Customer name", type: "text", required: true },
      { key: "role", label: "Role / place", type: "text", placeholder: "Homeowner, Kothrud" },
      { key: "rating", label: "Rating", type: "select", options: [5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${"★".repeat(n)} (${n})` })) },
      { key: "content", label: "Review", type: "textarea", required: true, full: true },
    ],
    defaults: { name: "", role: "", rating: "5", content: "" },
    rowTitle: (r) => String(r.name ?? ""),
    rowSub: (r) => truncate(String(r.content ?? ""), 140),
    rowBadges: (r) => (
      <Badge className="border-amber-200 bg-amber-100 text-amber-800">
        {"★".repeat(Math.max(1, Math.min(5, Number(r.rating ?? 5))))}
      </Badge>
    ),
  },
  faqs: {
    singular: "FAQ", addLabel: "Add FAQ", icon: HelpCircle,
    empty: "No FAQs yet — add your first question",
    emptyHint: "FAQs power Google rich results and AI answer engines (AEO). Add 3+.",
    fields: [
      { key: "question", label: "Question", type: "text", required: true, full: true },
      { key: "answer", label: "Answer", type: "textarea", required: true, full: true },
    ],
    defaults: { question: "", answer: "" },
    rowTitle: (r) => String(r.question ?? ""),
    rowSub: (r) => truncate(String(r.answer ?? ""), 160),
  },
  blog: {
    singular: "post", addLabel: "New Post", icon: Newspaper,
    empty: "No blog posts yet — write your first post",
    emptyHint: "Weekly posts bring free Google traffic to your website.",
    fields: [
      { key: "title", label: "Title", type: "text", required: true, full: true },
      { key: "slug", label: "URL slug", type: "text", full: true, hint: "Auto-filled from title — edit if you like" },
      { key: "category", label: "Category", type: "text" },
      { key: "tags", label: "Tags", type: "text", placeholder: "tips, wiring, safety" },
      { key: "cover", label: "Cover image", type: "image", full: true },
      { key: "excerpt", label: "Excerpt", type: "textarea", full: true, placeholder: "1–2 line summary shown in lists" },
      { key: "content", label: "Content", type: "textarea", full: true },
      { key: "published", label: "Published", type: "switch" },
    ],
    defaults: { title: "", slug: "", category: "", tags: "", cover: "", excerpt: "", content: "", published: true },
    rowTitle: (r) => String(r.title ?? ""),
    rowSub: (r) => truncate(String(r.excerpt || r.content || ""), 140),
    rowThumb: (r) => String(r.cover ?? ""),
    rowBadges: (r) => (
      r.published
        ? <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700">Published</Badge>
        : <Badge variant="outline">Draft</Badge>
    ),
  },
};

const DUPLICABLE: CrudType[] = ["services", "products"];

function ContentTab({ type, rows, loading, refetch }: {
  type: CrudType; rows: Rec[]; loading: boolean; refetch: () => void;
}) {
  const cfg = CRUD_CONFIG[type];
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Rec | null>(null);
  const [duplicateSource, setDuplicateSource] = useState<Rec | null>(null);

  function openAdd() {
    setEditing(null);
    setDuplicateSource(null);
    setDialogOpen(true);
  }

  function openEdit(row: Rec) {
    setEditing(row);
    setDuplicateSource(null);
    setDialogOpen(true);
  }

  function openDuplicate(row: Rec) {
    setEditing(null);
    setDuplicateSource(row);
    setDialogOpen(true);
    toast({ title: `${String(row.name ?? "Item")} duplicated — edit and save` });
  }

  async function del(id: string) {
    try {
      await api.del(`/api/content/${type}/${id}`);
      toast({ title: `${cfg.singular === "FAQ" ? "FAQ" : cfg.singular.charAt(0).toUpperCase() + cfg.singular.slice(1)} deleted` });
      refetch();
    } catch (e) {
      toast({ title: "Could not delete", description: errMsg(e), variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={type.charAt(0).toUpperCase() + type.slice(1)}
        subtitle={type === "faqs" ? "Frequently asked questions — great for SEO & AEO." : undefined}
        action={
          <Button
            className="rounded-xl bg-emerald-600 hover:bg-emerald-700"
            onClick={openAdd}
          >
            <Plus className="h-4 w-4" /> {cfg.addLabel}
          </Button>
        }
      />

      {loading ? (
        <LoadingRows n={4} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={cfg.icon}
          title={cfg.empty}
          hint={cfg.emptyHint}
          action={
            <Button className="rounded-xl bg-emerald-600 hover:bg-emerald-700" onClick={openAdd}>
              <Plus className="h-4 w-4" /> {cfg.addLabel}
            </Button>
          }
        />
      ) : (
        <div className="ws-scroll max-h-96 space-y-3 overflow-y-auto rounded-2xl bg-zinc-50/50 p-3 pr-2">
          {rows.map((row) => {
            const thumb = cfg.rowThumb?.(row);
            return (
              <div key={String(row.id)} className="flex items-start gap-3 rounded-xl border bg-white p-3 shadow-sm">
                {thumb !== undefined ? (
                  thumb ? (
                    <img src={thumb} alt={cfg.rowTitle(row)} className="h-14 w-14 shrink-0 rounded-lg border object-cover" />
                  ) : (
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-dashed bg-zinc-50 text-zinc-300">
                      <ImageIcon className="h-5 w-5" />
                    </span>
                  )
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-zinc-900">{cfg.rowTitle(row)}</p>
                    {cfg.rowBadges?.(row)}
                  </div>
                  {cfg.rowSub(row) ? <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{cfg.rowSub(row)}</p> : null}
                </div>
                <div className="flex shrink-0 gap-1">
                  {DUPLICABLE.includes(type) && (
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-emerald-700"
                      aria-label={`Duplicate ${cfg.rowTitle(row)}`}
                      title={`Duplicate ${cfg.rowTitle(row)}`}
                      onClick={() => openDuplicate(row)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-emerald-700"
                    aria-label="Edit"
                    onClick={() => openEdit(row)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <DeleteConfirm label={`This ${cfg.singular} will be removed from your website.`} onConfirm={() => void del(String(row.id))} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CrudDialog
        type={type}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        duplicate={duplicateSource}
        onSaved={() => { setDialogOpen(false); refetch(); }}
      />
    </div>
  );
}

function CrudDialog({ type, open, onOpenChange, editing, duplicate, onSaved }: {
  type: CrudType; open: boolean; onOpenChange: (o: boolean) => void;
  editing: Rec | null; duplicate: Rec | null; onSaved: () => void;
}) {
  const cfg = CRUD_CONFIG[type];
  const [form, setForm] = useState<Rec>(cfg.defaults);
  const [saving, setSaving] = useState(false);
  const slugTouched = useRef(false);

  useEffect(() => {
    if (!open) return;
    slugTouched.current = false;
    if (editing) {
      const next: Rec = {};
      for (const f of cfg.fields) {
        const v = editing[f.key];
        next[f.key] = f.type === "switch" ? Boolean(v) : v === null || v === undefined ? "" : String(v);
      }
      setForm(next);
    } else if (duplicate) {
      // Duplicate flow: prefill from the source item, but it saves as a NEW item
      // (editing stays null → POST) with the copy name and featured reset.
      const next: Rec = {};
      for (const f of cfg.fields) {
        const v = duplicate[f.key];
        if (f.type === "switch") next[f.key] = f.key === "featured" ? false : Boolean(v);
        else next[f.key] = v === null || v === undefined ? "" : String(v);
      }
      next.name = `${String(duplicate.name ?? "").trim()} (Copy)`;
      setForm(next);
    } else {
      setForm({ ...cfg.defaults });
    }
  }, [open, editing, duplicate, cfg]);

  function setF(key: string, v: unknown) {
    setForm((p) => ({ ...p, [key]: v }));
  }

  async function save() {
    const body: Rec = {};
    for (const f of cfg.fields) {
      const v = form[f.key];
      if (f.type === "number") body[f.key] = v === "" || v === null || v === undefined ? null : Number(v);
      else if (f.type === "switch") body[f.key] = Boolean(v);
      else body[f.key] = typeof v === "string" ? v : "";
    }
    if (type === "blog" && !body.slug) body.slug = slugify(String(body.title || ""));
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/api/content/${type}/${String(editing.id)}`, body);
        toast({ title: "Saved", description: `${cfg.singular === "FAQ" ? "FAQ" : cfg.singular} updated successfully.` });
      } else {
        await api.post(`/api/content/${type}`, body);
        toast({ title: "Added", description: `${cfg.singular === "FAQ" ? "FAQ" : cfg.singular} added to your website.` });
      }
      onSaved();
    } catch (e) {
      toast({ title: "Could not save", description: errMsg(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl ws-scroll sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editing
              ? `Edit ${cfg.singular === "FAQ" ? "FAQ" : cfg.singular}`
              : duplicate
                ? `Duplicate ${cfg.singular === "FAQ" ? "FAQ" : cfg.singular}`
                : cfg.addLabel}
          </DialogTitle>
          <DialogDescription>Changes appear on your website after you publish.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {cfg.fields.map((f) => (
            <div key={f.key} className={f.full || f.type === "textarea" ? "sm:col-span-2" : ""}>
              {f.type === "switch" ? (
                <div className="flex h-full items-center justify-between gap-3 rounded-xl border p-3">
                  <Label className="text-xs font-medium text-zinc-600">{f.label}</Label>
                  <Switch checked={Boolean(form[f.key])} onCheckedChange={(v) => setF(f.key, v)} />
                </div>
              ) : f.type === "image" ? (
                <ImageInput label={f.label} value={String(form[f.key] ?? "")} onChange={(v) => setF(f.key, v)} hint={f.hint} />
              ) : f.type === "select" ? (
                <Labeled label={f.label}>
                  <Select value={String(form[f.key] ?? "")} onValueChange={(v) => setF(f.key, v)}>
                    <SelectTrigger className="w-full rounded-xl"><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      {(f.options ?? []).map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Labeled>
              ) : f.type === "textarea" ? (
                <Labeled label={f.label} hint={f.hint}>
                  <Textarea
                    className="rounded-xl"
                    rows={f.key === "content" && type === "blog" ? 10 : 4}
                    value={String(form[f.key] ?? "")}
                    placeholder={f.placeholder}
                    onChange={(e) => setF(f.key, e.target.value)}
                  />
                </Labeled>
              ) : (
                <Labeled label={f.label} hint={f.hint}>
                  <Input
                    className="rounded-xl"
                    type={f.type === "number" ? "number" : "text"}
                    value={String(form[f.key] ?? "")}
                    placeholder={f.placeholder}
                    onChange={(e) => {
                      if (type === "blog" && f.key === "slug") slugTouched.current = true;
                      setF(f.key, e.target.value);
                      if (type === "blog" && f.key === "title" && !slugTouched.current) {
                        setF("slug", slugify(e.target.value));
                      }
                    }}
                  />
                </Labeled>
              )}
            </div>
          ))}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="rounded-xl bg-emerald-600 hover:bg-emerald-700" onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {editing ? "Save changes" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ================================== 5. LEADS ================================ */

const LEAD_STATUSES: LeadStatus[] = ["NEW", "CONTACTED", "FOLLOW_UP", "QUALIFIED", "CONVERTED", "CLOSED", "SPAM"];

function sourceLabel(s: string): string {
  if (s === "FORM") return "Website form";
  if (s === "WHATSAPP") return "WhatsApp";
  return s;
}

function exportLeadsCsv(leads: Lead[]) {
  const head = ["Name", "Phone", "Email", "Service", "Message", "Source", "Status", "Notes", "Created"];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = leads.map((l) => [
    l.name, l.phone, l.email, l.serviceName, l.message, l.source, l.status, l.notes,
    new Date(l.createdAt).toLocaleString("en-IN"),
  ].map(esc).join(","));
  const csv = [head.map(esc).join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `websetu-leads-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function LeadsTab({ leads, loading, refetch, onApply, onDelete }: {
  leads: Lead[]; loading: boolean; refetch: () => void;
  onApply: (l: Lead) => void; onDelete: (id: string) => void;
}) {
  const [status, setStatus] = useState("ALL");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<Lead | null>(null);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return leads.filter((l) => {
      if (status !== "ALL" && l.status !== status) return false;
      if (!query) return true;
      return [l.name, l.phone, l.email, l.message, l.serviceName]
        .some((v) => (v || "").toLowerCase().includes(query));
    });
  }, [leads, status, q]);

  const newCount = leads.filter((l) => l.status === "NEW").length;

  async function changeStatus(lead: Lead, next: string) {
    try {
      const updated = await api.patch<Lead>(`/api/leads/${lead.id}`, { status: next });
      onApply(updated);
      toast({ title: "Lead updated", description: `${lead.name} marked as ${next.replace("_", " ").toLowerCase()}.` });
    } catch (e) {
      toast({ title: "Could not update lead", description: errMsg(e), variant: "destructive" });
    }
  }

  async function saveNotes() {
    if (!detail) return;
    setSavingNotes(true);
    try {
      const updated = await api.patch<Lead>(`/api/leads/${detail.id}`, { notes });
      onApply(updated);
      setDetail(updated);
      toast({ title: "Note saved" });
    } catch (e) {
      toast({ title: "Could not save note", description: errMsg(e), variant: "destructive" });
    } finally {
      setSavingNotes(false);
    }
  }

  async function del(lead: Lead) {
    try {
      await api.del(`/api/leads/${lead.id}`);
      onDelete(lead.id);
      toast({ title: "Lead deleted" });
    } catch (e) {
      toast({ title: "Could not delete lead", description: errMsg(e), variant: "destructive" });
    }
  }

  const waLink = (l: Lead) =>
    `https://wa.me/${(l.phone || "").replace(/[^\d]/g, "")}?text=${encodeURIComponent(`Hello ${l.name}, thank you for enquiring at our website!`)}`;

  const Actions = ({ lead }: { lead: Lead }) => (
    <div className="flex items-center gap-1">
      <a
        href={`tel:${lead.phone}`}
        aria-label={`Call ${lead.name}`}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-emerald-50 hover:text-emerald-700"
      >
        <Phone className="h-4 w-4" />
      </a>
      <a
        href={waLink(lead)}
        target="_blank" rel="noreferrer"
        aria-label={`WhatsApp ${lead.name}`}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-emerald-50 hover:text-emerald-700"
      >
        <MessageCircle className="h-4 w-4" />
      </a>
      <DeleteConfirm label={`Lead from ${lead.name} will be deleted.`} onConfirm={() => void del(lead)} />
    </div>
  );

  const StatusSelect = ({ lead }: { lead: Lead }) => (
    <Select value={lead.status} onValueChange={(v) => void changeStatus(lead, v)}>
      <SelectTrigger size="sm" className="w-[130px] rounded-lg border-zinc-200 text-xs" aria-label="Lead status">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LEAD_STATUSES.map((s) => (
          <SelectItem key={s} value={s} className="text-xs">{s.replace("_", " ")}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Leads"
        subtitle={newCount > 0 ? `${newCount} new lead${newCount > 1 ? "s" : ""} waiting for a first response.` : "Every enquiry from your website lands here."}
        action={
          <Button variant="outline" className="rounded-xl" onClick={() => exportLeadsCsv(filtered)} disabled={filtered.length === 0}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        }
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="ws-scroll overflow-x-auto pb-1">
          <Tabs value={status} onValueChange={setStatus}>
            <TabsList className="h-9 w-max">
              <TabsTrigger value="ALL" className="text-xs">All ({leads.length})</TabsTrigger>
              {LEAD_STATUSES.map((s) => (
                <TabsTrigger key={s} value={s} className="text-xs">
                  {s === "NEW" && newCount > 0 ? `New (${newCount})` : s.replace("_", " ")}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <div className="relative md:ml-auto md:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            className="rounded-xl pl-9"
            placeholder="Search name, phone, message…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search leads"
          />
        </div>
      </div>

      {loading ? (
        <LoadingRows n={5} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={leads.length === 0 ? "No leads yet" : "No leads match your filter"}
          hint={leads.length === 0
            ? "Publish your website and share it — enquiries from the contact form and WhatsApp will appear here instantly."
            : "Try a different status or clear the search."}
          action={leads.length > 0 ? (
            <Button variant="outline" className="rounded-xl" onClick={() => { setStatus("ALL"); setQ(""); }}>Clear filters</Button>
          ) : undefined}
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden rounded-2xl border bg-white shadow-sm md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="rounded-tl-2xl">Customer</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead className="rounded-tr-2xl text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <p className="font-semibold text-zinc-900">{l.name}</p>
                      <a href={`tel:${l.phone}`} className="text-xs text-emerald-700 hover:underline">{l.phone}</a>
                      {l.email ? <p className="truncate text-xs text-zinc-400">{l.email}</p> : null}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-600">{l.serviceName || "—"}</TableCell>
                    <TableCell>
                      <button
                        type="button"
                        className="block w-[220px] max-w-full truncate text-left text-xs text-zinc-600 hover:text-emerald-700 hover:underline"
                        onClick={() => { setDetail(l); setNotes(l.notes); }}
                        title="View full message"
                      >
                        {truncate(l.message || "—", 70)}
                      </button>
                      {l.notes ? (
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-amber-700">
                          <Pencil className="h-3 w-3" /> Note saved
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell><Badge variant="outline" className="text-[11px]">{sourceLabel(l.source)}</Badge></TableCell>
                    <TableCell><StatusSelect lead={l} /></TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-zinc-400">{timeAgo(l.createdAt)}</TableCell>
                    <TableCell className="text-right"><Actions lead={l} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {filtered.map((l) => (
              <Card key={l.id} className="rounded-2xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-zinc-900">{l.name}</p>
                    <p className="text-xs text-zinc-400">{timeAgo(l.createdAt)} · {sourceLabel(l.source)}</p>
                  </div>
                  <StatusSelect lead={l} />
                </div>
                {l.serviceName ? <p className="mt-2 text-xs font-medium text-emerald-700">{l.serviceName}</p> : null}
                <button type="button" className="mt-1 block w-full text-left text-xs text-zinc-600" onClick={() => { setDetail(l); setNotes(l.notes); }}>
                  {truncate(l.message || "—", 90)} <span className="font-medium text-emerald-700">View</span>
                </button>
                <div className="mt-3 flex items-center justify-between border-t pt-3">
                  <div className="flex gap-2 text-xs">
                    <a href={`tel:${l.phone}`} className="font-medium text-emerald-700">{l.phone}</a>
                    {l.email ? <span className="truncate text-zinc-400">{l.email}</span> : null}
                  </div>
                  <Actions lead={l} />
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Detail + notes dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => { if (!o) setDetail(null); }}>
        <DialogContent className="rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{detail?.name}</DialogTitle>
            <DialogDescription>
              {detail ? `${sourceLabel(detail.source)} · ${timeAgo(detail.createdAt)}` : ""}
            </DialogDescription>
          </DialogHeader>
          {detail ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <a href={`tel:${detail.phone}`} className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50">
                  <Phone className="h-4 w-4" /> {detail.phone}
                </a>
                <a href={waLink(detail)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50">
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </a>
                {detail.email ? (
                  <a href={`mailto:${detail.email}`} className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
                    <Mail className="h-4 w-4" /> Email
                  </a>
                ) : null}
              </div>
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-wider text-zinc-400">Message</p>
                <p className="whitespace-pre-wrap rounded-xl bg-zinc-50 p-3 text-sm text-zinc-700">{detail.message || "—"}</p>
                {detail.serviceName ? <p className="mt-2 text-xs text-zinc-500">Interested in: <span className="font-medium text-zinc-700">{detail.serviceName}</span></p> : null}
              </div>
              <Labeled label="Your notes (private)">
                <Textarea className="rounded-xl" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Called on 12th, quoted ₹4,500, follow up Friday…" />
              </Labeled>
            </div>
          ) : null}
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => setDetail(null)}>Close</Button>
            <Button className="rounded-xl bg-emerald-600 hover:bg-emerald-700" onClick={() => void saveNotes()} disabled={savingNotes}>
              {savingNotes ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ================================== 6. SEO ================================== */

function SeoTab({ business, content }: { business: BusinessWithMeta; content: ContentState }) {
  const patchBusiness = useApp((s) => s.patchBusiness);
  const website = business.website;
  const [seo, setSeo] = useState<SeoValue>({
    seoTitle: website?.seoTitle ?? "",
    seoDescription: website?.seoDescription ?? "",
    keywords: website?.keywords ?? "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!website) return;
    setSeo({
      seoTitle: website.seoTitle ?? "",
      seoDescription: website.seoDescription ?? "",
      keywords: website.keywords ?? "",
    });
  }, [website]);

  const counts = useMemo(
    () => ({
      services: content.services.length, products: content.products.length, gallery: content.gallery.length,
      testimonials: content.testimonials.length, faqs: content.faqs.length, blogPosts: content.blog.length,
    }),
    [content],
  );
  const health = useMemo(() => computeHealth(business, website, counts), [business, website, counts]);
  const aeoChecks = health.checks.filter((c) => ["faq", "seoDesc", "seoTitle", "keywords"].includes(c.key));

  async function save() {
    setSaving(true);
    try {
      const w = await api.put<WebsiteData>("/api/website", {
        seoTitle: seo.seoTitle, seoDescription: seo.seoDescription, keywords: seo.keywords,
      });
      patchBusiness({ website: w });
      toast({ title: "SEO saved", description: "Search engines will pick this up after your next publish." });
    } catch (e) {
      toast({ title: "Could not save SEO", description: errMsg(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="SEO &amp; Discovery" subtitle="How your business appears on Google and AI answer engines." />

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Card className="rounded-2xl p-6">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-zinc-400">Search appearance</h2>
          <SeoFields value={seo} onChange={setSeo} />
          <Button className="mt-4 rounded-xl bg-emerald-600 hover:bg-emerald-700" onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save SEO
          </Button>

          <Separator className="my-6" />
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-400">Google result preview</p>
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <p className="text-sm text-emerald-700">{business.slug}.websetu.in</p>
            <p className="mt-0.5 text-lg font-medium leading-snug text-zinc-900">
              {seo.seoTitle || `${business.name} — ${business.tagline || business.category}`}
            </p>
            <p className="mt-1 text-sm leading-snug text-zinc-600">
              {seo.seoDescription || "Add a meta description to control this snippet — it is your free ad on Google."}
            </p>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="rounded-2xl p-6">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-900">
              <MapPin className="h-4 w-4 text-amber-500" /> Local SEO
            </h2>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: "City", value: business.city || "—" },
                { label: "State", value: business.state || "—" },
                { label: "Pincode", value: business.pincode || "—" },
              ].map((x) => (
                <div key={x.label} className="rounded-xl bg-zinc-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{x.label}</p>
                  <p className="mt-1 truncate text-sm font-semibold text-zinc-800">{x.value}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              {business.gmbUrl
                ? "Google Business Profile linked — reviews and maps listing boost local rankings."
                : "Link your Google Business Profile in the Business Profile tab for stronger local rankings."}
            </p>
          </Card>

          <Card className="rounded-2xl p-6">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-900">
              <Sparkles className="h-4 w-4 text-amber-500" /> AEO — AI Answer Engines
            </h2>
            <div className="space-y-2">
              {aeoChecks.map((c) => (
                <div key={c.key} className="flex items-center gap-2.5 rounded-xl border p-2.5">
                  {c.pass ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0 text-amber-500" />
                  )}
                  <p className={cn("text-sm", c.pass ? "text-zinc-600" : "font-medium text-zinc-800")}>{c.label}</p>
                  <span className="ml-auto text-[10px] font-bold uppercase text-zinc-300">{c.weight} pts</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              When people ask ChatGPT or Google &quot;best {business.category.toLowerCase()} in {business.city || "my city"}&quot;, FAQs and rich
              metadata help your site become the answer.
            </p>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="rounded-2xl p-5">
              <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-900"><Globe className="h-4 w-4 text-emerald-600" /> Sitemap</h3>
              <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                Auto-generated at <code className="rounded bg-zinc-100 px-1 py-0.5 text-[11px]">/{business.slug}/sitemap.xml</code> and refreshed
                every time you publish.
              </p>
            </Card>
            <Card className="rounded-2xl p-5">
              <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-900"><ShieldCheck className="h-4 w-4 text-emerald-600" /> robots.txt</h3>
              <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                All major crawlers are allowed and your sitemap is referenced automatically. No configuration needed.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================ 7. ANALYTICS ============================== */

const CHART_COLORS = { emerald: "#059669", amber: "#d97706", zinc: "#a1a1aa" };

function AnalyticsTab() {
  const { data: summary, loading } = useFetch<AnalyticsSummary>(() => api.get<AnalyticsSummary>("/api/analytics/summary"), []);

  const chartData = useMemo(
    () => (summary?.daily ?? []).map((d) => ({
      ...d,
      label: new Date(d.date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    })),
    [summary],
  );

  const ctaData = summary ? [
    { name: "Calls", count: summary.ctaCalls },
    { name: "WhatsApp", count: summary.ctaWhatsapp },
    { name: "Emails", count: summary.ctaEmail },
    { name: "Forms", count: summary.formSubmits },
  ] : [];

  return (
    <div className="space-y-6">
      <PageHeader title="Analytics" subtitle="Last 30 days across your website, WhatsApp and calls." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={Users} label="Visits" value={loading ? "…" : (summary?.visits ?? 0)} />
        <StatCard icon={Eye} label="Unique visits" value={loading ? "…" : (summary?.uniqueVisits ?? 0)} tint="zinc" />
        <StatCard icon={Inbox} label="Leads" value={loading ? "…" : (summary?.leads ?? 0)} tint="amber" />
        <StatCard icon={Phone} label="Call clicks" value={loading ? "…" : (summary?.ctaCalls ?? 0)} />
        <StatCard icon={MessageCircle} label="WhatsApp clicks" value={loading ? "…" : (summary?.ctaWhatsapp ?? 0)} tint="amber" />
        <StatCard icon={Mail} label="Email clicks" value={loading ? "…" : (summary?.ctaEmail ?? 0)} tint="zinc" />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <Card className="rounded-2xl p-6 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-zinc-900">Daily traffic</h2>
              <p className="text-xs text-zinc-500">Visits and enquiries per day (last 14 days)</p>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: CHART_COLORS.emerald }} /> Visits</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: CHART_COLORS.amber }} /> Leads</span>
            </div>
          </div>
          {loading ? (
            <Skeleton className="h-64 w-full rounded-2xl" />
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="gVisits" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.emerald} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={CHART_COLORS.emerald} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gLeads" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.amber} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={CHART_COLORS.amber} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#71717a" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11, fill: "#71717a" }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: "1px solid #e4e4e7", fontSize: 12 }}
                    labelStyle={{ fontWeight: 700, color: "#18181b" }}
                  />
                  <Area type="monotone" dataKey="visits" stroke={CHART_COLORS.emerald} strokeWidth={2} fill="url(#gVisits)" name="Visits" />
                  <Area type="monotone" dataKey="leads" stroke={CHART_COLORS.amber} strokeWidth={2} fill="url(#gLeads)" name="Leads" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="rounded-2xl p-6">
            <h2 className="mb-1 text-base font-bold text-zinc-900">CTA clicks</h2>
            <p className="text-xs text-zinc-500">Which buttons customers actually press</p>
            {loading ? (
              <Skeleton className="mt-4 h-44 w-full rounded-2xl" />
            ) : (
              <div className="mt-4 h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ctaData} margin={{ top: 5, right: 5, bottom: 0, left: -25 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#71717a" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#71717a" }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e4e4e7", fontSize: 12 }} cursor={{ fill: "rgba(5,150,105,0.06)" }} />
                    <Bar dataKey="count" name="Clicks" fill={CHART_COLORS.emerald} radius={[6, 6, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <Card className="rounded-2xl border-amber-200 bg-amber-50/60 p-6">
            <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-900">
              <TrendingUp className="h-4 w-4 text-amber-600" /> Connect Google Analytics
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-zinc-600">
              Full GA4 integration is coming on the <span className="font-semibold text-amber-700">Professional plan</span>. Meanwhile, WebSetu
              analytics automatically track visits, call clicks, WhatsApp clicks and leads — no setup needed.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ============================== 8. SUBSCRIPTION ============================= */

interface PaymentRow {
  id: string; amount: number; method: string; status: string; invoiceNo: string;
  couponCode: string; description: string; createdAt: string;
}

function SubscriptionTab({ business, servicesCount }: { business: BusinessWithMeta; servicesCount: number }) {
  const setBusiness = useApp((s) => s.setBusiness);
  const plans = useApp((s) => s.plans);
  const { data, loading, refetch } = useFetch<{ subscription: ReturnType<typeof JSON.parse> | null; payments: PaymentRow[] }>(
    () => api.get("/api/subscription"),
    [],
  );

  const sub = business.subscription ?? (data?.subscription as BusinessWithMeta["subscription"] ?? null);
  const [cycle, setCycle] = useState<"MONTHLY" | "YEARLY">("MONTHLY");
  const [selectedPlanId, setSelectedPlanId] = useState<string>(
    business.subscription?.planId ?? plans.find((p) => p.popular)?.id ?? "",
  );
  const [couponCode, setCouponCode] = useState("");
  const [coupon, setCoupon] = useState<{ valid: boolean; discount?: number; finalAmount?: number; message?: string; description?: string } | null>(null);
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  const [method, setMethod] = useState("UPI");
  const [paying, setPaying] = useState(false);
  const [success, setSuccess] = useState<{ invoiceNo: string; amount: number; plan: string } | null>(null);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) ?? null;
  const baseAmount = selectedPlan ? (cycle === "YEARLY" ? selectedPlan.priceYearly : selectedPlan.priceMonthly) : 0;
  const payable = coupon?.valid && coupon.finalAmount !== undefined ? coupon.finalAmount : baseAmount;

  useEffect(() => {
    if (business.subscription?.planId && !selectedPlanId) setSelectedPlanId(business.subscription.planId);
  }, []);

  useEffect(() => {
    if (business.subscription) setCycle(business.subscription.cycle);
  }, []);

  async function validateCoupon() {
    if (!couponCode.trim()) return;
    setCheckingCoupon(true);
    try {
      const res = await api.post<{ valid: boolean; discount?: number; finalAmount?: number; message?: string; description?: string }>(
        "/api/coupons/validate",
        { code: couponCode.trim(), amount: baseAmount },
      );
      setCoupon(res);
      if (res.valid) {
        toast({ title: "Coupon applied 🎉", description: `You save ${rupee(res.discount ?? 0)} — ${res.description ?? ""}` });
      } else {
        toast({ title: "Coupon not valid", description: res.message ?? "Please check the code.", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Could not validate coupon", description: errMsg(e), variant: "destructive" });
    } finally {
      setCheckingCoupon(false);
    }
  }

  async function pay() {
    if (!selectedPlan) return;
    setPaying(true);
    try {
      const res = await api.post<{ subscription: BusinessWithMeta["subscription"]; payment: PaymentRow }>("/api/subscription", {
        planId: selectedPlan.id,
        cycle,
        couponCode: coupon?.valid ? couponCode.trim().toUpperCase() : "",
        method,
      });
      setSuccess({
        invoiceNo: res.payment.invoiceNo,
        amount: res.payment.amount,
        plan: selectedPlan.name,
      });
      const me = await api.get<{ business: BusinessWithMeta | null }>("/api/auth/me");
      if (me.business) setBusiness(me.business);
      await refetch();
    } catch (e) {
      toast({ title: "Payment failed", description: errMsg(e), variant: "destructive" });
    } finally {
      setPaying(false);
    }
  }

  const maxPages = sub?.plan?.maxPages ?? plans.find((p) => p.id === sub?.planId)?.maxPages ?? 5;
  const usagePct = Math.min(100, Math.round((servicesCount / Math.max(1, maxPages)) * 100));
  const activePlans = plans.filter((p) => p.active);

  return (
    <div className="space-y-6">
      <PageHeader title="Subscription" subtitle="Your plan, usage and invoices." />

      <div className="grid items-start gap-4 xl:grid-cols-3">
        {/* Current plan */}
        <Card className="rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Current plan</h2>
            {sub ? <SubStatusBadge status={sub.status} /> : <Badge variant="outline">No plan</Badge>}
          </div>
          <p className="mt-3 text-2xl font-bold text-zinc-900">
            {sub?.plan?.name ?? plans.find((p) => p.id === sub?.planId)?.name ?? "Free Trial"}
          </p>
          {sub ? (
            <p className="text-sm text-zinc-500">
              {rupee(sub.amount)} · {sub.cycle === "YEARLY" ? "per year" : "per month"}
            </p>
          ) : null}
          <Separator className="my-4" />
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-zinc-500">Started</dt><dd className="font-medium text-zinc-800">{fmtDate(sub?.startedAt)}</dd></div>
            {sub?.status === "TRIALING" ? (
              <div className="flex justify-between"><dt className="text-zinc-500">Trial ends</dt><dd className="font-medium text-amber-700">{fmtDate(sub?.trialEndsAt)} ({daysUntil(sub?.trialEndsAt)}d)</dd></div>
            ) : (
              <div className="flex justify-between"><dt className="text-zinc-500">Renews</dt><dd className="font-medium text-zinc-800">{fmtDate(sub?.renewsAt)}</dd></div>
            )}
          </dl>
          <Separator className="my-4" />
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-400">Usage</p>
          <div className="space-y-3">
            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-zinc-500">Content items (services)</span>
                <span className="font-semibold text-zinc-700">{servicesCount} / {maxPages}</span>
              </div>
              <Progress value={usagePct} className="h-2" />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-zinc-50 p-3 text-xs">
              <span className="flex items-center gap-1.5 text-zinc-500"><Sparkles className="h-3.5 w-3.5 text-amber-500" /> AI credits / month</span>
              <span className="font-bold text-zinc-800">{sub?.plan?.aiCredits ?? 0}</span>
            </div>
          </div>
        </Card>

        {/* Plans + checkout */}
        <div className="space-y-4 xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Change plan</h2>
            <div className="flex items-center gap-1 rounded-xl bg-zinc-100 p-1">
              {(["MONTHLY", "YEARLY"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { setCycle(c); setCoupon(null); }}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                    cycle === c ? "bg-white text-emerald-700 shadow-sm" : "text-zinc-500 hover:text-zinc-800",
                  )}
                >
                  {c === "MONTHLY" ? "Monthly" : "Yearly"}
                  {c === "YEARLY" ? " · save" : ""}
                </button>
              ))}
            </div>
          </div>

          {loading && activePlans.length === 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Skeleton className="h-56 rounded-2xl" />
              <Skeleton className="h-56 rounded-2xl" />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {activePlans.map((p: Plan) => {
                const price = cycle === "YEARLY" ? p.priceYearly : p.priceMonthly;
                const isCurrent = sub?.planId === p.id;
                const isSelected = selectedPlanId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { setSelectedPlanId(p.id); setCoupon(null); }}
                    className={cn(
                      "relative rounded-2xl border bg-white p-5 text-left shadow-sm transition",
                      isSelected ? "border-emerald-500 ring-2 ring-emerald-500/20" : "border-zinc-200 hover:border-emerald-300",
                    )}
                  >
                    {p.popular ? (
                      <span className="absolute -top-2.5 right-4 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        Popular
                      </span>
                    ) : null}
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-zinc-900">{p.name}</p>
                      {isCurrent ? <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700">Current</Badge> : null}
                    </div>
                    <p className="text-xs text-zinc-500">{p.tagline}</p>
                    <p className="mt-2 text-2xl font-bold text-zinc-900">
                      {rupee(price)}
                      <span className="text-sm font-normal text-zinc-400">/{cycle === "YEARLY" ? "yr" : "mo"}</span>
                    </p>
                    <ul className="mt-3 space-y-1.5">
                      {p.features.slice(0, 5).map((f, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-zinc-600">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> {f}
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>
          )}

          {/* Checkout */}
          <Card className="rounded-2xl p-6">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-zinc-400">Checkout</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <Labeled label="Coupon code">
                <div className="flex gap-2">
                  <Input
                    className="rounded-xl uppercase"
                    placeholder="LAUNCH50"
                    value={couponCode}
                    onChange={(e) => { setCouponCode(e.target.value); setCoupon(null); }}
                  />
                  <Button variant="outline" className="shrink-0 rounded-xl" onClick={() => void validateCoupon()} disabled={checkingCoupon || !couponCode.trim() || !selectedPlan}>
                    {checkingCoupon ? <Loader2 className="h-4 w-4 animate-spin" /> : "Validate"}
                  </Button>
                </div>
              </Labeled>
              <Labeled label="Payment method">
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger className="w-full rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UPI">UPI (GPay / PhonePe)</SelectItem>
                    <SelectItem value="CARD">Credit / Debit card</SelectItem>
                    <SelectItem value="NETBANKING">Netbanking</SelectItem>
                  </SelectContent>
                </Select>
              </Labeled>
              <div className="flex flex-col justify-end gap-1">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">{selectedPlan ? `${selectedPlan.name} · ${cycle === "YEARLY" ? "yearly" : "monthly"}` : "Select a plan"}</span>
                  <span className="font-bold text-zinc-900">{rupee(payable)}</span>
                </div>
                {coupon?.valid && coupon.discount ? (
                  <p className="text-right text-xs text-emerald-700">Coupon saves you {rupee(coupon.discount)}</p>
                ) : null}
              </div>
            </div>
            <Button
              className="mt-4 w-full rounded-xl bg-emerald-600 py-6 text-base hover:bg-emerald-700"
              disabled={!selectedPlan || paying}
              onClick={() => void pay()}
            >
              {paying ? <Loader2 className="h-5 w-5 animate-spin" /> : <CreditCard className="h-5 w-5" />}
              Pay {rupee(payable)} &amp; Activate
            </Button>
            <p className="mt-2 text-center text-[11px] text-zinc-400">Demo checkout — no real money is charged. Razorpay-ready architecture.</p>
          </Card>
        </div>
      </div>

      {/* Payment history */}
      <Card className="rounded-2xl p-6">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-zinc-400">Payment history</h2>
        {(data?.payments ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-400">No payments yet — you are on the free trial.</p>
        ) : (
          <div className="ws-scroll max-h-96 overflow-y-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Invoice</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.payments ?? []).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs font-semibold text-zinc-800">{p.invoiceNo || "—"}</TableCell>
                    <TableCell className="text-xs text-zinc-600">{p.description}</TableCell>
                    <TableCell className="text-xs">{p.method}</TableCell>
                    <TableCell className="font-semibold text-zinc-900">{rupee(p.amount)}</TableCell>
                    <TableCell>
                      <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700">{p.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs text-zinc-400">{fmtDate(p.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Success dialog */}
      <Dialog open={!!success} onOpenChange={(o) => { if (!o) setSuccess(null); }}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 className="h-5 w-5" />
              </span>
              Payment successful
            </DialogTitle>
            <DialogDescription>Your new plan is active immediately.</DialogDescription>
          </DialogHeader>
          {success ? (
            <div className="space-y-2 rounded-2xl border bg-zinc-50 p-4 text-sm">
              <div className="flex justify-between"><span className="text-zinc-500">Plan</span><span className="font-semibold text-zinc-900">{success.plan}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Amount paid</span><span className="font-semibold text-zinc-900">{rupee(success.amount)}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Invoice no.</span><span className="font-mono text-xs font-semibold text-zinc-800">{success.invoiceNo}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Next renewal</span><span className="font-semibold text-zinc-900">{fmtDate(sub?.renewsAt)}</span></div>
            </div>
          ) : null}
          <DialogFooter>
            <Button className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700" onClick={() => setSuccess(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ================================ 9. SETTINGS =============================== */

function SettingsTab() {
  const user = useApp((s) => s.user);
  const logout = useApp((s) => s.logout);
  const business = useApp((s) => s.business);
  const [prefs, setPrefs] = useState({ leadAlerts: true, weekly: true, productUpdates: false });

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Settings" subtitle="Your account and preferences." />

      <Card className="rounded-2xl p-6">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-zinc-400">Account</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Labeled label="Your name"><Input className="rounded-xl" value={user?.name ?? ""} readOnly /></Labeled>
          <Labeled label="Email"><Input className="rounded-xl" value={user?.email ?? ""} readOnly /></Labeled>
        </div>
        <p className="mt-3 text-xs text-zinc-400">
          Role: {user?.role === "ADMIN" ? "Administrator" : "Business owner"}
          {business ? ` · Business: ${business.name}` : ""}
        </p>
      </Card>

      <Card className="rounded-2xl p-6">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-zinc-400">Notifications</h2>
        <div className="space-y-3">
          {([
            { key: "leadAlerts" as const, label: "New lead alerts", desc: "Get notified the moment a customer enquires" },
            { key: "weekly" as const, label: "Weekly performance summary", desc: "Visits, leads and health score every Monday" },
            { key: "productUpdates" as const, label: "Product updates", desc: "New features and tips for your website" },
          ]).map((p) => (
            <div key={p.key} className="flex items-center justify-between gap-4 rounded-xl border p-3.5">
              <div>
                <p className="text-sm font-medium text-zinc-800">{p.label}</p>
                <p className="text-xs text-zinc-400">{p.desc}</p>
              </div>
              <Switch checked={prefs[p.key]} onCheckedChange={(v) => setPrefs((s) => ({ ...s, [p.key]: v }))} />
            </div>
          ))}
        </div>
      </Card>

      <Card className="rounded-2xl border-red-200 p-6">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wider text-red-500">Danger zone</h2>
        <p className="mb-4 text-sm text-zinc-500">
          Need to close your account or transfer your website? Our support team will help you do it safely.
        </p>
        <div className="flex flex-wrap gap-2">
          <a href="mailto:support@websetu.in?subject=WebSetu%20account%20support">
            <Button variant="outline" className="rounded-xl">
              <Mail className="h-4 w-4" /> Contact support
            </Button>
          </a>
          <Button variant="outline" className="rounded-xl text-red-600 hover:bg-red-50 hover:text-red-700" onClick={logout}>
            <LogOut className="h-4 w-4" /> Log out
          </Button>
        </div>
      </Card>
    </div>
  );
}

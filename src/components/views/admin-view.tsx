"use client";
// WebSetu — AdminView: Super Admin console (zinc-900 sidebar, emerald accents).
// Tabs: Overview | Customers | Plans | Templates | Coupons | Platform Leads.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FormError } from "@/components/views/console-ui";
import ConsoleBreadcrumb from "@/components/views/console-breadcrumb";
import DomainRequestsTab from "@/components/views/admin-domain-requests";
import SupportVisitBanner from "@/components/views/support-visit-banner";
import { tabTitle } from "@/lib/console-tabs";
import { TRIAL_DAYS } from "@/lib/trial";
import {
  AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight,
  LogOut, BadgeCheck, Ban, CalendarX2, Check, Crown, Download, ExternalLink,
  Globe, Inbox, Layers, LayoutDashboard, LayoutTemplate, Loader2, Menu, MoreVertical,
  Pencil, Plus, Power, RotateCcw, Search, TicketPercent, Timer, Trash2, TrendingUp,
  KeyRound, LogIn, MessageSquare, Newspaper, Palette, Sparkles, UserPlus, Users, Wallet, type LucideIcon,
} from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api-client";
import { useApp, type AdminTab } from "@/store/app-store";
import { useDebounced } from "@/hooks/use-debounced";
import { themeVars } from "@/lib/platform-theme";
import type { Business, Plan, Subscription } from "@/lib/types";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

/* ================================== helpers ================================== */

function inr(n: number): string {
  return `₹${Number(n || 0).toLocaleString("en-IN")}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function titleCase(s: string): string {
  return s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Please try again";
}

const BIZ_BADGE: Record<string, string> = {
  PUBLISHED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  DRAFT: "border-border bg-muted text-muted-foreground",
  SUSPENDED: "border-red-200 bg-red-50 text-red-600",
  EXPIRED: "border-amber-200 bg-amber-50 text-amber-700",
  ARCHIVED: "border-border bg-muted text-muted-foreground",
};

const SUB_BADGE: Record<string, string> = {
  TRIALING: "border-amber-200 bg-amber-50 text-amber-700",
  ACTIVE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  PAST_DUE: "border-amber-200 bg-amber-100 text-amber-800",
  EXPIRED: "border-red-200 bg-red-50 text-red-600",
  CANCELED: "border-border bg-muted text-muted-foreground",
};

const LEAD_BADGE: Record<string, string> = {
  NEW: "border-emerald-200 bg-emerald-50 text-emerald-700",
  CONTACTED: "border-amber-200 bg-amber-50 text-amber-700",
  FOLLOW_UP: "border-amber-200 bg-amber-50 text-amber-700",
  QUALIFIED: "border-amber-200 bg-amber-100 text-amber-800",
  CONVERTED: "border-emerald-600 bg-emerald-600 text-white",
  CLOSED: "border-border bg-muted text-muted-foreground",
  SPAM: "border-red-200 bg-red-50 text-red-600",
};

function StatusBadge({ status, map }: { status: string; map: Record<string, string> }) {
  return (
    <Badge variant="outline" className={`border ${map[status] || "border-border bg-muted text-muted-foreground"}`}>
      {titleCase(status)}
    </Badge>
  );
}

function Initial({ text, className }: { text: string; className?: string }) {
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700 ${className || ""}`}
      aria-hidden="true"
    >
      {(text || "?").charAt(0).toUpperCase()}
    </span>
  );
}

function TabHeader({ title, desc, action }: { title: string; desc: string; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
      </div>
      {action}
    </div>
  );
}

function EmptyState({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-input bg-muted px-4 py-12 text-center">
      <Icon className="h-8 w-8 text-zinc-300" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint ? <p className="max-w-xs text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-12 text-center">
      <AlertTriangle className="h-8 w-8 text-red-400" aria-hidden="true" />
      <p className="max-w-sm text-sm font-medium text-red-700">{message}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" /> Retry
        </Button>
      ) : null}
    </div>
  );
}

function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2.5 rounded-xl border border-border bg-card p-4" aria-busy="true">
      <Skeleton className="h-9 w-full" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-11 w-full" />
      ))}
    </div>
  );
}

interface ConfirmReq {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  run: () => void;
}

function ConfirmDialog({ req, onOpenChange }: { req: ConfirmReq | null; onOpenChange: (open: boolean) => void }) {
  return (
    <AlertDialog open={!!req} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{req?.title}</AlertDialogTitle>
          <AlertDialogDescription>{req?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={req?.destructive ? "bg-red-600 text-white hover:bg-red-700" : "bg-emerald-600 text-white hover:bg-emerald-700"}
            onClick={() => {
              const run = req?.run;
              onOpenChange(false);
              run?.();
            }}
          >
            {req?.confirmLabel || "Confirm"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ==================================== shell =================================== */

const NAV: { id: AdminTab; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "customers", label: "Customers", icon: Users },
  { id: "plans", label: "Plans", icon: Layers },
  { id: "templates", label: "Templates", icon: LayoutTemplate },
  { id: "coupons", label: "Coupons", icon: TicketPercent },
  { id: "leads", label: "Platform Leads", icon: Inbox },
  { id: "blog", label: "Blog", icon: Newspaper },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "domains", label: "Domains", icon: Globe },
];

export default function AdminView() {
  const adminTab = useApp((s) => s.adminTab);
  const setAdminTab = useApp((s) => s.setAdminTab);
  const user = useApp((s) => s.user);
  const logout = useApp((s) => s.logout);
  const [navOpen, setNavOpen] = useState(false);
  const current = NAV.find((n) => n.id === adminTab) || NAV[0];

  function go(tab: AdminTab) {
    setAdminTab(tab);
    setNavOpen(false);
    window.scrollTo({ top: 0 });
  }

  return (
    <div className="flex min-h-screen bg-muted text-foreground">
      {/* An admin console rendered under a customer's session is a picture of a
          session that no longer exists — say so before anything is clicked. */}
      <SupportVisitBanner />
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col bg-zinc-900 lg:flex">
        <SidebarBody activeId={adminTab} onNavigate={go} email={user?.email} />
      </aside>

      <div className="flex min-h-screen w-full flex-col lg:pl-60">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-card/95 px-4 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Sheet open={navOpen} onOpenChange={setNavOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 border-zinc-800 bg-zinc-900 p-0 text-zinc-300">
                <SheetHeader className="border-b border-zinc-800">
                  <SheetTitle className="text-white">WebSetu Admin</SheetTitle>
                </SheetHeader>
                <div className="h-[calc(100%-5rem)]">
                  <SidebarBody activeId={adminTab} onNavigate={go} email={user?.email} />
                </div>
              </SheetContent>
            </Sheet>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-sm font-bold text-white lg:hidden">
              W
            </span>
            <div className="min-w-0 leading-tight">
              <p className="text-sm font-bold text-foreground">WebSetu Admin</p>
              <p className="hidden text-xs text-muted-foreground sm:block">{current.label}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <span className="hidden max-w-[220px] truncate text-xs text-muted-foreground md:block">{user?.email}</span>
            <a
              href="/"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition hover:border-emerald-300 hover:text-emerald-700"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Back to site</span>
              <span className="sm:hidden">Site</span>
            </a>
            {/* The console had no way out: "Back to site" leaves the admin
                signed in, which is the wrong default on a shared machine. */}
            <Button
              variant="outline"
              onClick={logout}
              className="h-9 rounded-lg border-border px-3 text-sm font-medium text-red-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Log out</span>
            </Button>
          </div>
        </header>

        {/* Tab content */}
        <main className="flex-1 p-4 sm:p-6">
          <ConsoleBreadcrumb root="Admin" rootHref="/admin" current={tabTitle(adminTab)} />
          {adminTab === "overview" && <OverviewTab />}
          {adminTab === "customers" && <CustomersTab />}
          {adminTab === "plans" && <PlansTab />}
          {adminTab === "templates" && <TemplatesTab />}
          {adminTab === "coupons" && <CouponsTab />}
          {adminTab === "leads" && <PlatformLeadsTab />}
          {adminTab === "blog" && <BlogTab />}
          {adminTab === "appearance" && <AppearanceTab />}
          {adminTab === "domains" && <DomainRequestsTab />}
        </main>

        {/* Sticky footer (mt-auto pushes to bottom when content is short) */}
        <footer className="mt-auto border-t border-border bg-card px-4 py-4 text-xs text-muted-foreground sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p>© {new Date().getFullYear()} WebSetu — Platform Administration</p>
            <p>Region: India · Currency: INR</p>
          </div>
        </footer>
      </div>
    </div>
  );
}

function SidebarBody({
  activeId,
  onNavigate,
  email,
}: {
  activeId: AdminTab;
  onNavigate: (t: AdminTab) => void;
  email?: string;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-4 py-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-lg font-bold text-white">W</span>
        <div className="leading-tight">
          <p className="text-sm font-bold text-white">WebSetu</p>
          <p className="text-[11px] uppercase tracking-widest text-emerald-400">Admin Console</p>
        </div>
      </div>

      <nav aria-label="Admin sections" className="flex flex-1 flex-col gap-1 px-3 py-1">
        {NAV.map((item) => {
          const active = item.id === activeId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-muted-foreground hover:bg-card/5 hover:text-white"
              }`}
            >
              <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-zinc-800 p-3">
        <div className="flex items-center gap-2.5 rounded-lg bg-card/5 px-3 py-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600/20 text-xs font-bold text-emerald-300">
            {(email || "A").charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-white">{email || "Platform admin"}</p>
            <p className="text-[11px] text-muted-foreground">Super Admin</p>
          </div>
        </div>
        <a
          href="/"
          className="mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground transition hover:bg-card/5 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to site
        </a>
      </div>
    </div>
  );
}

/* ================================== OVERVIEW ================================== */

interface PaymentRow {
  id: string; amount: number; method: string; status: string;
  invoiceNo: string; couponCode: string; description: string; createdAt: string;
}
interface StatLeadRow {
  id: string; name: string; phone: string; email: string; message: string;
  source: string; serviceName: string; status: string; createdAt: string;
  business: { name: string } | null;
}
interface AdminStats {
  customers: number; businesses: number; published: number; trialing: number;
  expired: number; leads: number; newLeads: number; activeSubs: number;
  plans: number; templates: number; monthRevenue: number; totalRevenue: number;
  recentPayments: PaymentRow[]; recentLeads: StatLeadRow[];
}

/**
 * Download a snapshot of the live database.
 *
 * The deploy no longer keeps backups on the server, so this is the only copy
 * that exists — it is taken when the admin asks for one and lands in their
 * downloads folder.
 *
 * Fetched as a blob rather than linked with a plain <a href>: a direct
 * navigation that fails would leave the admin staring at a JSON error page
 * instead of the console, with no idea whether they have a backup or not.
 */
function BackupButton() {
  const [busy, setBusy] = useState(false);

  async function download() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/backup", { credentials: "same-origin" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Backup failed (${res.status})`);
      }
      const blob = await res.blob();
      const name =
        /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] ||
        "websetu-backup.db.gz";

      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoking immediately can cancel the download in some browsers.
      setTimeout(() => URL.revokeObjectURL(href), 60_000);

      toast({
        title: "Backup downloaded",
        description: `${name} — ${(blob.size / 1024).toFixed(0)} KB. Keep it somewhere off this server.`,
      });
    } catch (e) {
      toast({ title: "Backup failed", description: errMsg(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" className="rounded-xl" disabled={busy} onClick={() => void download()}>
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <Download className="h-4 w-4" aria-hidden="true" />
      )}
      {busy ? "Preparing…" : "Download backup"}
    </Button>
  );
}

function OverviewTab() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    return api
      .get<AdminStats>("/api/admin/stats")
      .then((d) => {
        setStats(d);
        setErr("");
      })
      .catch((e: unknown) => {
        setErr(errMsg(e));
      });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const monthLabel = new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  const chartData = useMemo(
    () =>
      (stats?.recentPayments || [])
        .slice()
        .reverse()
        .map((p) => ({ label: fmtDate(p.createdAt), amount: p.amount })),
    [stats],
  );

  if (err && !stats) {
    return (
      <div>
        <TabHeader
          title="Overview"
          desc="Platform health, revenue and activity at a glance."
          action={<BackupButton />}
        />
        <ErrorState message={err} onRetry={() => void load()} />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="space-y-5" aria-busy="true">
        <Skeleton className="h-8 w-56" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 lg:col-span-2" />
          <Skeleton className="h-72" />
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-5">
          <Skeleton className="h-64 lg:col-span-3" />
          <Skeleton className="h-64 lg:col-span-2" />
        </div>
      </div>
    );
  }

  const kpis: { label: string; value: number; icon: LucideIcon; tone: string }[] = [
    { label: "Total Customers", value: stats.customers, icon: Users, tone: "bg-emerald-50 text-emerald-600" },
    { label: "Published Websites", value: stats.published, icon: Globe, tone: "bg-emerald-50 text-emerald-600" },
    { label: "Trial Websites", value: stats.trialing, icon: Timer, tone: "bg-amber-50 text-amber-600" },
    { label: "Expired", value: stats.expired, icon: CalendarX2, tone: "bg-red-50 text-red-500" },
    { label: "Active Subscriptions", value: stats.activeSubs, icon: BadgeCheck, tone: "bg-emerald-50 text-emerald-600" },
    { label: "New Leads this month", value: stats.newLeads, icon: UserPlus, tone: "bg-amber-50 text-amber-600" },
  ];

  const miniStats: { label: string; value: number; icon: LucideIcon }[] = [
    { label: "Pricing plans", value: stats.plans, icon: Layers },
    { label: "Templates", value: stats.templates, icon: LayoutTemplate },
    { label: "Websites", value: stats.businesses, icon: Globe },
    { label: "Leads (all time)", value: stats.leads, icon: Inbox },
  ];

  return (
    <div className="space-y-6">
      <TabHeader
        title="Overview"
        desc="Platform health, revenue and activity at a glance."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <BackupButton />
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> Refresh
            </Button>
          </div>
        }
      />

      {/* Revenue highlight + catalog quick stats */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4 text-emerald-600" aria-hidden="true" /> Revenue
            </CardTitle>
            <CardDescription>Successful payments received on the platform</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="text-xs text-muted-foreground">{monthLabel}</p>
                <p className="text-3xl font-bold tracking-tight text-emerald-700">{inr(stats.monthRevenue)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">All-time revenue</p>
                <p className="text-xl font-semibold text-foreground">{inr(stats.totalRevenue)}</p>
              </div>
            </div>
            <div className="mt-4 h-24">
              {chartData.length >= 2 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                    <XAxis dataKey="label" hide />
                    <YAxis hide />
                    <Tooltip
                      formatter={(v) => inr(Number(v))}
                      contentStyle={{ borderRadius: 10, borderColor: "#e4e4e7", fontSize: 12 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="amount"
                      stroke="#059669"
                      strokeWidth={2.5}
                      dot={{ r: 2.5, fill: "#059669", strokeWidth: 0 }}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                  <TrendingUp className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Sparkline appears once there are two or more payments
                </div>
              )}
            </div>
            <Separator className="my-4" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {miniStats.map((m) => (
                <div key={m.label} className="rounded-lg bg-muted p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <m.icon className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> {m.label}
                  </div>
                  <p className="mt-1 text-lg font-bold text-foreground">{m.value.toLocaleString("en-IN")}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Payments</CardTitle>
            <CardDescription>Latest {stats.recentPayments.length} transactions</CardDescription>
          </CardHeader>
          <CardContent className="max-h-72 overflow-y-auto">
            {stats.recentPayments.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No payments yet</p>
            ) : (
              <ul className="space-y-3">
                {stats.recentPayments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{p.invoiceNo || "—"}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {p.method} {p.couponCode ? `· ${p.couponCode}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold text-emerald-700">{inr(p.amount)}</p>
                      <p className="text-xs text-muted-foreground">{fmtDate(p.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-border bg-card p-4">
            <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${k.tone}`}>
              <k.icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <p className="mt-3 text-2xl font-bold tracking-tight text-foreground">
              {k.value.toLocaleString("en-IN")}
            </p>
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Recent payments table + recent leads */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent Payments</CardTitle>
            <CardDescription>Newest transactions across all tenants</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.recentPayments.length === 0 ? (
              <EmptyState icon={Wallet} title="No payments yet" hint="Payments appear when tenants subscribe to a plan." />
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[640px]">
                  <TableHeader>
                    <TableRow className="bg-muted hover:bg-muted">
                      <TableHead>Invoice</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.recentPayments.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="whitespace-nowrap font-mono text-xs font-medium text-foreground">
                          {p.invoiceNo || "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-semibold text-emerald-700">{inr(p.amount)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
                            {p.method}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate text-sm text-muted-foreground" title={p.description}>
                          {p.description || "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right text-sm text-muted-foreground">
                          {fmtDate(p.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent Leads</CardTitle>
            <CardDescription>Enquiries captured on tenant websites</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.recentLeads.length === 0 ? (
              <EmptyState icon={Inbox} title="No leads yet" hint="Leads show up as visitors enquire on published sites." />
            ) : (
              <ul className="divide-y divide-zinc-100">
                {stats.recentLeads.map((l) => (
                  <li key={l.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <Initial text={l.name} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium text-foreground">{l.name}</p>
                        <StatusBadge status={l.status} map={LEAD_BADGE} />
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {l.business?.name || "—"} · {l.phone}
                      </p>
                    </div>
                    <span className="shrink-0 pt-0.5 text-xs text-muted-foreground">{fmtDate(l.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ================================== CUSTOMERS ================================== */

/** Paging counts the customers endpoint reports alongside the rows. */
interface CustomersMeta { total: number; take: number; skip: number }

const CUSTOMERS_PAGE_SIZE = 50;
/** The endpoint caps `take` at 200, so that is the most one export can carry. */
const EXPORT_MAX = 200;

interface CustomerRow {
  id: string; name: string; email: string; createdAt: string;
  business: Business | null; subscription: Subscription | null;
  usage: {
    services: number; products: number; gallery: number; leads: number; aiUsed: number;
    domains: number; domainCredits: number;
  } | null;
}

/**
 * CSV cell escaping. A leading =, +, - or @ makes Excel/Sheets treat the value
 * as a formula, so lead-supplied text is prefixed with a quote first.
 */
function csvCell(v: unknown): string {
  const raw = String(v ?? "");
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** /api/admin/customers has no revenue aggregates — those columns are skipped. */
function exportCustomersCsv(rows: CustomerRow[]) {
  const head = [
    "Name", "Email", "Business", "Website (slug)", "Website status", "Plan", "Status",
    "Services", "Products", "Photos", "Leads", "AI used", "Renews / trial ends", "Created",
  ];
  const csvRows = rows.map((r) => [
    r.name,
    r.email,
    r.business?.name || "",
    r.business?.slug || "",
    r.business?.status || "",
    r.subscription?.plan?.name || "",
    r.subscription?.status || "",
    r.usage?.services ?? "",
    r.usage?.products ?? "",
    r.usage?.gallery ?? "",
    r.usage?.leads ?? "",
    r.usage?.aiUsed ?? "",
    r.subscription?.renewsAt
      ? new Date(r.subscription.renewsAt).toLocaleDateString("en-IN")
      : r.subscription?.trialEndsAt
        ? `trial ends ${new Date(r.subscription.trialEndsAt).toLocaleDateString("en-IN")}`
        : "",
    new Date(r.createdAt).toLocaleString("en-IN"),
  ].map(csvCell).join(","));
  const csv = [head.map(csvCell).join(","), ...csvRows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "websetu-customers.csv";
  a.click();
  URL.revokeObjectURL(url);
}


/** "3/10 AI" style allowance summary, or "unlimited" where the plan says so. */
function planAllowance(row: CustomerRow): string {
  const credits = row.subscription?.plan?.aiCredits ?? 0;
  const used = row.usage?.aiUsed ?? 0;
  if (credits < 0) return `${used} AI used`;
  return `${used}/${credits} AI`;
}

/** What the account is running on: a trial that ends, or a paid period. */
function renewalLabel(row: CustomerRow): string {
  const sub = row.subscription;
  if (!sub) return "—";
  if (sub.status === "TRIALING" && sub.trialEndsAt) {
    const days = Math.ceil((new Date(sub.trialEndsAt).getTime() - Date.now()) / 86400000);
    return days >= 0 ? `Trial · ${days}d left` : `Trial ended ${fmtDate(sub.trialEndsAt)}`;
  }
  if (sub.renewsAt) return `Paid until ${fmtDate(sub.renewsAt)}`;
  return sub.status === "ACTIVE" ? "Active" : "—";
}

function CustomersTab() {
  const openSite = useApp((s) => s.openSite);
  // Which customer's palette list is being tailored, if any.
  const [paletteTarget, setPaletteTarget] = useState<{ id: string; name: string } | null>(null);
  // Which customer is being granted paid-for custom domains, if any.
  const [domainTarget, setDomainTarget] = useState<
    { id: string; name: string; credits: number; connected: number } | null
  >(null);
  const [creating, setCreating] = useState(false);
  // Shown once after creating an account or resetting a password.
  const [credentials, setCredentials] = useState<{ email: string; password: string; heading: string } | null>(null);
  const [busyRow, setBusyRow] = useState<string | null>(null);
  // Plans for the inline switcher; a failure just leaves the current value shown.
  const [planOptions, setPlanOptions] = useState<Plan[]>([]);
  const [rows, setRows] = useState<CustomerRow[] | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  // Paging state. The server already searched and paged this list — the browser
  // holds one page and the count the server reported, nothing more.
  const [meta, setMeta] = useState<CustomersMeta>({ total: 0, take: CUSTOMERS_PAGE_SIZE, skip: 0 });
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const debouncedQ = useDebounced(q, 350);
  const [confirm, setConfirm] = useState<ConfirmReq | null>(null);
  // Deleting an account is permanent and takes the customer's whole site with
  // it, so it gets its own dialog with the email typed out rather than the
  // one-click confirm the other actions use.
  const [deleteUser, setDeleteUser] = useState<CustomerRow | null>(null);
  const [deleteTyped, setDeleteTyped] = useState("");
  const [deleting, setDeleting] = useState(false);

  /**
   * Fetch one page from the server, with the search term applied in SQL.
   *
   * This used to be `api.get("/api/admin/customers")` with no parameters, and
   * the search was a `.filter()` over whatever came back. The endpoint returns
   * at most 100 rows by default, so customer 101 onwards could not be found,
   * listed, or exported — silently, with the header still reporting
   * "Showing 100 of 100 customers". The endpoint had grown SQL search and
   * paging; this screen was never connected to them.
   */
  // Guards against a slow early response overwriting a fast later one — the
  // classic search race where the results for "sha" land after "sharma".
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    const params = new URLSearchParams({
      take: String(CUSTOMERS_PAGE_SIZE),
      skip: String(page * CUSTOMERS_PAGE_SIZE),
    });
    if (debouncedQ.trim()) params.set("q", debouncedQ.trim());
    try {
      const res = await api.raw<CustomerRow[], CustomersMeta>(`/api/admin/customers?${params}`);
      if (id !== requestId.current) return; // a newer request already answered
      setRows(res.data);
      setMeta(res.meta);
      setErr("");
    } catch (e) {
      if (id !== requestId.current) return;
      setErr(errMsg(e));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [page, debouncedQ]);

  useEffect(() => {
    // Fetch on change; `load` flips its own loading flag before the first await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    api
      .get<Plan[]>("/api/admin/plans")
      .then((d) => {
        if (!cancelled) setPlanOptions(d.filter((p) => p.active));
      })
      .catch(() => {
        /* the row still shows the assigned plan */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The rows on screen ARE the result — the server did the filtering.
  const filtered = rows ?? [];
  const totalPages = Math.max(1, Math.ceil(meta.total / CUSTOMERS_PAGE_SIZE));
  const from = meta.total === 0 ? 0 : page * CUSTOMERS_PAGE_SIZE + 1;
  const to = Math.min(meta.total, page * CUSTOMERS_PAGE_SIZE + filtered.length);

  /** Change the search and return to page 1 — page 3 of the old result set is
   *  not page 3 of the new one. */
  function applySearch(next: string) {
    setQ(next);
    setPage(0);
  }

  /**
   * Export every customer the current search describes — not just the page on
   * screen. Exporting `filtered` used to mean the file silently stopped at the
   * first 100 accounts, which is the kind of wrong that only shows up when
   * somebody reconciles the spreadsheet against the billing total.
   */
  async function exportAll() {
    setExporting(true);
    try {
      const params = new URLSearchParams({ take: String(EXPORT_MAX) });
      if (debouncedQ.trim()) params.set("q", debouncedQ.trim());
      const { data } = await api.raw<CustomerRow[], CustomersMeta>(`/api/admin/customers?${params}`);
      exportCustomersCsv(data);
      if (meta.total > data.length) {
        toast({
          title: `Exported the first ${data.length}`,
          description: `${meta.total} customers match. Narrow the search to export the rest.`,
        });
      }
    } catch (e) {
      toast({ title: "Export failed", description: errMsg(e), variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  function askToggleStatus(r: CustomerRow) {
    const biz = r.business;
    if (!biz) return;
    const suspending = biz.status !== "SUSPENDED";
    setConfirm({
      title: suspending ? "Suspend website?" : "Activate website?",
      description: suspending
        ? `${biz.name} will go offline immediately and the owner will be notified. You can reactivate it any time.`
        : `${biz.name} will be set back to Published and go live again.`,
      confirmLabel: suspending ? "Suspend" : "Activate",
      destructive: suspending,
      run: () => {
        void api
          .patch(`/api/admin/businesses/${biz.id}`, { status: suspending ? "SUSPENDED" : "PUBLISHED" })
          .then(() => {
            toast({
              title: suspending ? "Website suspended" : "Website activated",
              description: biz.name,
            });
            return load();
          })
          .catch((e: unknown) =>
            toast({ title: "Action failed", description: errMsg(e), variant: "destructive" }),
          );
      },
    });
  }

  function askDelete(r: CustomerRow) {
    const biz = r.business;
    if (!biz) return;
    setConfirm({
      title: "Delete website?",
      description: `This permanently deletes ${biz.name} — its website content, leads and analytics. The customer account remains. This cannot be undone.`,
      confirmLabel: "Delete forever",
      destructive: true,
      run: () => {
        void api
          .del(`/api/admin/businesses/${biz.id}`)
          .then(() => {
            toast({ title: "Website deleted", description: `${biz.name} and all its data were removed.` });
            return load();
          })
          .catch((e: unknown) =>
            toast({ title: "Delete failed", description: errMsg(e), variant: "destructive" }),
          );
      },
    });
  }

  /** Permanently remove the account itself, not just its website. */
  async function deleteCustomer() {
    const row = deleteUser;
    if (!row) return;
    setDeleting(true);
    try {
      const res = await api.del<{ paymentsKept: number }>(`/api/admin/customers/${row.id}`);
      toast({
        title: "Customer deleted",
        description: res.paymentsKept
          ? `${row.email} and their website were removed. ${res.paymentsKept} payment record${res.paymentsKept === 1 ? "" : "s"} kept for your accounts.`
          : `${row.email} and their website were removed.`,
      });
      setDeleteUser(null);
      setDeleteTyped("");
      // Deleting the only row on the last page would otherwise leave the admin
      // staring at an empty page 3 with no way back except Previous.
      if (rows?.length === 1 && page > 0) setPage((p) => p - 1);
      else await load();
    } catch (e) {
      toast({ title: "Could not delete", description: errMsg(e), variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  }

  async function resetPassword(row: CustomerRow) {
    setBusyRow(row.id);
    try {
      const res = await api.post<{ password: string }>(`/api/admin/customers/${row.id}/password`);
      setCredentials({ email: row.email, password: res.password, heading: "New password issued" });
    } catch (e) {
      toast({ title: "Could not reset the password", description: errMsg(e), variant: "destructive" });
    } finally {
      setBusyRow(null);
    }
  }

  /**
   * Open the customer's own dashboard in a new tab.
   *
   * The tab is opened BEFORE the request, not after: a window.open() that does
   * not happen inside the click's own event handler is a popup as far as the
   * browser is concerned, and gets blocked. So the tab is claimed first and
   * pointed at the dashboard once the session has actually been swapped.
   *
   * Worth being clear about what "new tab" can and cannot mean here: a browser
   * has one cookie jar, so this tab is now signed in as the customer too — the
   * new tab changes where the customer's dashboard is visible, not who the
   * browser is. That is what the banner this raises is for: one click puts the
   * admin session back, instead of logging out and signing in again.
   */
  async function loginAs(row: CustomerRow) {
    // NO "noopener" here, deliberately. It sounds like the safe choice and it is
    // the opposite of one for this call: window.open() returns null whenever
    // noopener is set — that is what the flag means, the opener gets no handle —
    // so there was nothing left to point at /dashboard and the new tab sat on
    // about:blank forever. noopener protects against a page you do not control
    // reaching back through window.opener; this is our own dashboard, on our own
    // origin.
    //
    // Opened empty and pointed afterwards, rather than straight at /dashboard,
    // because the session swap has not happened yet at click time: a tab opened
    // on the URL now would load as the ADMIN and bounce to the wrong place.
    // Opening it must still happen inside the click's own handler, or the
    // browser treats it as a popup and blocks it — hence empty first, await
    // second.
    const tab = window.open("", "_blank");
    if (tab) {
      // Something to look at for the second the request takes.
      tab.document.write(
        '<!doctype html><meta charset="utf-8"><title>Opening…</title>' +
          '<body style="margin:0;display:grid;place-items:center;height:100vh;' +
          'font:15px system-ui,sans-serif;color:#3f3f46">Opening ' +
          row.name.replace(/[<>&]/g, "") +
          "'s dashboard…</body>",
      );
      tab.document.close();
    }
    setBusyRow(row.id);
    try {
      // The response sets the session cookie; there is nothing to store here.
      await api.post<{ token: string }>(`/api/admin/customers/${row.id}/impersonate`);
      if (tab) tab.location.href = "/dashboard";
      else {
        // Popups blocked. Falling back to this tab is better than a click that
        // silently does nothing.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/dashboard");
        return;
      }
      // The banner is driven by the server (/api/auth/me reports the parked
      // admin session), so this tab only has to go and ask again.
      await useApp.getState().hydrate();
    } catch (e) {
      tab?.close();
      toast({ title: "Could not open that account", description: errMsg(e), variant: "destructive" });
    } finally {
      setBusyRow(null);
    }
  }

  const [activateTarget, setActivateTarget] = useState<CustomerRow | null>(null);

  async function subscriptionAction(row: CustomerRow, body: Record<string, unknown>, done: string) {
    if (!row.business) return;
    setBusyRow(row.id);
    try {
      await api.patch(`/api/admin/businesses/${row.business.id}/subscription`, body);
      toast({ title: done, description: row.business.name });
      await load();
    } catch (e) {
      toast({ title: "Could not update the subscription", description: errMsg(e), variant: "destructive" });
    } finally {
      setBusyRow(null);
    }
  }

  async function makeCustomPlan(row: CustomerRow) {
    if (!row.business) return;
    setBusyRow(row.id);
    try {
      const res = await api.post<{ plan: Plan; created: boolean }>(
        `/api/admin/businesses/${row.business.id}/custom-plan`,
      );
      toast({
        title: res.created ? "Dedicated plan created" : "Dedicated plan reassigned",
        description: `${res.plan.name} — edit its limits under Plans.`,
      });
      await load();
    } catch (e) {
      toast({ title: "Could not create a dedicated plan", description: errMsg(e), variant: "destructive" });
    } finally {
      setBusyRow(null);
    }
  }

  return (
    <div>
      <TabHeader
        title="Customers"
        desc="All customer accounts, their websites and subscriptions."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button className="rounded-xl" onClick={() => setCreating(true)}>
              <UserPlus className="h-4 w-4" aria-hidden="true" /> Add customer
            </Button>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => void exportAll()}
              disabled={meta.total === 0 || exporting}
              aria-label="Export customers as CSV"
            >
              <Download className="h-4 w-4" aria-hidden="true" /> Export CSV
            </Button>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                value={q}
                onChange={(e) => applySearch(e.target.value)}
                placeholder="Search name, email or business…"
                className="w-full pl-9 sm:w-72"
                aria-label="Search customers"
              />
            </div>
          </div>
        }
      />

      {err && !rows ? (
        <ErrorState message={err} onRetry={() => void load()} />
      ) : !rows ? (
        <TableSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={q ? "No customers match your search" : "No customers yet"}
          hint={
            q
              ? "Try a different name, email or business."
              : "Customers appear here after they sign up — or add one yourself."
          }
        />
      ) : (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            Showing {from}–{to} of {meta.total}{debouncedQ.trim() ? " matching" : ""} customer{meta.total === 1 ? "" : "s"}
          </p>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="overflow-x-auto">
              <Table className="min-w-[1180px]">
                <TableHeader>
                  <TableRow className="bg-muted hover:bg-muted">
                    <TableHead>Customer</TableHead>
                    <TableHead>Business</TableHead>
                    <TableHead>Website</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>Renews / trial</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="w-14 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Initial text={r.name} />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{r.name}</p>
                            <p className="truncate text-xs text-muted-foreground">{r.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {r.business ? (
                          <div className="min-w-0">
                            <p className="truncate text-sm text-foreground">{r.business.name}</p>
                            <p className="truncate font-mono text-xs text-muted-foreground">/{r.business.slug}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">No website yet</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.business ? (
                          <StatusBadge status={r.business.status} map={BIZ_BADGE} />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.subscription ? (
                          <div className="flex flex-col items-start gap-1">
                            {/* Changing a plan is the most common admin action,
                                so it happens in the row rather than in a menu. */}
                            <Select
                              value={r.subscription.planId}
                              disabled={busyRow === r.id}
                              onValueChange={(planId) => {
                                if (planId !== r.subscription?.planId) {
                                  void subscriptionAction(r, { planId }, "Plan changed");
                                }
                              }}
                            >
                              <SelectTrigger className="h-8 w-[150px] text-xs" aria-label={`Plan for ${r.name}`}>
                                <SelectValue placeholder="Plan" />
                              </SelectTrigger>
                              <SelectContent>
                                {planOptions
                                  .filter((p) => !p.customForBusinessId || p.customForBusinessId === r.business?.id)
                                  .map((p) => (
                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                            <StatusBadge status={r.subscription.status} map={SUB_BADGE} />
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">No subscription</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.usage ? (
                          <div className="text-xs text-muted-foreground">
                            <p>
                              <span className="font-medium text-foreground">
                                {r.usage.services + r.usage.products}
                              </span>{" "}
                              items ·{" "}
                              <span className="font-medium text-foreground">{r.usage.gallery}</span> photos
                            </p>
                            <p className="mt-0.5">
                              <span className="font-medium text-foreground">{r.usage.leads}</span> leads ·{" "}
                              {planAllowance(r)}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {renewalLabel(r)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{fmtDate(r.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={`Actions for ${r.name}`}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel>Manage</DropdownMenuLabel>
                            <DropdownMenuItem
                              disabled={!r.business}
                              onClick={() => {
                                if (r.business) openSite(r.business.slug, "dashboard");
                              }}
                            >
                              <ExternalLink className="h-4 w-4" aria-hidden="true" /> View site
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={busyRow === r.id}
                              onClick={() => void loginAs(r)}
                            >
                              <LogIn className="h-4 w-4" aria-hidden="true" /> Log in as customer
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={busyRow === r.id}
                              onClick={() => void resetPassword(r)}
                            >
                              <KeyRound className="h-4 w-4" aria-hidden="true" /> Reset password
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel>Subscription</DropdownMenuLabel>
                            <DropdownMenuItem
                              disabled={!r.subscription || busyRow === r.id}
                              onClick={() => void subscriptionAction(r, { extendTrialDays: 7 }, "Trial extended by 7 days")}
                            >
                              <Timer className="h-4 w-4" aria-hidden="true" /> Extend trial +7 days
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={!r.subscription || busyRow === r.id}
                              onClick={() => setActivateTarget(r)}
                            >
                              <Wallet className="h-4 w-4" aria-hidden="true" /> Activate plan…
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={!r.subscription || busyRow === r.id}
                              onClick={() => void makeCustomPlan(r)}
                            >
                              <Sparkles className="h-4 w-4" aria-hidden="true" /> Dedicated plan
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={!r.business}
                              onClick={() => {
                                if (r.business) setPaletteTarget({ id: r.business.id, name: r.business.name });
                              }}
                            >
                              <Palette className="h-4 w-4" aria-hidden="true" /> Palettes
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={!r.business}
                              onClick={() => {
                                if (!r.business) return;
                                setDomainTarget({
                                  id: r.business.id,
                                  name: r.business.name,
                                  credits: r.usage?.domainCredits ?? 0,
                                  connected: r.usage?.domains ?? 0,
                                });
                              }}
                            >
                              <Globe className="h-4 w-4" aria-hidden="true" /> Custom domains
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem disabled={!r.business} onClick={() => askToggleStatus(r)}>
                              {r.business?.status === "SUSPENDED" ? (
                                <Power className="h-4 w-4" aria-hidden="true" />
                              ) : (
                                <Ban className="h-4 w-4" aria-hidden="true" />
                              )}
                              {r.business?.status === "SUSPENDED" ? "Activate" : "Suspend"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              disabled={!r.business}
                              className="text-red-600 focus:bg-red-50 focus:text-red-600"
                              onClick={() => askDelete(r)}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete website
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-600 focus:bg-red-50 focus:text-red-600"
                              onClick={() => { setDeleteTyped(""); setDeleteUser(r); }}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete customer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
          {totalPages > 1 ? (
            <div className="mt-3 flex items-center justify-between gap-3">
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl"
                disabled={page === 0 || loading}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous
              </Button>
              <span className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</span>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl"
                disabled={page + 1 >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          ) : null}
          <ConfirmDialog req={confirm} onOpenChange={(o) => !o && setConfirm(null)} />
        </>
      )}
      {/*
        Account deletion is the one action here with no undo and no backup, so it
        does not share the one-click ConfirmDialog. The admin has to type the
        customer's email — enough friction that the wrong row cannot be deleted
        by muscle memory.
      */}
      <Dialog
        open={!!deleteUser}
        onOpenChange={(o) => { if (!o && !deleting) { setDeleteUser(null); setDeleteTyped(""); } }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600">Delete this customer permanently?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  This removes <strong>{deleteUser?.name || deleteUser?.email}</strong> and everything
                  they own{deleteUser?.business ? <> — including the website <strong>{deleteUser.business.name}</strong>, its pages, photos, leads and analytics</> : null}.
                  They will not be able to log in again.
                </p>
                {deleteUser?.usage?.leads ? (
                  <p className="text-amber-700">
                    {deleteUser.usage.leads} saved {deleteUser.usage.leads === 1 ? "enquiry" : "enquiries"} will
                    be deleted with them. Export the leads first if you need them.
                  </p>
                ) : null}
                {deleteUser?.subscription?.status === "ACTIVE" ? (
                  <p className="text-amber-700">
                    This customer has an active subscription. Their payment records and invoices are
                    kept for your accounts, but cancel any recurring billing separately.
                  </p>
                ) : null}
                <p className="text-muted-foreground">
                  Payment history is never deleted. This cannot be undone — there is no backup.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-confirm-email">
              Type <span className="font-mono text-foreground">{deleteUser?.email}</span> to confirm
            </Label>
            <Input
              id="delete-confirm-email"
              autoComplete="off"
              value={deleteTyped}
              onChange={(e) => setDeleteTyped(e.target.value)}
              placeholder={deleteUser?.email}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={deleting}
              onClick={() => { setDeleteUser(null); setDeleteTyped(""); }}
            >
              Cancel
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={deleting || deleteTyped.trim().toLowerCase() !== (deleteUser?.email ?? "").toLowerCase()}
              onClick={deleteCustomer}
            >
              {deleting ? "Deleting..." : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CustomerPaletteDialog target={paletteTarget} onClose={() => setPaletteTarget(null)} />
      <ActivatePlanDialog
        // Remounted per customer so the length and amount never carry over.
        key={activateTarget?.id ?? "none"}
        row={activateTarget}
        onClose={() => setActivateTarget(null)}
        onConfirm={async (body, label) => {
          const row = activateTarget;
          setActivateTarget(null);
          if (row) await subscriptionAction(row, body, label);
        }}
      />

      <DomainCreditsDialog
        target={domainTarget}
        onClose={() => setDomainTarget(null)}
        onSaved={() => {
          setDomainTarget(null);
          void load();
        }}
      />
      <AddCustomerDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(created) => {
          setCreating(false);
          setCredentials({ email: created.email, password: created.password, heading: "Customer created" });
          void load();
        }}
      />
      <CredentialsDialog data={credentials} onClose={() => setCredentials(null)} />
    </div>
  );
}

interface CustomerPaletteData {
  business: { id: string; name: string };
  plan: { name: string; maxPalettes: number } | null;
  override: string[];
  effective: string[];
  source: "override" | "plan" | "default";
  library: PaletteRow[];
}

/**
 * Grant a customer the custom domains they have paid for.
 *
 * Domains are sold as an add-on rather than bundled into a plan, so this is the
 * step that actually unlocks the feature for someone — after money has changed
 * hands, outside the product. -1 means unlimited, for a customer on a bespoke
 * arrangement.
 */

/**
 * Turning a customer on for a real length of time.
 *
 * "Mark as paid" always added a month, so a year's payment had to be clicked
 * twelve times and anything else — two years, a one-off three months — could
 * not be recorded at all. The length is chosen here, the exact end date is
 * shown before confirming, and the amount defaults to the plan's price for
 * that length while staying editable for a discount actually given.
 */
function ActivatePlanDialog({
  row,
  onClose,
  onConfirm,
}: {
  row: CustomerRow | null;
  onClose: () => void;
  onConfirm: (body: Record<string, unknown>, label: string) => Promise<void>;
}) {
  const [count, setCount] = useState("1");
  const [unit, setUnit] = useState<"months" | "years">("months");
  const [amount, setAmount] = useState("");
  const [touchedAmount, setTouchedAmount] = useState(false);

  const plan = row?.subscription?.plan ?? null;
  const n = Math.max(1, Math.min(120, Math.trunc(Number(count) || 0)));
  const months = unit === "years" ? n * 12 : n;
  const yearly = months >= 12;

  // Calendar months, not 30-day blocks: a year bought today ends on today's
  // date next year, which is what the customer will expect to see.
  const base = (() => {
    const renews = row?.subscription?.renewsAt ? new Date(row.subscription.renewsAt) : null;
    return renews && renews > new Date() ? renews : new Date();
  })();
  const end = (() => {
    const d = new Date(base);
    d.setMonth(d.getMonth() + months);
    return d;
  })();
  const days = Math.max(1, Math.round((end.getTime() - base.getTime()) / 86_400_000));

  const suggested = plan
    ? yearly
      ? Math.round((plan.priceYearly / 12) * months)
      : plan.priceMonthly * months
    : 0;
  const finalAmount = touchedAmount && amount.trim() !== "" ? Number(amount) : suggested;

  const PRESETS: { label: string; count: string; unit: "months" | "years" }[] = [
    { label: "1 month", count: "1", unit: "months" },
    { label: "3 months", count: "3", unit: "months" },
    { label: "6 months", count: "6", unit: "months" },
    { label: "1 year", count: "1", unit: "years" },
    { label: "2 years", count: "2", unit: "years" },
  ];

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Activate plan</DialogTitle>
          <DialogDescription>
            {row?.business?.name ?? row?.name} — records the payment and keeps the site live for the
            length you choose.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => {
              const active = count === p.count && unit === p.unit;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    setCount(p.count);
                    setUnit(p.unit);
                    setTouchedAmount(false);
                  }}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    active ? "border-emerald-600 bg-emerald-600 text-white" : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              How many
              <Input
                inputMode="numeric"
                value={count}
                onChange={(e) => {
                  setCount(e.target.value.replace(/\D/g, ""));
                  setTouchedAmount(false);
                }}
                className="rounded-xl"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Months or years
              <select
                value={unit}
                onChange={(e) => {
                  setUnit(e.target.value as "months" | "years");
                  setTouchedAmount(false);
                }}
                className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
              >
                <option value="months">Months</option>
                <option value="years">Years</option>
              </select>
            </label>
          </div>

          <label className="block space-y-1 text-xs font-medium text-muted-foreground">
            Amount received (₹)
            <Input
              inputMode="decimal"
              value={touchedAmount ? amount : String(suggested)}
              onChange={(e) => {
                setTouchedAmount(true);
                setAmount(e.target.value.replace(/[^\d.]/g, ""));
              }}
              className="rounded-xl"
            />
          </label>

          <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">
            Billed as <strong>{yearly ? "yearly" : "monthly"}</strong> · stays live until{" "}
            <strong className="text-foreground">
              {end.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
            </strong>
            {row?.subscription?.renewsAt && new Date(row.subscription.renewsAt) > new Date()
              ? " (added to the time they already have)"
              : ""}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={() =>
              void onConfirm(
                {
                  markPaid: true,
                  cycle: yearly ? "YEARLY" : "MONTHLY",
                  extendPeriodDays: days,
                  amount: Number.isFinite(finalAmount) ? finalAmount : suggested,
                },
                `Activated for ${n} ${unit}`,
              )
            }
          >
            Activate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DomainCreditsDialog({
  target,
  onClose,
  onSaved,
}: {
  target: { id: string; name: string; credits: number; connected: number } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {target ? <DomainCreditsBody key={target.id} target={target} onSaved={onSaved} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function DomainCreditsBody({
  target,
  onSaved,
}: {
  target: { id: string; name: string; credits: number; connected: number };
  onSaved: () => void;
}) {
  const [value, setValue] = useState(String(target.credits));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.patch(`/api/admin/businesses/${target.id}`, { domainCredits: Number(value) });
      toast({
        title: "Domain allowance updated",
        description: `${target.name} can now connect ${Number(value) === -1 ? "unlimited" : value} domain(s).`,
      });
      onSaved();
    } catch (e) {
      toast({ title: "Could not update", description: errMsg(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Custom domains — {target.name}</DialogTitle>
        <DialogDescription>
          How many of their own domains this customer may connect. They have {target.connected}{" "}
          connected right now.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {[0, 1, 2, 3, -1].map((n) => (
            <Button
              key={n}
              type="button"
              size="sm"
              variant={String(n) === value ? "default" : "outline"}
              className="rounded-xl"
              onClick={() => setValue(String(n))}
            >
              {n === -1 ? "Unlimited" : n === 0 ? "None" : n}
            </Button>
          ))}
        </div>
        <Input
          type="number"
          min={-1}
          max={100}
          className="rounded-xl"
          aria-label="Domain allowance"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Lowering this below {target.connected} is refused — disconnect their domains first, so a
          live site never goes dark as a side effect of an edit here.
        </p>
      </div>

      <DialogFooter>
        <Button disabled={saving || value === ""} onClick={() => void save()} className="rounded-xl">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save allowance"}
        </Button>
      </DialogFooter>
    </>
  );
}

/**
 * Tailor one customer's palette choices. With nothing ticked the customer
 * follows their plan's allowance; ticking specific palettes pins their picker
 * to exactly those, regardless of plan.
 */
function CustomerPaletteDialog({
  target,
  onClose,
}: {
  target: { id: string; name: string } | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {/* Keyed on the customer so opening a different one starts from scratch
            instead of resetting state inside an effect. */}
        {target ? <CustomerPaletteBody key={target.id} target={target} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function CustomerPaletteBody({
  target,
  onClose,
}: {
  target: { id: string; name: string };
  onClose: () => void;
}) {
  const [data, setData] = useState<CustomerPaletteData | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .get<CustomerPaletteData>(`/api/admin/businesses/${target.id}/palettes`)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setSelected(d.override);
      })
      .catch((e) => {
        if (!cancelled) setError(errMsg(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [target.id]);

  function toggle(id: string) {
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function save(ids: string[]) {
    setSaving(true);
    try {
      await api.put(`/api/admin/businesses/${target.id}/palettes`, { paletteIds: ids });
      toast({
        title: ids.length ? "Palettes updated" : "Back to the plan allowance",
        description: ids.length
          ? `${target.name} can now choose from ${ids.length} palette${ids.length === 1 ? "" : "s"}.`
          : `${target.name} follows their plan again.`,
      });
      onClose();
    } catch (e) {
      toast({ title: "Could not save", description: errMsg(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const planAllowance = data?.plan
    ? data.plan.maxPalettes === -1
      ? `${data.plan.name}: all palettes`
      : `${data.plan.name}: ${data.plan.maxPalettes} palettes`
    : "No active plan";

  return (
    <>
        <DialogHeader>
          <DialogTitle>Palettes for {target.name}</DialogTitle>
          <DialogDescription>
            {planAllowance}. Tick palettes to give this customer a specific set instead, or clear the
            selection to follow the plan.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
          </div>
        ) : error ? (
          <ErrorState message={error} />
        ) : data ? (
          <>
            <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
              {data.library.map((p) => {
                const checked = selected.includes(p.id);
                const byPlan = !selected.length && data.effective.includes(p.id);
                return (
                  <label
                    key={p.id}
                    className={
                      "flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 transition " +
                      (checked ? "border-zinc-900 bg-muted" : "border-border hover:border-input")
                    }
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(p.id)}
                      className="h-4 w-4 shrink-0 accent-zinc-900"
                    />
                    <span className="flex shrink-0 overflow-hidden rounded-md ring-1 ring-black/5">
                      {p.colors.map((c) => (
                        <span key={c} className="h-7 w-3.5" style={{ backgroundColor: c }} />
                      ))}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{p.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{p.mood}</span>
                    </span>
                    {byPlan ? (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        via plan
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {selected.length
                ? `${selected.length} palette${selected.length === 1 ? "" : "s"} pinned for this customer.`
                : "Nothing pinned — the plan allowance applies."}
            </p>
          </>
        ) : null}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="ghost"
            disabled={saving || !data || !data.override.length}
            onClick={() => void save([])}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Follow plan
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={() => void save(selected)} disabled={saving || !data}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
              Save
            </Button>
          </div>
        </DialogFooter>
    </>
  );
}

/* ==================================== PLANS ==================================== */

interface PlanForm {
  name: string; tagline: string; priceMonthly: string; priceYearly: string;
  features: string; maxPages: string; aiCredits: string; maxPalettes: string;
  maxDomains: string; maxThemeChanges: string;
  popular: boolean; active: boolean;
}

const EMPTY_PLAN: PlanForm = {
  name: "", tagline: "", priceMonthly: "499", priceYearly: "4999", features: "",
  maxPages: "10", aiCredits: "20", maxPalettes: "-1",
  // Both default to unlimited: metering a feature nobody asked to meter is a
  // support ticket, not a business model.
  maxDomains: "-1", maxThemeChanges: "-1",
  popular: false, active: true,
};

function PlansTab() {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [err, setErr] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null); // null = create
  const [confirm, setConfirm] = useState<ConfirmReq | null>(null);

  const load = useCallback(() => {
    return api
      .get<Plan[]>("/api/admin/plans")
      .then((d) => {
        setPlans(d);
        setErr("");
      })
      .catch((e: unknown) => {
        setErr(errMsg(e));
      });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function askDelete(p: Plan) {
    setConfirm({
      title: "Delete plan?",
      description: `“${p.name}” will be removed from pricing. If any subscription uses it, it will be deactivated instead so billing history is preserved.`,
      confirmLabel: "Delete plan",
      destructive: true,
      run: () => {
        void api
          .del<{ disabled?: boolean; message?: string; deleted?: boolean }>(`/api/admin/plans/${p.id}`)
          .then((res) => {
            toast({
              title: res?.disabled ? "Plan deactivated" : "Plan deleted",
              description: res?.message || `${p.name} was removed from pricing.`,
            });
            return load();
          })
          .catch((e: unknown) =>
            toast({ title: "Delete failed", description: errMsg(e), variant: "destructive" }),
          );
      },
    });
  }

  return (
    <div>
      <TabHeader
        title="Plans"
        desc="Pricing plans shown on the landing page and used at checkout."
        action={
          <Button
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> New Plan
          </Button>
        }
      />

      {err && !plans ? (
        <ErrorState message={err} onRetry={() => void load()} />
      ) : !plans ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : plans.length === 0 ? (
        <EmptyState icon={Layers} title="No plans yet" hint="Create your first pricing plan to start selling." />
      ) : (
        <PlanGroups plans={plans}>
          {(p) => (
            <Card key={p.id} className="flex flex-col">
              <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
                <div className="min-w-0">
                  <CardTitle className="text-base">{p.name}</CardTitle>
                  <CardDescription className="mt-1 line-clamp-2">{p.tagline || "No tagline"}</CardDescription>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {p.popular && (
                    <Badge className="border-0 bg-amber-400 text-amber-950 hover:bg-amber-400">
                      <Crown className="mr-1 h-3 w-3" aria-hidden="true" /> Popular
                    </Badge>
                  )}
                  {!p.active && <Badge variant="outline" className="border-input text-muted-foreground">Inactive</Badge>}
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold tracking-tight text-foreground">{inr(p.priceMonthly)}</span>
                  <span className="text-xs text-muted-foreground">/month</span>
                  <span className="ml-2 text-sm text-muted-foreground">or {inr(p.priceYearly)}/yr</span>
                </div>
                <Separator className="my-3" />
                {p.features.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No features listed</p>
                ) : (
                  <ul className="space-y-1.5">
                    {p.features.slice(0, 4).map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                        <span className="line-clamp-1">{f}</span>
                      </li>
                    ))}
                    {p.features.length > 4 && (
                      <li className="pl-5 text-xs text-muted-foreground">+{p.features.length - 4} more</li>
                    )}
                  </ul>
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  {p.maxPages === -1 ? "Unlimited pages" : `${p.maxPages} pages`} · {p.aiCredits} AI credits/mo ·{" "}
                  {(p.maxPalettes ?? -1) === -1 ? "all palettes" : `${p.maxPalettes} palettes`}
                  {/* Only mentioned when a plan actually meters them: "unlimited
                      design changes" on every card is noise, and the customer
                      only meets the limit when it is a real number. */}
                  {(p.maxThemeChanges ?? -1) >= 0 ? ` · ${p.maxThemeChanges} design changes` : ""}
                  {(p.maxDomains ?? -1) >= 0 ? ` · ${p.maxDomains} custom domains` : ""}
                </p>
              </CardContent>
              <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditing(p);
                    setDialogOpen(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => askDelete(p)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete
                </Button>
              </div>
            </Card>
          )}
        </PlanGroups>
      )}

      <PlanDialog
        open={dialogOpen}
        plan={editing}
        onClose={() => setDialogOpen(false)}
        onSaved={() => {
          setDialogOpen(false);
          void load();
        }}
      />
      <ConfirmDialog req={confirm} onOpenChange={(o) => !o && setConfirm(null)} />
    </div>
  );
}

function PlanDialog({
  open,
  plan,
  onClose,
  onSaved,
}: {
  open: boolean;
  plan: Plan | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {open && <PlanFormBody key={plan?.id || "new"} plan={plan} onClose={onClose} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  );
}

function PlanFormBody({
  plan,
  onClose,
  onSaved,
}: {
  plan: Plan | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!plan;
  const [form, setForm] = useState<PlanForm>(() =>
    plan
      ? {
          name: plan.name,
          tagline: plan.tagline,
          priceMonthly: String(plan.priceMonthly),
          priceYearly: String(plan.priceYearly),
          features: plan.features.join("\n"),
          maxPages: String(plan.maxPages),
          aiCredits: String(plan.aiCredits),
          maxPalettes: String(plan.maxPalettes ?? -1),
          maxDomains: String(plan.maxDomains ?? -1),
          maxThemeChanges: String(plan.maxThemeChanges ?? -1),
          popular: plan.popular,
          active: plan.active,
        }
      : EMPTY_PLAN,
  );
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  function set<K extends keyof PlanForm>(key: K, value: PlanForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setFormError("");
    if (!form.name.trim()) {
      // Inline, not a toast: the problem is a field in this dialog, and a
      // message in the corner of the screen does not point at it.
      setFormError("Enter a name for the plan.");
      return;
    }
    const body = {
      name: form.name.trim(),
      tagline: form.tagline.trim(),
      priceMonthly: Number(form.priceMonthly) || 0,
      priceYearly: Number(form.priceYearly) || 0,
      features: form.features.split("\n").map((s) => s.trim()).filter(Boolean),
      maxPages: Math.trunc(Number(form.maxPages)) || 0,
      aiCredits: Math.trunc(Number(form.aiCredits)) || 0,
      maxPalettes: Number.isFinite(Number(form.maxPalettes)) ? Math.trunc(Number(form.maxPalettes)) : -1,
      maxDomains: Number.isFinite(Number(form.maxDomains)) ? Math.trunc(Number(form.maxDomains)) : -1,
      maxThemeChanges: Number.isFinite(Number(form.maxThemeChanges)) ? Math.trunc(Number(form.maxThemeChanges)) : -1,
      popular: form.popular,
      ...(isEdit ? { active: form.active } : {}),
    };
    setSaving(true);
    try {
      if (isEdit) await api.put(`/api/admin/plans/${plan!.id}`, body);
      else await api.post("/api/admin/plans", body);
      toast({ title: isEdit ? "Plan updated" : "Plan created", description: body.name });
      onSaved();
    } catch (e) {
      toast({ title: "Could not save plan", description: errMsg(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isEdit ? `Edit ${plan?.name}` : "New Plan"}</DialogTitle>
        <DialogDescription>
          {isEdit
            ? "Changes appear on the landing page pricing section immediately."
            : "Create a pricing plan customers can subscribe to."}
        </DialogDescription>
      </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="plan-name">Name</Label>
            <Input id="plan-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Business" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="plan-tagline">Tagline</Label>
            <Input
              id="plan-tagline"
              value={form.tagline}
              onChange={(e) => set("tagline", e.target.value)}
              placeholder="Short one-liner shown under the name"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="plan-monthly">Price monthly (₹)</Label>
              <Input
                id="plan-monthly"
                type="number"
                min={0}
                value={form.priceMonthly}
                onChange={(e) => set("priceMonthly", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="plan-yearly">Price yearly (₹)</Label>
              <Input
                id="plan-yearly"
                type="number"
                min={0}
                value={form.priceYearly}
                onChange={(e) => set("priceYearly", e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="plan-features">Features (one per line)</Label>
            <Textarea
              id="plan-features"
              rows={5}
              value={form.features}
              onChange={(e) => set("features", e.target.value)}
              placeholder={"Up to 10 pages\nWhatsApp + call buttons\nLead inbox"}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="plan-pages">Max pages</Label>
              <Input
                id="plan-pages"
                type="number"
                value={form.maxPages}
                onChange={(e) => set("maxPages", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">-1 means unlimited</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="plan-credits">AI credits</Label>
              <Input
                id="plan-credits"
                type="number"
                min={0}
                value={form.aiCredits}
                onChange={(e) => set("aiCredits", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="plan-palettes">Colour palettes</Label>
              <Input
                id="plan-palettes"
                type="number"
                value={form.maxPalettes}
                onChange={(e) => set("maxPalettes", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                How many palettes this plan may pick from. -1 means the whole library.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="plan-design-changes">Design changes</Label>
              <Input
                id="plan-design-changes"
                type="number"
                value={form.maxThemeChanges}
                onChange={(e) => set("maxThemeChanges", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Restyles included before the customer is asked to upgrade. -1 means unlimited.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="plan-domains">Custom domains</Label>
              <Input
                id="plan-domains"
                type="number"
                value={form.maxDomains}
                onChange={(e) => set("maxDomains", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Domains bundled into this plan; paid add-on credits are added on top. -1 means unlimited.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <div>
              <Label htmlFor="plan-popular">Mark as Popular</Label>
              <p className="text-xs text-muted-foreground">Highlights the plan on the pricing grid</p>
            </div>
            <Switch id="plan-popular" checked={form.popular} onCheckedChange={(v) => set("popular", v)} />
          </div>
          {isEdit && (
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
              <div>
                <Label htmlFor="plan-active">Active</Label>
                <p className="text-xs text-muted-foreground">Inactive plans are hidden from checkout</p>
              </div>
              <Switch id="plan-active" checked={form.active} onCheckedChange={(v) => set("active", v)} />
            </div>
          )}
        </div>

        <FormError message={formError} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
            {isEdit ? "Save changes" : "Create plan"}
          </Button>
        </DialogFooter>
    </>
  );
}

/* ================================== TEMPLATES ================================== */

const GRADIENTS = [
  "from-emerald-500 to-teal-600",
  "from-amber-600 to-stone-700",
  "from-orange-500 to-red-600",
  "from-teal-500 to-cyan-600",
  "from-rose-500 to-stone-800",
  "from-zinc-600 to-zinc-800",
];

interface TemplateRow {
  id: string; name: string; slug: string; category: string; description: string;
  premium: boolean; gradient: string; active: boolean;
}

function TemplatesTab() {
  const [templates, setTemplates] = useState<TemplateRow[] | null>(null);
  const [err, setErr] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TemplateRow | null>(null); // null = create
  const [confirm, setConfirm] = useState<ConfirmReq | null>(null);

  const load = useCallback(() => {
    return api
      .get<TemplateRow[]>("/api/admin/templates")
      .then((d) => {
        setTemplates(d);
        setErr("");
      })
      .catch((e: unknown) => {
        setErr(errMsg(e));
      });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function askDelete(t: TemplateRow) {
    setConfirm({
      title: "Delete template?",
      description: `“${t.name}” will be removed permanently. If any business still uses it, the delete is blocked until those businesses move to another template.`,
      confirmLabel: "Delete template",
      destructive: true,
      run: () => {
        void api
          .del(`/api/admin/templates/${t.id}`)
          .then(() => {
            toast({ title: "Template deleted", description: `${t.name} was removed.` });
            return load();
          })
          .catch((e: unknown) =>
            toast({ title: "Delete failed", description: errMsg(e), variant: "destructive" }),
          );
      },
    });
  }

  return (
    <div>
      <TabHeader
        title="Templates"
        desc="Industry templates available to customers during onboarding."
        action={
          <Button
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> New Template
          </Button>
        }
      />

      {err && !templates ? (
        <ErrorState message={err} onRetry={() => void load()} />
      ) : !templates ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-60" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <EmptyState icon={LayoutTemplate} title="No templates yet" hint="Create a template so customers can pick a look." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) => (
            <Card key={t.id} className="overflow-hidden">
              <div className={`relative flex h-28 items-end bg-gradient-to-br ${t.gradient} p-3`}>
                <div className="absolute right-2.5 top-2.5 flex gap-1.5">
                  {t.premium && (
                    <Badge className="border-0 bg-card/90 text-amber-700 hover:bg-card/90">
                      <Crown className="mr-1 h-3 w-3" aria-hidden="true" /> Premium
                    </Badge>
                  )}
                  {!t.active && (
                    <Badge variant="outline" className="border-white/40 bg-black/30 text-white">
                      Inactive
                    </Badge>
                  )}
                </div>
                <span className="text-3xl font-black text-white/90 drop-shadow-sm" aria-hidden="true">
                  {t.name.charAt(0)}
                </span>
              </div>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-foreground">{t.name}</p>
                  <Badge variant="outline" className="shrink-0 border-border bg-muted text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t.category}
                  </Badge>
                </div>
                <p className="mt-1.5 line-clamp-2 min-h-10 text-sm text-muted-foreground">
                  {t.description || "No description"}
                </p>
              </CardContent>
              <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Edit ${t.name}`}
                  onClick={() => {
                    setEditing(t);
                    setDialogOpen(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  aria-label={`Delete ${t.name}`}
                  onClick={() => askDelete(t)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <TemplateDialog
        open={dialogOpen}
        template={editing}
        onClose={() => setDialogOpen(false)}
        onSaved={() => {
          setDialogOpen(false);
          void load();
        }}
      />
      <ConfirmDialog req={confirm} onOpenChange={(o) => !o && setConfirm(null)} />
    </div>
  );
}

function TemplateDialog({
  open,
  template,
  onClose,
  onSaved,
}: {
  open: boolean;
  template: TemplateRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {open && (
          <TemplateFormBody key={template?.id || "new"} template={template} onClose={onClose} onSaved={onSaved} />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface TemplateForm {
  name: string; category: string; description: string;
  premium: boolean; gradient: string; active: boolean;
}

function TemplateFormBody({
  template,
  onClose,
  onSaved,
}: {
  template: TemplateRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!template;
  const [form, setForm] = useState<TemplateForm>(() =>
    template
      ? {
          name: template.name,
          category: template.category,
          description: template.description,
          premium: template.premium,
          gradient: template.gradient,
          active: template.active,
        }
      : { name: "", category: "", description: "", premium: false, gradient: GRADIENTS[0], active: true },
  );
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  function set<K extends keyof TemplateForm>(key: K, value: TemplateForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Keep the Select valid if the stored gradient isn't one of the seed options.
  const gradientOptions = GRADIENTS.includes(form.gradient) ? GRADIENTS : [form.gradient, ...GRADIENTS];

  async function save() {
    if (form.name.trim().length < 2) {
      setFormError("The template name needs at least 2 characters.");
      return;
    }
    const shared = {
      name: form.name.trim(),
      category: form.category.trim() || "local",
      description: form.description.trim(),
      premium: form.premium,
      gradient: form.gradient,
    };
    setSaving(true);
    try {
      if (isEdit) {
        await api.put(`/api/admin/templates/${template!.id}`, { ...shared, active: form.active });
        toast({ title: "Template updated", description: shared.name });
      } else {
        await api.post("/api/admin/templates", shared);
        toast({ title: "Template created", description: shared.name });
      }
      onSaved();
    } catch (e) {
      toast({ title: "Could not save template", description: errMsg(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isEdit ? `Edit ${template?.name}` : "New Template"}</DialogTitle>
        <DialogDescription>
          {isEdit
            ? "Changes apply to new websites created from this template."
            : "Templates set the look and feel customers start from during onboarding."}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="tpl-name">Name</Label>
            <Input
              id="tpl-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Saloni Salon"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tpl-category">Category</Label>
            <Input
              id="tpl-category"
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              placeholder="e.g. food, services, retail, health"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tpl-desc">Description</Label>
            <Textarea
              id="tpl-desc"
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="What kind of business is this template best for?"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tpl-gradient">Gradient</Label>
            <Select value={form.gradient} onValueChange={(v) => set("gradient", v)}>
              <SelectTrigger id="tpl-gradient">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {gradientOptions.map((g) => (
                  <SelectItem key={g} value={g}>
                    <span className="flex items-center gap-2">
                      <span className={`inline-block h-4 w-8 rounded bg-gradient-to-br ${g}`} aria-hidden="true" />
                      {g.replace("from-", "").replace(" to-", " → ")}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <div>
              <Label htmlFor="tpl-premium">Premium</Label>
              <p className="text-xs text-muted-foreground">Premium templates can be restricted to paid plans</p>
            </div>
            <Switch id="tpl-premium" checked={form.premium} onCheckedChange={(v) => set("premium", v)} />
          </div>
          {isEdit && (
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
              <div>
                <Label htmlFor="tpl-active">Active</Label>
                <p className="text-xs text-muted-foreground">Inactive templates are hidden from onboarding</p>
              </div>
              <Switch id="tpl-active" checked={form.active} onCheckedChange={(v) => set("active", v)} />
            </div>
          )}
        </div>

        <FormError message={formError} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
            {isEdit ? "Save changes" : "Create template"}
          </Button>
        </DialogFooter>
    </>
  );
}

/* =================================== COUPONS =================================== */

interface CouponRow {
  id: string; code: string; type: "PERCENT" | "FIXED" | string; value: number;
  description: string; active: boolean; expiresAt: string | null;
  maxUses: number; usedCount: number; createdAt: string;
}

function CouponsTab() {
  const [rows, setRows] = useState<CouponRow[] | null>(null);
  const [err, setErr] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmReq | null>(null);

  const load = useCallback(() => {
    return api
      .get<CouponRow[]>("/api/admin/coupons")
      .then((d) => {
        setRows(d);
        setErr("");
      })
      .catch((e: unknown) => {
        setErr(errMsg(e));
      });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleCoupon(c: CouponRow, active: boolean) {
    setRows((prev) => (prev ? prev.map((r) => (r.id === c.id ? { ...r, active } : r)) : prev));
    try {
      await api.patch(`/api/admin/coupons/${c.id}`, { active });
      toast({ title: active ? "Coupon enabled" : "Coupon disabled", description: c.code });
    } catch (e) {
      setRows((prev) => (prev ? prev.map((r) => (r.id === c.id ? { ...r, active: !active } : r)) : prev));
      toast({ title: "Could not update coupon", description: errMsg(e), variant: "destructive" });
    }
  }

  function askDelete(c: CouponRow) {
    setConfirm({
      title: "Delete coupon?",
      description: `“${c.code}” will stop working immediately at checkout. This cannot be undone.`,
      confirmLabel: "Delete coupon",
      destructive: true,
      run: () => {
        void api
          .del(`/api/admin/coupons/${c.id}`)
          .then(() => {
            toast({ title: "Coupon deleted", description: c.code });
            return load();
          })
          .catch((e: unknown) =>
            toast({ title: "Delete failed", description: errMsg(e), variant: "destructive" }),
          );
      },
    });
  }

  return (
    <div>
      <TabHeader
        title="Coupons"
        desc="Discount codes customers can apply at checkout."
        action={
          <Button
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> New Coupon
          </Button>
        }
      />

      {err && !rows ? (
        <ErrorState message={err} onRetry={() => void load()} />
      ) : !rows ? (
        <TableSkeleton rows={4} />
      ) : rows.length === 0 ? (
        <EmptyState icon={TicketPercent} title="No coupons yet" hint="Create a launch coupon to nudge early signups." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow className="bg-muted hover:bg-muted">
                  <TableHead>Code</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Used</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="w-14 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <p className="font-mono text-sm font-semibold text-foreground">{c.code}</p>
                      {c.description ? (
                        <p className="max-w-[200px] truncate text-xs text-muted-foreground" title={c.description}>
                          {c.description}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          c.type === "PERCENT"
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700"
                        }
                      >
                        {c.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm font-medium text-foreground">
                      {c.type === "PERCENT" ? `${c.value}%` : inr(c.value)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {c.usedCount}/{c.maxUses}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={c.active}
                        onCheckedChange={(v) => void toggleCoupon(c, v)}
                        aria-label={`Toggle ${c.code}`}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{fmtDate(c.expiresAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                        onClick={() => askDelete(c)}
                        aria-label={`Delete ${c.code}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <CouponDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={() => {
          setDialogOpen(false);
          void load();
        }}
      />
      <ConfirmDialog req={confirm} onOpenChange={(o) => !o && setConfirm(null)} />
    </div>
  );
}

function CouponDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        {open && <CouponFormBody onClose={onClose} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  );
}

function CouponFormBody({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    code: "", type: "PERCENT", value: "", description: "", maxUses: "100", expiresAt: "",
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  async function save() {
    const value = Number(form.value) || 0;
    setFormError("");
    if (!form.code.trim()) {
      setFormError("Enter the coupon code customers will type.");
      return;
    }
    if (value <= 0) {
      setFormError("The discount has to be more than zero.");
      return;
    }
    const body: Record<string, unknown> = {
      code: form.code.trim().toUpperCase(),
      type: form.type,
      value,
      description: form.description.trim(),
      maxUses: Math.trunc(Number(form.maxUses)) || 100,
    };
    if (form.expiresAt) body.expiresAt = new Date(`${form.expiresAt}T23:59:59`).toISOString();
    setSaving(true);
    try {
      await api.post("/api/admin/coupons", body);
      toast({ title: "Coupon created", description: body.code as string });
      onSaved();
    } catch (e) {
      toast({ title: "Could not create coupon", description: errMsg(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>New Coupon</DialogTitle>
        <DialogDescription>Customers can apply this code on the subscription page.</DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="cpn-code">Code</Label>
              <Input
                id="cpn-code"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="LAUNCH50"
                className="font-mono uppercase"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cpn-type">Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger id="cpn-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERCENT">Percent (%)</SelectItem>
                  <SelectItem value="FIXED">Fixed (₹)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="cpn-value">Value</Label>
              <Input
                id="cpn-value"
                type="number"
                min={1}
                value={form.value}
                onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                placeholder={form.type === "PERCENT" ? "50" : "200"}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cpn-max">Max uses</Label>
              <Input
                id="cpn-max"
                type="number"
                min={1}
                value={form.maxUses}
                onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cpn-desc">Description</Label>
            <Input
              id="cpn-desc"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Launch offer — 50% off first month"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cpn-expiry">Expiry date (optional)</Label>
            <Input
              id="cpn-expiry"
              type="date"
              value={form.expiresAt}
              onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
            />
          </div>
        </div>

        <FormError message={formError} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
            Create coupon
          </Button>
        </DialogFooter>
    </>
  );
}

/* ================================ PLATFORM LEADS ================================ */

interface PLeadRow {
  id: string; name: string; email: string; phone: string; businessType: string;
  message: string; source: string; status: string; createdAt: string;
  followUpCount?: number;
}

interface FollowUp {
  id: string;
  note: string;
  actor: string;
  createdAt: string;
}

const P_LEAD_STATUSES = ["NEW", "CONTACTED", "CONVERTED", "CLOSED"] as const;

const SOURCE_BADGE: Record<string, string> = {
  CONTACT: "border-border bg-muted text-muted-foreground",
  DEMO: "border-amber-200 bg-amber-50 text-amber-700",
  SALES: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

function PlatformLeadsTab() {
  const [rows, setRows] = useState<PLeadRow[] | null>(null);
  const [err, setErr] = useState("");
  const [followUpLead, setFollowUpLead] = useState<PLeadRow | null>(null);

  const load = useCallback(() => {
    return api
      .get<PLeadRow[]>("/api/admin/platform-leads")
      .then((d) => {
        setRows(d);
        setErr("");
      })
      .catch((e: unknown) => {
        setErr(errMsg(e));
      });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateStatus(lead: PLeadRow, status: string) {
    if (lead.status === status) return;
    setRows((prev) => (prev ? prev.map((r) => (r.id === lead.id ? { ...r, status } : r)) : prev));
    try {
      await api.patch("/api/admin/platform-leads", { id: lead.id, status });
      toast({ title: "Lead updated", description: `${lead.name} marked as ${titleCase(status)}` });
    } catch (e) {
      setRows((prev) => (prev ? prev.map((r) => (r.id === lead.id ? { ...r, status: lead.status } : r)) : prev));
      toast({ title: "Could not update lead", description: errMsg(e), variant: "destructive" });
    }
  }

  return (
    <div>
      <TabHeader title="Platform Leads" desc="Enquiries captured by the WebSetu website itself." />

      {err && !rows ? (
        <ErrorState message={err} onRetry={() => void load()} />
      ) : !rows ? (
        <TableSkeleton rows={5} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No platform leads yet"
          hint="Leads submitted through the WebSetu landing page contact form appear here."
        />
      ) : (
        <>
          <p className="mb-2 text-xs text-muted-foreground">{rows.length} lead{rows.length === 1 ? "" : "s"}</p>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="overflow-x-auto">
              <Table className="min-w-[920px]">
                <TableHeader>
                  <TableRow className="bg-muted hover:bg-muted">
                    <TableHead>Lead</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Business type</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Follow-ups</TableHead>
                    <TableHead className="text-right">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Initial text={l.name} />
                          <p className="truncate text-sm font-medium text-foreground">{l.name}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="whitespace-nowrap text-sm text-foreground">{l.phone || "—"}</p>
                        <p className="truncate text-xs text-muted-foreground">{l.email || "—"}</p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{l.businessType || "—"}</TableCell>
                      <TableCell
                        className="max-w-[220px] truncate text-sm text-muted-foreground"
                        title={l.message}
                      >
                        {l.message || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={SOURCE_BADGE[l.source] || SOURCE_BADGE.CONTACT}>
                          {titleCase(l.source)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Select value={l.status} onValueChange={(v) => void updateStatus(l, v)}>
                          <SelectTrigger className="h-8 w-[132px] text-xs" aria-label={`Status for ${l.name}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {P_LEAD_STATUSES.map((s) => (
                              <SelectItem key={s} value={s}>
                                {titleCase(s)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant={l.followUpCount ? "outline" : "ghost"}
                          className="h-8 gap-1.5 text-xs"
                          onClick={() => setFollowUpLead(l)}
                        >
                          <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                          {l.followUpCount ? `${l.followUpCount} note${l.followUpCount === 1 ? "" : "s"}` : "Add note"}
                        </Button>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right text-sm text-muted-foreground">
                        {fmtDate(l.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
          <FollowUpDialog
            lead={followUpLead}
            onClose={() => setFollowUpLead(null)}
            onChanged={() => void load()}
          />
        </>
      )}
    </div>
  );
}


/* ================================ APPEARANCE ================================ */

interface PaletteRow {
  id: string;
  name: string;
  mood: string;
  colors: [string, string, string];
  scope: "BUSINESS" | "PLATFORM" | "BOTH";
  active: boolean;
  builtIn: boolean;
  sortOrder: number;
}

const SCOPE_LABEL: Record<string, string> = {
  BOTH: "Customers + WebSetu",
  BUSINESS: "Customer websites",
  PLATFORM: "WebSetu pages",
};

const EMPTY_PALETTE = {
  name: "",
  mood: "",
  primary: "#059669",
  secondary: "#064e3b",
  accent: "#f59e0b",
  scope: "BOTH" as PaletteRow["scope"],
};

/**
 * Palette management. One library feeds both pickers: the palettes customers
 * choose from for their own website, and the palette WebSetu's landing + login
 * pages use. Selecting a platform palette applies it immediately — there is no
 * separate save step.
 */
function AppearanceTab() {
  const storeTheme = useApp((s) => s.platformTheme);
  const setPlatformTheme = useApp((s) => s.setPlatformTheme);

  const [palettes, setPalettes] = useState<PaletteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [applying, setApplying] = useState<string | null>(null);
  const [editing, setEditing] = useState<PaletteRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmReq | null>(null);

  // No synchronous setState here: the component already starts in the loading
  // state, and the retry button sets it back before calling this.
  const load = useCallback(async () => {
    try {
      const [lib, theme] = await Promise.all([
        api.get<{ palettes: PaletteRow[] }>("/api/admin/palettes"),
        api.get<{ theme: typeof storeTheme }>("/api/settings/theme"),
      ]);
      setPalettes(lib.palettes);
      setPlatformTheme(theme.theme);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [setPlatformTheme]);

  useEffect(() => {
    // Fetch on mount — see the note on the other loader effects: the flag is
    // set once, before the first await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const platformOptions = useMemo(
    () => palettes.filter((p) => p.active && (p.scope === "BOTH" || p.scope === "PLATFORM")),
    [palettes],
  );

  /** Click = apply. The store updates first so the preview and the rest of the
   *  app react instantly; a failed save rolls it back. */
  async function applyPlatform(p: PaletteRow) {
    const previous = storeTheme;
    setApplying(p.id);
    setPlatformTheme({ palette: p.name, primary: p.colors[0], secondary: p.colors[1], accent: p.colors[2] });
    try {
      const res = await api.put<{ theme: typeof storeTheme }>("/api/settings/theme", { palette: p.name });
      setPlatformTheme(res.theme);
      toast({ title: "Applied " + p.name, description: "The landing and login pages now use this palette." });
    } catch (e) {
      setPlatformTheme(previous);
      toast({ title: "Could not apply the palette", description: errMsg(e), variant: "destructive" });
    } finally {
      setApplying(null);
    }
  }

  async function toggleActive(p: PaletteRow, active: boolean) {
    setPalettes((rows) => rows.map((r) => (r.id === p.id ? { ...r, active } : r)));
    try {
      await api.put(`/api/admin/palettes/${p.id}`, { active });
      toast({ title: active ? "Palette enabled" : "Palette retired", description: p.name });
    } catch (e) {
      setPalettes((rows) => rows.map((r) => (r.id === p.id ? { ...r, active: !active } : r)));
      toast({ title: "Could not update the palette", description: errMsg(e), variant: "destructive" });
    }
  }

  function askDelete(p: PaletteRow) {
    setConfirm({
      title: p.builtIn ? "Retire this palette?" : "Delete this palette?",
      description: p.builtIn
        ? `"${p.name}" is built in, so it is retired from the pickers rather than deleted. You can enable it again later.`
        : `"${p.name}" is removed from both pickers. Websites already using these colours keep them.`,
      confirmLabel: p.builtIn ? "Retire" : "Delete",
      destructive: true,
      run: async () => {
        try {
          await api.del(`/api/admin/palettes/${p.id}`);
          toast({ title: p.builtIn ? "Palette retired" : "Palette deleted", description: p.name });
          await load();
        } catch (e) {
          toast({ title: "Could not remove the palette", description: errMsg(e), variant: "destructive" });
        }
      },
    });
  }

  return (
    <div className="space-y-6">
      <TabHeader
        title="Appearance"
        desc="One palette library for customer websites and for WebSetu's own landing and login pages."
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add palette
          </Button>
        }
      />

      {error ? (
        <ErrorState
          message={error}
          onRetry={() => {
            setLoading(true);
            setError("");
            void load();
          }}
        />
      ) : null}

      {/* -------------------------- platform palette -------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">WebSetu landing &amp; login</CardTitle>
          <CardDescription>
            Click a palette to apply it right away. Currently live:{" "}
            <span className="font-medium text-foreground">{storeTheme.palette}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {platformOptions.map((p) => {
                const live = storeTheme.palette === p.name;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={live}
                    disabled={applying !== null}
                    onClick={() => void applyPlatform(p)}
                    className={
                      "flex items-center gap-3 rounded-xl border p-3 text-left transition disabled:opacity-60 " +
                      (live
                        ? "border-zinc-900 bg-muted ring-2 ring-zinc-900/10"
                        : "border-border hover:border-zinc-400 hover:bg-muted")
                    }
                  >
                    <span className="flex shrink-0 overflow-hidden rounded-lg ring-1 ring-black/5">
                      {p.colors.map((c) => (
                        <span key={c} className="h-10 w-4" style={{ backgroundColor: c }} />
                      ))}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-foreground">{p.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{p.mood || SCOPE_LABEL[p.scope]}</span>
                    </span>
                    {applying === p.id ? (
                      <Loader2 className="ml-auto h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
                    ) : live ? (
                      <Check className="ml-auto h-4 w-4 shrink-0 text-foreground" aria-hidden="true" />
                    ) : null}
                  </button>
                );
              })}
              {!platformOptions.length ? (
                <div className="sm:col-span-2 lg:col-span-3">
                  <EmptyState icon={Palette} title="No palettes available for WebSetu pages"
                    hint="Add one, or set an existing palette's scope to include WebSetu." />
                </div>
              ) : null}
            </div>
          )}

          <Separator />

          {/* Rendered with the same class names the real pages use, so the
              preview shows exactly what the theme layer produces. */}
          <div className="ws-theme space-y-3" style={themeVars(storeTheme) as React.CSSProperties}>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Live preview</p>
            <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-800 p-6 text-white">
              <p className="text-lg font-bold">Bring your business online today.</p>
              <p className="mt-1 text-sm text-emerald-100">Launch in 15 minutes · Leads + WhatsApp built in</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Log In</span>
              <span className="rounded-lg bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">Get started</span>
              <span className="text-sm font-medium text-emerald-700">Learn more</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* --------------------------- palette library --------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Palette library</CardTitle>
          <CardDescription>
            Palettes scoped to customer websites appear in the onboarding wizard and in every customer&apos;s
            branding panel. Retiring one leaves existing websites untouched.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton rows={5} />
          ) : (
            <div className="space-y-2">
              {palettes.map((p) => (
                <div
                  key={p.id}
                  className={
                    "flex flex-wrap items-center gap-3 rounded-xl border p-3 " +
                    (p.active ? "border-border" : "border-dashed border-border bg-muted/60 opacity-70")
                  }
                >
                  <span className="flex shrink-0 overflow-hidden rounded-lg ring-1 ring-black/5">
                    {p.colors.map((c) => (
                      <span key={c} className="h-9 w-4" style={{ backgroundColor: c }} />
                    ))}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {p.name}
                      {p.builtIn ? <span className="ml-2 text-[11px] font-medium text-muted-foreground">built-in</span> : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {p.mood ? p.mood + " · " : ""}{SCOPE_LABEL[p.scope]} · {p.colors.join(" ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Switch
                      checked={p.active}
                      aria-label={`Show ${p.name} in the pickers`}
                      onCheckedChange={(v) => void toggleActive(p, v)}
                    />
                    <Button size="sm" variant="ghost" aria-label={`Edit ${p.name}`} onClick={() => setEditing(p)}>
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove ${p.name}`}
                      className="text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => askDelete(p)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <PaletteDialog
        open={creating || !!editing}
        palette={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={() => {
          setCreating(false);
          setEditing(null);
          void load();
        }}
      />
      <ConfirmDialog req={confirm} onOpenChange={(open) => !open && setConfirm(null)} />
    </div>
  );
}

function PaletteDialog({
  open,
  palette,
  onClose,
  onSaved,
}: {
  open: boolean;
  palette: PaletteRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{palette ? "Edit palette" : "Add palette"}</DialogTitle>
          <DialogDescription>
            Three colours: primary for buttons and links, secondary for dark backgrounds, accent for highlights.
          </DialogDescription>
        </DialogHeader>
        {open ? <PaletteFormBody key={palette?.id ?? "new"} palette={palette} onClose={onClose} onSaved={onSaved} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function PaletteFormBody({
  palette,
  onClose,
  onSaved,
}: {
  palette: PaletteRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(
    palette
      ? {
          name: palette.name,
          mood: palette.mood,
          primary: palette.colors[0],
          secondary: palette.colors[1],
          accent: palette.colors[2],
          scope: palette.scope,
        }
      : EMPTY_PALETTE,
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const HEX = /^#[0-9a-fA-F]{6}$/;

  async function save() {
    setErr("");
    if (form.name.trim().length < 2) return setErr("Give the palette a name of at least 2 characters.");
    for (const [label, value] of [["Primary", form.primary], ["Secondary", form.secondary], ["Accent", form.accent]] as const) {
      if (!HEX.test(value)) return setErr(`${label} must be a 6-digit hex colour like #059669.`);
    }
    setBusy(true);
    try {
      const body = {
        name: form.name.trim(),
        mood: form.mood.trim(),
        primary: form.primary,
        secondary: form.secondary,
        accent: form.accent,
        scope: form.scope,
      };
      if (palette) await api.put(`/api/admin/palettes/${palette.id}`, body);
      else await api.post("/api/admin/palettes", body);
      toast({ title: palette ? "Palette updated" : "Palette added", description: body.name });
      onSaved();
    } catch (e) {
      const msg = errMsg(e);
      setErr(msg);
      toast({ title: "Could not save the palette", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="palette-name">Name</Label>
          <Input
            id="palette-name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Ocean Blue"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="palette-mood">Best for</Label>
          <Input
            id="palette-mood"
            value={form.mood}
            onChange={(e) => setForm((f) => ({ ...f, mood: e.target.value }))}
            placeholder="Travel · Hotels"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {([
          ["primary", "Primary"],
          ["secondary", "Secondary"],
          ["accent", "Accent"],
        ] as const).map(([key, label]) => (
          <div key={key} className="space-y-1.5">
            <Label htmlFor={`palette-${key}`}>{label}</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label={`${label} colour picker`}
                value={HEX.test(form[key]) ? form[key] : "#000000"}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-border bg-card p-0.5"
              />
              <Input
                id={`palette-${key}`}
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value.trim() }))}
                className="font-mono text-xs"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="palette-scope">Available in</Label>
        <Select value={form.scope} onValueChange={(v) => setForm((f) => ({ ...f, scope: v as PaletteRow["scope"] }))}>
          <SelectTrigger id="palette-scope">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="BOTH">Customer websites + WebSetu pages</SelectItem>
            <SelectItem value="BUSINESS">Customer websites only</SelectItem>
            <SelectItem value="PLATFORM">WebSetu landing &amp; login only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* preview */}
      <div className="rounded-xl border p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Preview</p>
        <div
          className="rounded-lg p-4 text-white"
          style={{ background: `linear-gradient(135deg, ${form.primary}, ${form.secondary})` }}
        >
          <p className="text-sm font-bold">{form.name || "Your palette"}</p>
          <p className="mt-2 inline-block rounded-md px-3 py-1 text-xs font-semibold" style={{ backgroundColor: form.accent, color: "#1c1917" }}>
            Call to action
          </p>
        </div>
      </div>

      {err ? <p className="text-xs font-medium text-red-600">{err}</p> : null}

      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button onClick={() => void save()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
          {palette ? "Save changes" : "Add palette"}
        </Button>
      </DialogFooter>
    </div>
  );
}


/* ============================ CUSTOMER PROVISIONING ========================= */

const BUSINESS_CATEGORIES = [
  "Electrician", "Plumber", "Restaurant", "Cafe", "Clinic", "Dentist", "Salon", "Gym",
  "Real Estate", "Manufacturer", "Wholesaler", "Retail Store", "School", "Consultant", "Other",
];

/**
 * Create a customer account on their behalf. With a business name filled in the
 * tenant is provisioned end to end — business, generated website and a
 * subscription — so the customer can log straight into a working dashboard.
 */
function AddCustomerDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (created: { email: string; password: string }) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add customer</DialogTitle>
          <DialogDescription>
            Creates the login and, optionally, the whole website so they can start from a working dashboard.
          </DialogDescription>
        </DialogHeader>
        {open ? <AddCustomerBody onClose={onClose} onCreated={onCreated} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function AddCustomerBody({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (created: { email: string; password: string }) => void;
}) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    businessName: "",
    category: "",
    phone: "",
    city: "",
    planId: "",
    cycle: "MONTHLY",
    trialDays: String(TRIAL_DAYS),
  });
  const [plans, setPlans] = useState<Plan[]>([]);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .get<Plan[]>("/api/admin/plans")
      .then((d) => {
        if (!cancelled) setPlans(d.filter((p) => p.active && !p.customForBusinessId));
      })
      .catch(() => {
        /* the form still works: the server falls back to the entry plan */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setErr("");
    if (form.name.trim().length < 2) return setErr("Enter the customer's full name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setErr("Enter a valid email address.");
    if (form.password && form.password.length < 8) return setErr("A password you set must be at least 8 characters.");
    if (form.businessName.trim() && !form.category) return setErr("Choose a business category.");

    // disabled={busy} only takes effect on the next render, so a double click
    // would create the customer — and their website — twice.
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const created = await api.post<{ email: string; password: string }>("/api/admin/customers", {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password || undefined,
        businessName: form.businessName.trim() || undefined,
        category: form.category || undefined,
        phone: form.phone.trim() || undefined,
        city: form.city.trim() || undefined,
        planId: form.planId || undefined,
        cycle: form.cycle,
        trialDays: Number(form.trialDays) || 0,
      });
      onCreated(created);
      // Stay latched: the dialog closes with an animation, and a click landing
      // during it would create a second customer and a second website.
      return;
    } catch (e) {
      const msg = errMsg(e);
      setErr(msg);
      toast({ title: "Could not create the customer", description: msg, variant: "destructive" });
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Account</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="cust-name">Full name</Label>
            <Input id="cust-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ramesh Sharma" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cust-email">Email</Label>
            <Input id="cust-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="ramesh@business.in" />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="cust-password">Password</Label>
          <Input
            id="cust-password"
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
            placeholder="Leave blank to generate one"
          />
          <p className="text-xs text-muted-foreground">
            Whatever is used here is shown to you once after creating the account, then only stored hashed.
          </p>
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Business (optional)</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Fill this in to create their website too. Leave it empty and they will run the setup wizard themselves.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="cust-business">Business name</Label>
            <Input id="cust-business" value={form.businessName} onChange={(e) => set("businessName", e.target.value)} placeholder="Sharma Electricals" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cust-category">Category</Label>
            <Select value={form.category} onValueChange={(v) => set("category", v)}>
              <SelectTrigger id="cust-category">
                <SelectValue placeholder="Choose one" />
              </SelectTrigger>
              <SelectContent>
                {BUSINESS_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cust-phone">Phone</Label>
            <Input id="cust-phone" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91 90000 00000" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cust-city">City</Label>
            <Input id="cust-city" value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="Pune" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cust-plan">Plan</Label>
            <Select value={form.planId} onValueChange={(v) => set("planId", v)}>
              <SelectTrigger id="cust-plan">
                <SelectValue placeholder="Entry plan" />
              </SelectTrigger>
              <SelectContent>
                {plans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cust-trial">Trial days</Label>
            <Input
              id="cust-trial"
              type="number"
              min={0}
              value={form.trialDays}
              onChange={(e) => set("trialDays", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">0 starts the plan as active immediately.</p>
          </div>
        </div>
      </div>

      {err ? <p className="text-xs font-medium text-red-600">{err}</p> : null}

      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button onClick={() => void submit()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UserPlus className="h-4 w-4" aria-hidden="true" />}
          Create customer
        </Button>
      </DialogFooter>
    </div>
  );
}

/**
 * One-time credential hand-off. Passwords are stored hashed, so this is the only
 * moment the value can be read — the dialog says so plainly.
 */
function CredentialsDialog({
  data,
  onClose,
}: {
  data: { email: string; password: string; heading: string } | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(`${data.email} / ${data.password}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Could not copy", description: "Select the text and copy it manually.", variant: "destructive" });
    }
  }

  return (
    <Dialog open={!!data} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{data?.heading}</DialogTitle>
          <DialogDescription>
            Copy these now and send them to the customer. The password is stored hashed, so it cannot be shown again —
            you can only issue a new one.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 rounded-xl border border-border bg-muted p-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Email</p>
            <p className="font-mono text-sm text-foreground">{data?.email}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Password</p>
            <p className="font-mono text-sm text-foreground">{data?.password}</p>
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={() => void copy()}>
            {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
            {copied ? "Copied" : "Copy both"}
          </Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


/**
 * Plans render in two groups: the plans on public pricing, and plans created for
 * a single customer (Customers -> Dedicated plan), which are never sold openly.
 */
function PlanGroups({
  plans,
  children,
}: {
  plans: Plan[];
  children: (plan: Plan) => React.ReactNode;
}) {
  const standard = plans.filter((p) => !p.customForBusinessId);
  const custom = plans.filter((p) => p.customForBusinessId);

  return (
    <div className="space-y-8">
      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Standard plans</p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{standard.map(children)}</div>
      </section>

      {custom.length ? (
        <section>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Dedicated plans (one customer each)
          </p>
          <p className="mb-3 text-xs text-muted-foreground">
            Hidden from public pricing. Editing one affects only the customer it belongs to.
          </p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{custom.map(children)}</div>
        </section>
      ) : null}
    </div>
  );
}


/**
 * Follow-up trail for one platform enquiry. A status dropdown alone loses the
 * detail that matters when chasing a sale: who called, when, and what was said.
 */
function FollowUpDialog({
  lead,
  onClose,
  onChanged,
}: {
  lead: PLeadRow | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  return (
    <Dialog open={!!lead} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        {lead ? <FollowUpBody key={lead.id} lead={lead} onChanged={onChanged} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function FollowUpBody({ lead, onChanged }: { lead: PLeadRow; onChanged: () => void }) {
  const [items, setItems] = useState<FollowUp[] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await api.get<{ followUps: FollowUp[] }>(`/api/admin/platform-leads/${lead.id}/follow-ups`);
      setItems(d.followUps);
      setError("");
    } catch (e) {
      setError(errMsg(e));
      setItems([]);
    }
  }, [lead.id]);

  useEffect(() => {
    // Fetch on mount: `load` flips its own loading flag before its first
    // await, which the rule sees as a synchronous setState. That is one extra
    // render on mount, not a cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function add() {
    if (note.trim().length < 2) return setError("Write what happened on this follow-up.");
    setBusy(true);
    setError("");
    try {
      await api.post(`/api/admin/platform-leads/${lead.id}/follow-ups`, { note: note.trim() });
      setNote("");
      await load();
      onChanged();
      toast({ title: "Follow-up saved", description: lead.name });
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await api.del(`/api/admin/platform-leads/${lead.id}/follow-ups?noteId=${id}`);
      await load();
      onChanged();
    } catch (e) {
      toast({ title: "Could not delete the note", description: errMsg(e), variant: "destructive" });
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{lead.name}</DialogTitle>
        <DialogDescription>
          {[lead.phone, lead.email, lead.businessType].filter(Boolean).join(" · ") || "No contact details"}
        </DialogDescription>
      </DialogHeader>

      {lead.message ? (
        <p className="rounded-xl bg-muted p-3 text-sm text-foreground ring-1 ring-zinc-200">“{lead.message}”</p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="follow-up-note">Add a follow-up</Label>
        <Textarea
          id="follow-up-note"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Called — asked for a demo on Friday, wants the Business plan."
        />
        {error ? <p className="text-xs font-medium text-red-600">{error}</p> : null}
        <Button onClick={() => void add()} disabled={busy} className="w-full sm:w-auto">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
          Save follow-up
        </Button>
        <p className="text-xs text-muted-foreground">
          Saving the first note moves a new lead to Contacted, since that is what it means.
        </p>
      </div>

      <Separator />

      {!items ? (
        <div className="space-y-2">
          {[0, 1].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      ) : items.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">No follow-ups recorded yet.</p>
      ) : (
        <ol className="space-y-2">
          {items.map((f) => (
            <li key={f.id} className="rounded-xl border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="whitespace-pre-line text-sm text-foreground">{f.note}</p>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Delete this follow-up"
                  className="shrink-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => void remove(f.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {f.actor ? `${f.actor} · ` : ""}
                {new Date(f.createdAt).toLocaleString("en-IN")}
              </p>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}


/* ================================== BLOG =================================== */

interface PostRow {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  cover: string;
  author: string;
  tags: string;
  published: boolean;
  publishedAt: string | null;
  updatedAt: string;
}

/**
 * WebSetu's own blog. Tenants have their own per-business posts; this is the
 * platform's marketing content, served at /blog with real indexable URLs.
 */
function BlogTab() {
  const [rows, setRows] = useState<PostRow[] | null>(null);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState<PostRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmReq | null>(null);
  const [busyRow, setBusyRow] = useState<string | null>(null);

  const load = useCallback(() => {
    return api
      .get<PostRow[]>("/api/admin/posts")
      .then((d) => {
        setRows(d);
        setErr("");
      })
      .catch((e: unknown) => setErr(errMsg(e)));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function togglePublished(post: PostRow, published: boolean) {
    setBusyRow(post.id);
    setRows((prev) => (prev ? prev.map((r) => (r.id === post.id ? { ...r, published } : r)) : prev));
    try {
      await api.put(`/api/admin/posts/${post.id}`, { published });
      toast({
        title: published ? "Post published" : "Post moved to drafts",
        description: published ? `Live at /blog/${post.slug}` : post.title,
      });
      await load();
    } catch (e) {
      setRows((prev) => (prev ? prev.map((r) => (r.id === post.id ? { ...r, published: !published } : r)) : prev));
      toast({ title: "Could not update the post", description: errMsg(e), variant: "destructive" });
    } finally {
      setBusyRow(null);
    }
  }

  function askDelete(post: PostRow) {
    setConfirm({
      title: "Delete this post?",
      description: `"${post.title}" will be removed from the blog permanently.`,
      confirmLabel: "Delete",
      destructive: true,
      run: () => {
        void api
          .del(`/api/admin/posts/${post.id}`)
          .then(() => {
            toast({ title: "Post deleted", description: post.title });
            return load();
          })
          .catch((e: unknown) => toast({ title: "Delete failed", description: errMsg(e), variant: "destructive" }));
      },
    });
  }

  return (
    <div>
      <TabHeader
        title="Blog"
        desc="WebSetu's own posts, published at /blog for search engines to index."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/blog"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-sm font-medium text-foreground hover:bg-muted"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" /> View blog
            </a>
            <Button className="rounded-xl" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" /> New post
            </Button>
          </div>
        }
      />

      {err && !rows ? (
        <ErrorState message={err} onRetry={() => void load()} />
      ) : !rows ? (
        <TableSkeleton rows={4} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Newspaper} title="No posts yet" hint="Write your first post to start pulling in search traffic." />
      ) : (
        <div className="space-y-2">
          {rows.map((post) => (
            <div key={post.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3">
              {post.cover ? (
                <img src={post.cover} alt="" className="h-14 w-20 shrink-0 rounded-lg object-cover" />
              ) : (
                <span className="flex h-14 w-20 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Newspaper className="h-5 w-5" aria-hidden="true" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{post.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  /blog/{post.slug}
                  {post.author ? ` · ${post.author}` : ""}
                  {post.publishedAt ? ` · ${fmtDate(post.publishedAt)}` : " · draft"}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge
                  variant="outline"
                  className={post.published ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-border bg-muted text-muted-foreground"}
                >
                  {post.published ? "Published" : "Draft"}
                </Badge>
                <Switch
                  checked={post.published}
                  disabled={busyRow === post.id}
                  aria-label={`Publish ${post.title}`}
                  onCheckedChange={(v) => void togglePublished(post, v)}
                />
                <Button size="sm" variant="ghost" aria-label={`Edit ${post.title}`} onClick={() => setEditing(post)}>
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Delete ${post.title}`}
                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => askDelete(post)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <PostDialog
        open={creating || !!editing}
        post={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={() => {
          setCreating(false);
          setEditing(null);
          void load();
        }}
      />
      <ConfirmDialog req={confirm} onOpenChange={(o) => !o && setConfirm(null)} />
    </div>
  );
}

function PostDialog({
  open,
  post,
  onClose,
  onSaved,
}: {
  open: boolean;
  post: PostRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{post ? "Edit post" : "New post"}</DialogTitle>
          <DialogDescription>
            Content is stored and rendered as plain text with line breaks preserved — no HTML.
          </DialogDescription>
        </DialogHeader>
        {open ? <PostFormBody key={post?.id ?? "new"} post={post} onClose={onClose} onSaved={onSaved} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function PostFormBody({
  post,
  onClose,
  onSaved,
}: {
  post: PostRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    title: post?.title ?? "",
    excerpt: post?.excerpt ?? "",
    content: post?.content ?? "",
    cover: post?.cover ?? "",
    author: post?.author ?? "",
    tags: post?.tags ?? "",
    published: post?.published ?? false,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setErr("");
    if (form.title.trim().length < 3) return setErr("Give the post a title of at least 3 characters.");
    if (form.content.trim().length < 20) return setErr("Write at least a couple of sentences.");
    setBusy(true);
    try {
      if (post) await api.put(`/api/admin/posts/${post.id}`, form);
      else await api.post("/api/admin/posts", form);
      toast({ title: post ? "Post updated" : "Post created", description: form.title });
      onSaved();
    } catch (e) {
      const msg = errMsg(e);
      setErr(msg);
      toast({ title: "Could not save the post", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2">
        <Label htmlFor="post-title">Title</Label>
        <Input id="post-title" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="How local businesses win on Google" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="post-excerpt">Excerpt</Label>
        <Textarea id="post-excerpt" rows={2} value={form.excerpt} onChange={(e) => set("excerpt", e.target.value)} placeholder="One or two lines shown on the blog card and in search results." />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="post-content">Content</Label>
        <Textarea id="post-content" rows={12} value={form.content} onChange={(e) => set("content", e.target.value)} placeholder="Write the post…" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="post-author">Author</Label>
          <Input id="post-author" value={form.author} onChange={(e) => set("author", e.target.value)} placeholder="Akash Shinde" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="post-tags">Tags</Label>
          <Input id="post-tags" value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="seo, google, leads" />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="post-cover">Cover image URL</Label>
        <Input id="post-cover" value={form.cover} onChange={(e) => set("cover", e.target.value)} placeholder="https://… or /api/uploads/…" />
      </div>
      <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
        <div>
          <Label htmlFor="post-published">Published</Label>
          <p className="text-xs text-muted-foreground">Drafts are hidden from /blog, including by direct link.</p>
        </div>
        <Switch id="post-published" checked={form.published} onCheckedChange={(v) => set("published", v)} />
      </div>

      {err ? <p className="text-xs font-medium text-red-600">{err}</p> : null}

      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button onClick={() => void save()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
          {post ? "Save changes" : "Create post"}
        </Button>
      </DialogFooter>
    </div>
  );
}

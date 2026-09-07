"use client";
// WebSetu — AdminView: Super Admin console (zinc-900 sidebar, emerald accents).
// Tabs: Overview | Customers | Plans | Templates | Coupons | Platform Leads.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowLeft, BadgeCheck, Ban, CalendarX2, Check, Crown, Download, ExternalLink,
  Globe, Inbox, Layers, LayoutDashboard, LayoutTemplate, Loader2, Menu, MoreVertical,
  Pencil, Plus, Power, RotateCcw, Search, TicketPercent, Timer, Trash2, TrendingUp,
  UserPlus, Users, Wallet, type LucideIcon,
} from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api-client";
import { useApp, type AdminTab } from "@/store/app-store";
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
  DRAFT: "border-zinc-200 bg-zinc-100 text-zinc-600",
  SUSPENDED: "border-red-200 bg-red-50 text-red-600",
  EXPIRED: "border-amber-200 bg-amber-50 text-amber-700",
  ARCHIVED: "border-zinc-200 bg-zinc-100 text-zinc-500",
};

const SUB_BADGE: Record<string, string> = {
  TRIALING: "border-amber-200 bg-amber-50 text-amber-700",
  ACTIVE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  PAST_DUE: "border-amber-200 bg-amber-100 text-amber-800",
  EXPIRED: "border-red-200 bg-red-50 text-red-600",
  CANCELED: "border-zinc-200 bg-zinc-100 text-zinc-500",
};

const LEAD_BADGE: Record<string, string> = {
  NEW: "border-emerald-200 bg-emerald-50 text-emerald-700",
  CONTACTED: "border-amber-200 bg-amber-50 text-amber-700",
  FOLLOW_UP: "border-amber-200 bg-amber-50 text-amber-700",
  QUALIFIED: "border-amber-200 bg-amber-100 text-amber-800",
  CONVERTED: "border-emerald-600 bg-emerald-600 text-white",
  CLOSED: "border-zinc-200 bg-zinc-100 text-zinc-600",
  SPAM: "border-red-200 bg-red-50 text-red-600",
};

function StatusBadge({ status, map }: { status: string; map: Record<string, string> }) {
  return (
    <Badge variant="outline" className={`border ${map[status] || "border-zinc-200 bg-zinc-100 text-zinc-600"}`}>
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
        <h1 className="text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl">{title}</h1>
        <p className="mt-1 text-sm text-zinc-500">{desc}</p>
      </div>
      {action}
    </div>
  );
}

function EmptyState({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-12 text-center">
      <Icon className="h-8 w-8 text-zinc-300" aria-hidden="true" />
      <p className="text-sm font-medium text-zinc-700">{title}</p>
      {hint ? <p className="max-w-xs text-xs text-zinc-400">{hint}</p> : null}
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
    <div className="space-y-2.5 rounded-xl border border-zinc-200 bg-white p-4" aria-busy="true">
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
];

export default function AdminView() {
  const adminTab = useApp((s) => s.adminTab);
  const setAdminTab = useApp((s) => s.setAdminTab);
  const user = useApp((s) => s.user);
  const [navOpen, setNavOpen] = useState(false);
  const current = NAV.find((n) => n.id === adminTab) || NAV[0];

  function go(tab: AdminTab) {
    setAdminTab(tab);
    setNavOpen(false);
    window.scrollTo({ top: 0 });
  }

  return (
    <div className="flex min-h-screen bg-zinc-50">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col bg-zinc-900 lg:flex">
        <SidebarBody activeId={adminTab} onNavigate={go} email={user?.email} />
      </aside>

      <div className="flex min-h-screen w-full flex-col lg:pl-60">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-zinc-200 bg-white/95 px-4 backdrop-blur sm:px-6">
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
                  <SidebarBody activeId={adminTab} onNavigate={go} email={user?.email} inSheet />
                </div>
              </SheetContent>
            </Sheet>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-sm font-bold text-white lg:hidden">
              W
            </span>
            <div className="min-w-0 leading-tight">
              <p className="text-sm font-bold text-zinc-900">WebSetu Admin</p>
              <p className="hidden text-xs text-zinc-500 sm:block">{current.label}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <span className="hidden max-w-[220px] truncate text-xs text-zinc-500 md:block">{user?.email}</span>
            <a
              href="#/"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:border-emerald-300 hover:text-emerald-700"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Back to site</span>
              <span className="sm:hidden">Site</span>
            </a>
          </div>
        </header>

        {/* Tab content */}
        <main className="flex-1 p-4 sm:p-6">
          {adminTab === "overview" && <OverviewTab />}
          {adminTab === "customers" && <CustomersTab />}
          {adminTab === "plans" && <PlansTab />}
          {adminTab === "templates" && <TemplatesTab />}
          {adminTab === "coupons" && <CouponsTab />}
          {adminTab === "leads" && <PlatformLeadsTab />}
        </main>

        {/* Sticky footer (mt-auto pushes to bottom when content is short) */}
        <footer className="mt-auto border-t border-zinc-200 bg-white px-4 py-4 text-xs text-zinc-500 sm:px-6">
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
  inSheet,
}: {
  activeId: AdminTab;
  onNavigate: (t: AdminTab) => void;
  email?: string;
  inSheet?: boolean;
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
                  : "text-zinc-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-zinc-800 p-3">
        <div className="flex items-center gap-2.5 rounded-lg bg-white/5 px-3 py-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600/20 text-xs font-bold text-emerald-300">
            {(email || "A").charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-white">{email || "admin@websetu.in"}</p>
            <p className="text-[11px] text-zinc-500">Super Admin</p>
          </div>
        </div>
        <a
          href="#/"
          className="mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-zinc-400 transition hover:bg-white/5 hover:text-white"
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
        <TabHeader title="Overview" desc="Platform health, revenue and activity at a glance." />
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
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Refresh
          </Button>
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
                <p className="text-xs text-zinc-500">{monthLabel}</p>
                <p className="text-3xl font-bold tracking-tight text-emerald-700">{inr(stats.monthRevenue)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-zinc-500">All-time revenue</p>
                <p className="text-xl font-semibold text-zinc-900">{inr(stats.totalRevenue)}</p>
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
                <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-zinc-200 text-xs text-zinc-400">
                  <TrendingUp className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Sparkline appears once there are two or more payments
                </div>
              )}
            </div>
            <Separator className="my-4" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {miniStats.map((m) => (
                <div key={m.label} className="rounded-lg bg-zinc-50 p-3">
                  <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                    <m.icon className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> {m.label}
                  </div>
                  <p className="mt-1 text-lg font-bold text-zinc-900">{m.value.toLocaleString("en-IN")}</p>
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
              <p className="py-8 text-center text-sm text-zinc-400">No payments yet</p>
            ) : (
              <ul className="space-y-3">
                {stats.recentPayments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-zinc-800">{p.invoiceNo || "—"}</p>
                      <p className="truncate text-xs text-zinc-400">
                        {p.method} {p.couponCode ? `· ${p.couponCode}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold text-emerald-700">{inr(p.amount)}</p>
                      <p className="text-xs text-zinc-400">{fmtDate(p.createdAt)}</p>
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
          <div key={k.label} className="rounded-xl border border-zinc-200 bg-white p-4">
            <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${k.tone}`}>
              <k.icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <p className="mt-3 text-2xl font-bold tracking-tight text-zinc-900">
              {k.value.toLocaleString("en-IN")}
            </p>
            <p className="mt-0.5 text-xs leading-snug text-zinc-500">{k.label}</p>
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
                    <TableRow className="bg-zinc-50 hover:bg-zinc-50">
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
                        <TableCell className="whitespace-nowrap font-mono text-xs font-medium text-zinc-700">
                          {p.invoiceNo || "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-semibold text-emerald-700">{inr(p.amount)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-zinc-200 bg-zinc-50 text-zinc-600">
                            {p.method}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate text-sm text-zinc-600" title={p.description}>
                          {p.description || "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right text-sm text-zinc-500">
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
                        <p className="truncate text-sm font-medium text-zinc-900">{l.name}</p>
                        <StatusBadge status={l.status} map={LEAD_BADGE} />
                      </div>
                      <p className="mt-0.5 truncate text-xs text-zinc-500">
                        {l.business?.name || "—"} · {l.phone}
                      </p>
                    </div>
                    <span className="shrink-0 pt-0.5 text-xs text-zinc-400">{fmtDate(l.createdAt)}</span>
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

interface CustomerRow {
  id: string; name: string; email: string; createdAt: string;
  business: Business | null; subscription: Subscription | null;
}

/** /api/admin/customers has no revenue aggregates — those columns are skipped. */
function exportCustomersCsv(rows: CustomerRow[]) {
  const head = ["Name", "Email", "Business", "Website (slug)", "Website status", "Plan", "Status", "Created"];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csvRows = rows.map((r) => [
    r.name,
    r.email,
    r.business?.name || "",
    r.business?.slug || "",
    r.business?.status || "",
    r.subscription?.plan?.name || "",
    r.subscription?.status || "",
    new Date(r.createdAt).toLocaleString("en-IN"),
  ].map(esc).join(","));
  const csv = [head.map(esc).join(","), ...csvRows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "websetu-customers.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function CustomersTab() {
  const openSite = useApp((s) => s.openSite);
  const [rows, setRows] = useState<CustomerRow[] | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState<ConfirmReq | null>(null);

  const load = useCallback(() => {
    return api
      .get<CustomerRow[]>("/api/admin/customers")
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

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!rows) return [];
    if (!needle) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(needle) ||
        r.email.toLowerCase().includes(needle) ||
        (r.business?.name || "").toLowerCase().includes(needle) ||
        (r.business?.slug || "").toLowerCase().includes(needle),
    );
  }, [rows, q]);

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

  return (
    <div>
      <TabHeader
        title="Customers"
        desc="All customer accounts, their websites and subscriptions."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => exportCustomersCsv(filtered)}
              disabled={filtered.length === 0}
              aria-label="Export customers as CSV"
            >
              <Download className="h-4 w-4" aria-hidden="true" /> Export CSV
            </Button>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
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
          hint={q ? "Try a different name, email or business." : "Customers appear here after they sign up."}
        />
      ) : (
        <>
          <p className="mb-2 text-xs text-zinc-500">
            Showing {filtered.length} of {rows.length} customers
          </p>
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="overflow-x-auto">
              <Table className="min-w-[860px]">
                <TableHeader>
                  <TableRow className="bg-zinc-50 hover:bg-zinc-50">
                    <TableHead>Customer</TableHead>
                    <TableHead>Business</TableHead>
                    <TableHead>Website</TableHead>
                    <TableHead>Plan</TableHead>
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
                            <p className="truncate text-sm font-medium text-zinc-900">{r.name}</p>
                            <p className="truncate text-xs text-zinc-500">{r.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {r.business ? (
                          <div className="min-w-0">
                            <p className="truncate text-sm text-zinc-800">{r.business.name}</p>
                            <p className="truncate font-mono text-xs text-zinc-400">/{r.business.slug}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-zinc-400">No website yet</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.business ? (
                          <StatusBadge status={r.business.status} map={BIZ_BADGE} />
                        ) : (
                          <span className="text-xs text-zinc-400">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.subscription ? (
                          <div className="flex flex-col items-start gap-1">
                            <span className="text-sm text-zinc-800">
                              {r.subscription.plan?.name || "Plan"}
                            </span>
                            <StatusBadge status={r.subscription.status} map={SUB_BADGE} />
                          </div>
                        ) : (
                          <span className="text-xs text-zinc-400">No subscription</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-zinc-600">{fmtDate(r.createdAt)}</TableCell>
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
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
          <ConfirmDialog req={confirm} onOpenChange={(o) => !o && setConfirm(null)} />
        </>
      )}
    </div>
  );
}

/* ==================================== PLANS ==================================== */

interface PlanForm {
  name: string; tagline: string; priceMonthly: string; priceYearly: string;
  features: string; maxPages: string; aiCredits: string; popular: boolean; active: boolean;
}

const EMPTY_PLAN: PlanForm = {
  name: "", tagline: "", priceMonthly: "499", priceYearly: "4999", features: "",
  maxPages: "10", aiCredits: "20", popular: false, active: true,
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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((p) => (
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
                  {!p.active && <Badge variant="outline" className="border-zinc-300 text-zinc-500">Inactive</Badge>}
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold tracking-tight text-zinc-900">{inr(p.priceMonthly)}</span>
                  <span className="text-xs text-zinc-500">/month</span>
                  <span className="ml-2 text-sm text-zinc-500">or {inr(p.priceYearly)}/yr</span>
                </div>
                <Separator className="my-3" />
                {p.features.length === 0 ? (
                  <p className="text-xs text-zinc-400">No features listed</p>
                ) : (
                  <ul className="space-y-1.5">
                    {p.features.slice(0, 4).map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-zinc-600">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                        <span className="line-clamp-1">{f}</span>
                      </li>
                    ))}
                    {p.features.length > 4 && (
                      <li className="pl-5 text-xs text-zinc-400">+{p.features.length - 4} more</li>
                    )}
                  </ul>
                )}
                <p className="mt-3 text-xs text-zinc-400">
                  {p.maxPages === -1 ? "Unlimited pages" : `${p.maxPages} pages`} · {p.aiCredits} AI credits/mo
                </p>
              </CardContent>
              <div className="flex justify-end gap-2 border-t border-zinc-100 px-4 py-3">
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
          ))}
        </div>
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
          popular: plan.popular,
          active: plan.active,
        }
      : EMPTY_PLAN,
  );
  const [saving, setSaving] = useState(false);

  function set<K extends keyof PlanForm>(key: K, value: PlanForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    if (!form.name.trim()) {
      toast({ title: "Plan name is required", variant: "destructive" });
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
              <p className="text-xs text-zinc-400">-1 means unlimited</p>
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
          </div>
          <div className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2.5">
            <div>
              <Label htmlFor="plan-popular">Mark as Popular</Label>
              <p className="text-xs text-zinc-400">Highlights the plan on the pricing grid</p>
            </div>
            <Switch id="plan-popular" checked={form.popular} onCheckedChange={(v) => set("popular", v)} />
          </div>
          {isEdit && (
            <div className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2.5">
              <div>
                <Label htmlFor="plan-active">Active</Label>
                <p className="text-xs text-zinc-400">Inactive plans are hidden from checkout</p>
              </div>
              <Switch id="plan-active" checked={form.active} onCheckedChange={(v) => set("active", v)} />
            </div>
          )}
        </div>

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
                    <Badge className="border-0 bg-white/90 text-amber-700 hover:bg-white/90">
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
                  <p className="font-semibold text-zinc-900">{t.name}</p>
                  <Badge variant="outline" className="shrink-0 border-zinc-200 bg-zinc-50 text-[10px] uppercase tracking-wide text-zinc-500">
                    {t.category}
                  </Badge>
                </div>
                <p className="mt-1.5 line-clamp-2 min-h-10 text-sm text-zinc-500">
                  {t.description || "No description"}
                </p>
              </CardContent>
              <div className="flex justify-end gap-2 border-t border-zinc-100 px-4 py-3">
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

  function set<K extends keyof TemplateForm>(key: K, value: TemplateForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Keep the Select valid if the stored gradient isn't one of the seed options.
  const gradientOptions = GRADIENTS.includes(form.gradient) ? GRADIENTS : [form.gradient, ...GRADIENTS];

  async function save() {
    if (form.name.trim().length < 2) {
      toast({ title: "Template name must be at least 2 characters", variant: "destructive" });
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
          <div className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2.5">
            <div>
              <Label htmlFor="tpl-premium">Premium</Label>
              <p className="text-xs text-zinc-400">Premium templates can be restricted to paid plans</p>
            </div>
            <Switch id="tpl-premium" checked={form.premium} onCheckedChange={(v) => set("premium", v)} />
          </div>
          {isEdit && (
            <div className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2.5">
              <div>
                <Label htmlFor="tpl-active">Active</Label>
                <p className="text-xs text-zinc-400">Inactive templates are hidden from onboarding</p>
              </div>
              <Switch id="tpl-active" checked={form.active} onCheckedChange={(v) => set("active", v)} />
            </div>
          )}
        </div>

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
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="overflow-x-auto">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow className="bg-zinc-50 hover:bg-zinc-50">
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
                      <p className="font-mono text-sm font-semibold text-zinc-900">{c.code}</p>
                      {c.description ? (
                        <p className="max-w-[200px] truncate text-xs text-zinc-400" title={c.description}>
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
                    <TableCell className="whitespace-nowrap text-sm font-medium text-zinc-800">
                      {c.type === "PERCENT" ? `${c.value}%` : inr(c.value)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-zinc-600">
                      {c.usedCount}/{c.maxUses}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={c.active}
                        onCheckedChange={(v) => void toggleCoupon(c, v)}
                        aria-label={`Toggle ${c.code}`}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-zinc-500">{fmtDate(c.expiresAt)}</TableCell>
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

  async function save() {
    const value = Number(form.value) || 0;
    if (!form.code.trim()) {
      toast({ title: "Coupon code is required", variant: "destructive" });
      return;
    }
    if (value <= 0) {
      toast({ title: "Discount value must be positive", variant: "destructive" });
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
}

const P_LEAD_STATUSES = ["NEW", "CONTACTED", "CONVERTED", "CLOSED"] as const;

const SOURCE_BADGE: Record<string, string> = {
  CONTACT: "border-zinc-200 bg-zinc-100 text-zinc-600",
  DEMO: "border-amber-200 bg-amber-50 text-amber-700",
  SALES: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

function PlatformLeadsTab() {
  const [rows, setRows] = useState<PLeadRow[] | null>(null);
  const [err, setErr] = useState("");

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
          <p className="mb-2 text-xs text-zinc-500">{rows.length} lead{rows.length === 1 ? "" : "s"}</p>
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="overflow-x-auto">
              <Table className="min-w-[920px]">
                <TableHeader>
                  <TableRow className="bg-zinc-50 hover:bg-zinc-50">
                    <TableHead>Lead</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Business type</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Initial text={l.name} />
                          <p className="truncate text-sm font-medium text-zinc-900">{l.name}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="whitespace-nowrap text-sm text-zinc-700">{l.phone || "—"}</p>
                        <p className="truncate text-xs text-zinc-400">{l.email || "—"}</p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-zinc-600">{l.businessType || "—"}</TableCell>
                      <TableCell
                        className="max-w-[220px] truncate text-sm text-zinc-600"
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
                      <TableCell className="whitespace-nowrap text-right text-sm text-zinc-500">
                        {fmtDate(l.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

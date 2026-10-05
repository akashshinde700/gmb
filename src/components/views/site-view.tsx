"use client";
// WebSetu — SiteView: renders a tenant website full-screen (like visiting business.websetu.in).
// Public visitors get the pure site; admins opening from the dashboard get a slim preview bar
// with device toggles. Handles 404/402/403 with branded error screens.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, ArrowLeft, ArrowRight, Clock, Globe, Loader2, Monitor,
  ShieldAlert, Smartphone, Tablet, type LucideIcon,
} from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import { useApp } from "@/store/app-store";
import type { SitePayload } from "@/lib/types";
import SiteRenderer, { type Device } from "@/components/site/site-renderer";
import { Button } from "@/components/ui/button";

interface ErrorMeta {
  icon: LucideIcon;
  title: string;
  tone: string;
}

const ERROR_META: Record<number, ErrorMeta> = {
  404: { icon: Globe, title: "Website not found", tone: "text-muted-foreground" },
  402: { icon: Clock, title: "Website expired", tone: "text-amber-500" },
  403: { icon: ShieldAlert, title: "Website suspended", tone: "text-red-500" },
};
const FALLBACK_ERROR: ErrorMeta = {
  icon: AlertTriangle,
  title: "Something went wrong",
  tone: "text-amber-500",
};

const BUSINESS_STATUS_PILL: Record<string, string> = {
  PUBLISHED: "border-emerald-400/30 bg-emerald-500/20 text-emerald-300",
  DRAFT: "border-zinc-400/30 bg-zinc-500/20 text-zinc-300",
  SUSPENDED: "border-red-400/30 bg-red-500/20 text-red-300",
  EXPIRED: "border-amber-400/30 bg-amber-500/20 text-amber-300",
  ARCHIVED: "border-zinc-400/20 bg-zinc-500/20 text-muted-foreground",
};

const DEVICES: { id: Device; icon: LucideIcon; label: string }[] = [
  { id: "desktop", icon: Monitor, label: "Desktop preview" },
  { id: "tablet", icon: Tablet, label: "Tablet preview" },
  { id: "mobile", icon: Smartphone, label: "Mobile preview" },
];

export default function SiteView({ slug }: { slug: string }) {
  const siteOrigin = useApp((s) => s.siteOrigin);
  // Result is keyed by slug so a slug change immediately re-enters the loading state
  // without synchronously resetting state inside the effect.
  const [result, setResult] = useState<{ slug: string; payload?: SitePayload; error?: ApiError } | null>(null);
  const [device, setDevice] = useState<Device>("desktop");

  // Load the site payload on mount + every slug change
  useEffect(() => {
    let cancelled = false;
    api
      .get<SitePayload>(`/api/site/${slug}`)
      .then(
        (d) => {
          if (!cancelled) setResult({ slug, payload: d });
        },
        (e: unknown) => {
          if (!cancelled)
            setResult({
              slug,
              error:
                e instanceof ApiError
                  ? e
                  : new ApiError(e instanceof Error ? e.message : "Something went wrong", 0),
            });
        },
      )
      .catch(() => {}); // handled above
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const loading = !result || result.slug !== slug;
  const payload = loading ? null : (result.payload ?? null);
  const error = loading ? null : (result.error ?? null);

  if (loading) return <LoadingScreen />;

  if (error || !payload) {
    const status = error?.status ?? 0;
    const meta = ERROR_META[status] || FALLBACK_ERROR;
    return (
      <ErrorScreen
        slug={slug}
        meta={meta}
        message={error?.message || "The website could not be loaded."}
        status={status}
        fromDashboard={siteOrigin === "dashboard"}
      />
    );
  }

  const isPreview = siteOrigin === "dashboard" || payload.published === false;

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {isPreview && (
        <PreviewBar
          name={payload.business.name}
          status={payload.business.status}
          device={device}
          setDevice={setDevice}
        />
      )}
      <div
        className={
          isPreview
            ? // Preview chrome: pad below the fixed bar, tint backdrop for device frames,
              // and keep the site header sticky *below* the bar instead of under it.
              "flex-1 bg-zinc-100 pt-10 [&>div>header]:top-10"
            : "flex-1"
        }
      >
        <SiteRenderer payload={payload} mode={payload.published === false ? "preview" : "live"} device={device} />
      </div>
    </div>
  );
}

/* ---------------------------------- screens --------------------------------- */

function LoadingScreen() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#fafaf9] px-4"
      role="status"
      aria-label="Loading website"
    >
      <a href="/" className="flex items-center gap-2.5" aria-label="WebSetu home">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-lg font-bold text-white">
          W
        </span>
        <span className="text-lg font-bold text-foreground">WebSetu</span>
      </a>
      <Loader2 className="h-5 w-5 animate-spin text-emerald-600" aria-hidden="true" />
    </div>
  );
}

function ErrorScreen({
  slug,
  meta,
  message,
  status,
  fromDashboard,
}: {
  slug: string;
  meta: ErrorMeta;
  message: string;
  status: number;
  fromDashboard: boolean;
}) {
  const Icon = meta.icon;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#fafaf9] px-4 py-16 text-center">
      <a href="/" className="flex items-center gap-2.5" aria-label="WebSetu home">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-lg font-bold text-white">
          W
        </span>
        <span className="text-lg font-bold text-foreground">WebSetu</span>
      </a>

      <div
        className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-white shadow-sm"
        aria-hidden="true"
      >
        <Icon className={`h-8 w-8 ${meta.tone}`} />
      </div>

      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{meta.title}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{message}</p>
        {slug ? (
          <p className="mt-3 font-mono text-xs text-muted-foreground">{slug}.websetu.in</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {status === 404 && (
          <a
            href="/"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:scale-95"
          >
            Create your own website <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        )}
        {fromDashboard && (
          <Button variant="outline" onClick={() => window.history.back()}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
          </Button>
        )}
      </div>
    </div>
  );
}

/* -------------------------------- preview bar ------------------------------- */

function PreviewBar({
  name,
  status,
  device,
  setDevice,
}: {
  name: string;
  status: string;
  device: Device;
  setDevice: (d: Device) => void;
}) {
  const router = useRouter();
  return (
    <div className="fixed inset-x-0 top-0 z-50 flex h-10 items-center justify-between gap-2 bg-zinc-900 px-3 text-white sm:px-4">
      <div className="flex min-w-0 items-center gap-2">
        <span className="hidden shrink-0 items-center gap-1.5 text-xs text-muted-foreground sm:flex">
          <Monitor className="h-3.5 w-3.5" aria-hidden="true" /> Previewing
        </span>
        <span className="truncate text-xs font-semibold">{name}</span>
        <span
          className={`hidden shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide md:inline ${
            BUSINESS_STATUS_PILL[status] || BUSINESS_STATUS_PILL.DRAFT
          }`}
        >
          {status.toLowerCase()}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <div
          className="flex items-center gap-0.5 rounded-lg bg-white/10 p-0.5"
          role="group"
          aria-label="Preview device"
        >
          {DEVICES.map((d) => {
            const active = device === d.id;
            return (
              <button
                key={d.id}
                type="button"
                aria-label={d.label}
                aria-pressed={active}
                onClick={() => setDevice(d.id)}
                className={`flex h-7 w-7 items-center justify-center rounded-md transition ${
                  active
                    ? "bg-white text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-white/10 hover:text-white"
                }`}
              >
                <d.icon className="h-4 w-4" aria-hidden="true" />
              </button>
            );
          })}
        </div>
        <Button
          size="sm"
          className="h-7 gap-1.5 bg-emerald-600 px-2.5 text-xs font-semibold text-white hover:bg-emerald-700"
          onClick={() => {
            router.push("/dashboard");
          }}
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Back to Dashboard</span>
          <span className="sm:hidden">Dashboard</span>
        </Button>
      </div>
    </div>
  );
}

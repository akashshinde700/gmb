"use client";
// WebSetu — the primitives both console views are built from.
//
// These lived inside dashboard-view.tsx, which meant nothing else could use
// them without importing a 3,800-line module. Pulling a tab out into its own
// file starts here: the shared pieces have to have a home first.
//
// Presentation only — no data fetching, no business rules. Anything that knows
// about leads or plans belongs in the tab that owns it, not in here.

import type { LucideIcon } from "lucide-react";
import { AlertCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/* --------------------------------- format --------------------------------- */

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong. Please try again.";
}

export function timeAgo(iso: string): string {
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

export function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/* ------------------------------- primitives -------------------------------- */

export function Labeled({ label, children, hint }: {
  label: string; children: React.ReactNode; hint?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-medium leading-none text-muted-foreground">{label}</span>
      {children}
      {hint ? <span className="block text-[11px] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export function PageHeader({ title, subtitle, action }: {
  title: string; subtitle?: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, hint, action }: {
  icon: LucideIcon; title: string; hint?: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed bg-muted/60 px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-card text-muted-foreground shadow-sm">
        <Icon className="h-6 w-6" />
      </span>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {hint ? <p className="max-w-sm text-xs text-muted-foreground">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function LoadingRows({ n = 3 }: { n?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: n }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-2xl" />
      ))}
    </div>
  );
}

export function DeleteConfirm({ onConfirm, label, disabled, name }: {
  onConfirm: () => void; label: string; disabled?: boolean;
  /** What is being deleted — a screen reader hears "Delete" ten times over. */
  name?: string;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-red-600"
          disabled={disabled}
          aria-label={name ? `Delete ${name}` : "Delete"}
          title={name ? `Delete ${name}` : "Delete"}
        >
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

/**
 * A form-level error, shown inside the form it belongs to.
 *
 * Validation used to arrive as a toast: it appeared in a corner, away from the
 * field at fault, and vanished on its own. On a phone, with the keyboard up, it
 * was often never seen at all — the user just watched Save do nothing.
 *
 * `role="alert"` so a screen reader announces it, and it sits in the flow so it
 * stays put until the problem is fixed.
 */
export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-1.5 rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
    >
      <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {message}
    </p>
  );
}

/* ---------------------------------- CSV ----------------------------------- */

/**
 * CSV cell escaping.
 *
 * A leading =, +, - or @ makes Excel and Sheets treat the value as a formula,
 * so lead-supplied text — which the business owner did not write — is prefixed
 * with a quote before it can become one.
 */
export function csvCell(v: unknown): string {
  const raw = String(v ?? "");
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Trigger a client-side CSV download. */
export function downloadCsv(filename: string, head: string[], rows: unknown[][]) {
  const csv = [
    head.map(csvCell).join(","),
    ...rows.map((r) => r.map(csvCell).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

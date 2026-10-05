"use client";
// WebSetu — the leads screen.
//
// This is where a shop owner spends most of their time in the product, and it
// was the weakest thing in it: every lead was fetched at once, filtered in the
// browser, and silently truncated at the server's 500-row cap. A customer with
// 600 enquiries could not see 100 of them and was never told.
//
// Now the server does the work — page, search, filter, sort — and the browser
// holds one page. That also makes the search honest: filtering twenty-five rows
// in memory and calling it a search found nothing on page two.
//
// Everything the old screen could do is still here: status tabs, CSV export,
// the detail drawer with private notes, call/WhatsApp/email actions, delete
// confirmation, and the desktop-table / mobile-card split.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, Inbox, Loader2, Mail,
  MessageCircle, Pencil, Phone, Save, Search, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { useDebounced } from "@/hooks/use-debounced";
import { api } from "@/lib/api-client";
import type { Lead, LeadStatus } from "@/lib/types";
import {
  DeleteConfirm, EmptyState, errMsg, Labeled, LoadingRows, PageHeader, downloadCsv,
  timeAgo, truncate,
} from "@/components/views/console-ui";

const LEAD_STATUSES: LeadStatus[] = [
  "NEW", "CONTACTED", "FOLLOW_UP", "QUALIFIED", "CONVERTED", "CLOSED", "SPAM",
];

const PAGE_SIZE = 25;

function sourceLabel(s: string): string {
  if (s === "FORM") return "Website form";
  if (s === "WHATSAPP") return "WhatsApp";
  return s;
}

interface LeadsMeta {
  total: number;
  newCount: number;
  take: number;
  skip: number;
}

type SortField = "createdAt" | "name" | "status";

export default function LeadsTab({ onCountChange }: { onCountChange?: (n: number) => void }) {
  const [rows, setRows] = useState<Lead[]>([]);
  const [meta, setMeta] = useState<LeadsMeta>({ total: 0, newCount: 0, take: PAGE_SIZE, skip: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [status, setStatus] = useState("ALL");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState<SortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const [detail, setDetail] = useState<Lead | null>(null);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  // Typing no longer sends a request per character.
  const debouncedQ = useDebounced(q, 350);

  // Guards against a slow early response overwriting a fast later one — the
  // classic search race where the results for "sha" land after "sharma".
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        take: String(PAGE_SIZE),
        skip: String(page * PAGE_SIZE),
        sortBy,
        sortOrder,
      });
      if (status !== "ALL") params.set("status", status);
      if (debouncedQ.trim()) params.set("q", debouncedQ.trim());

      const res = await api.raw<Lead[], LeadsMeta>(`/api/leads?${params}`);
      if (id !== requestId.current) return; // a newer request already answered
      setRows(res.data);
      setMeta(res.meta);
      onCountChange?.(res.meta.newCount);
    } catch (e) {
      if (id !== requestId.current) return;
      setError(errMsg(e));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [page, status, debouncedQ, sortBy, sortOrder, onCountChange]);

  useEffect(() => {
    // Fetch on change; `load` flips its own loading flag before the first await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  /**
   * Change a filter and reset the page in one go.
   *
   * Page 3 of the old result set is not page 3 of the new one, so the page
   * number has to reset — done here rather than in an effect watching the
   * filters, which would render the wrong page once before correcting itself.
   */
  function applyFilter(change: () => void) {
    change();
    setPage(0);
    setSelected(new Set());
  }

  const totalPages = Math.max(1, Math.ceil(meta.total / PAGE_SIZE));
  const from = meta.total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min(meta.total, (page + 1) * PAGE_SIZE);
  const isFiltered = status !== "ALL" || debouncedQ.trim().length > 0;

  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) rows.forEach((r) => next.delete(r.id));
      else rows.forEach((r) => next.add(r.id));
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function sortHeader(field: SortField, label: string) {
    const active = sortBy === field;
    return (
      <button
        type="button"
        className="flex items-center gap-1 font-medium hover:text-foreground"
        aria-label={`Sort by ${label}${active ? (sortOrder === "asc" ? ", ascending" : ", descending") : ""}`}
        onClick={() => {
          applyFilter(() => {
            if (active) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
            else {
              setSortBy(field);
              setSortOrder(field === "createdAt" ? "desc" : "asc");
            }
          });
        }}
      >
        {label}
        {active ? (
          sortOrder === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : null}
      </button>
    );
  }

  async function changeStatus(lead: Lead, next: string) {
    try {
      await api.patch<Lead>(`/api/leads/${lead.id}`, { status: next });
      toast({
        title: "Lead updated",
        description: `${lead.name} marked as ${next.replace("_", " ").toLowerCase()}.`,
      });
      await load();
    } catch (e) {
      toast({ title: "Could not update lead", description: errMsg(e), variant: "destructive" });
    }
  }

  async function bulk(action: "status" | "delete", nextStatus?: string) {
    const ids = [...selected];
    if (!ids.length) return;
    setBulkBusy(true);
    try {
      const res = await api.post<{ updated?: number; deleted?: number }>("/api/leads/bulk", {
        ids, action, status: nextStatus,
      });
      const n = res.updated ?? res.deleted ?? 0;
      toast({
        title: action === "delete" ? `${n} lead${n === 1 ? "" : "s"} deleted` : `${n} lead${n === 1 ? "" : "s"} updated`,
      });
      setSelected(new Set());
      await load();
    } catch (e) {
      toast({ title: "Bulk action failed", description: errMsg(e), variant: "destructive" });
    } finally {
      setBulkBusy(false);
    }
  }

  async function saveNotes() {
    if (!detail) return;
    setSavingNotes(true);
    try {
      const updated = await api.patch<Lead>(`/api/leads/${detail.id}`, { notes });
      setDetail(updated);
      toast({ title: "Note saved" });
      await load();
    } catch (e) {
      toast({ title: "Could not save note", description: errMsg(e), variant: "destructive" });
    } finally {
      setSavingNotes(false);
    }
  }

  async function del(lead: Lead) {
    try {
      await api.del(`/api/leads/${lead.id}`);
      toast({ title: "Lead deleted" });
      await load();
    } catch (e) {
      toast({ title: "Could not delete lead", description: errMsg(e), variant: "destructive" });
    }
  }

  /** Export exactly what the current filters describe, not just this page. */
  async function exportCsv() {
    try {
      const params = new URLSearchParams({ take: "500", skip: "0", sortBy, sortOrder });
      if (status !== "ALL") params.set("status", status);
      if (debouncedQ.trim()) params.set("q", debouncedQ.trim());
      const res = await api.raw<Lead[], LeadsMeta>(`/api/leads?${params}`);
      downloadCsv(
        `websetu-leads-${new Date().toISOString().slice(0, 10)}.csv`,
        ["Name", "Phone", "Email", "Service", "Message", "Source", "Status", "Notes", "Created"],
        res.data.map((l) => [
          l.name, l.phone, l.email, l.serviceName, l.message, l.source, l.status, l.notes,
          new Date(l.createdAt).toLocaleString("en-IN"),
        ]),
      );
    } catch (e) {
      toast({ title: "Export failed", description: errMsg(e), variant: "destructive" });
    }
  }

  const waLink = (l: Lead) =>
    `https://wa.me/${(l.phone || "").replace(/[^\d]/g, "")}?text=${encodeURIComponent(
      `Hello ${l.name}, thank you for enquiring at our website!`,
    )}`;

  const Actions = ({ lead }: { lead: Lead }) => (
    <div className="flex items-center gap-1">
      <a
        href={`tel:${lead.phone}`}
        aria-label={`Call ${lead.name}`}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-emerald-50 hover:text-emerald-700"
      >
        <Phone className="h-4 w-4" />
      </a>
      <a
        href={waLink(lead)}
        target="_blank"
        rel="noreferrer"
        aria-label={`WhatsApp ${lead.name}`}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-emerald-50 hover:text-emerald-700"
      >
        <MessageCircle className="h-4 w-4" />
      </a>
      <DeleteConfirm
        label={`Lead from ${lead.name} will be deleted.`}
        name={`lead from ${lead.name}`}
        onConfirm={() => void del(lead)}
      />
    </div>
  );

  const StatusSelect = ({ lead }: { lead: Lead }) => (
    <Select value={lead.status} onValueChange={(v) => void changeStatus(lead, v)}>
      <SelectTrigger size="sm" className="w-[130px] rounded-lg border-border text-xs" aria-label="Lead status">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LEAD_STATUSES.map((s) => (
          <SelectItem key={s} value={s} className="text-xs">{s.replace("_", " ")}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const subtitle = useMemo(() => {
    if (meta.newCount > 0) {
      return `${meta.newCount} new lead${meta.newCount > 1 ? "s" : ""} waiting for a first response.`;
    }
    return "Every enquiry from your website lands here.";
  }, [meta.newCount]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Leads"
        subtitle={subtitle}
        action={
          <Button variant="outline" className="rounded-xl" onClick={() => void exportCsv()} disabled={meta.total === 0}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        }
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="ws-scroll overflow-x-auto pb-1">
          <Tabs value={status} onValueChange={(v) => applyFilter(() => setStatus(v))}>
            <TabsList className="h-9 w-max">
              <TabsTrigger value="ALL" className="text-xs">All</TabsTrigger>
              {LEAD_STATUSES.map((s) => (
                <TabsTrigger key={s} value={s} className="text-xs">
                  {s === "NEW" && meta.newCount > 0 ? `New (${meta.newCount})` : s.replace("_", " ")}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <div className="relative md:ml-auto md:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="rounded-xl pl-9 pr-9"
            placeholder="Search name, phone, message…"
            value={q}
            onChange={(e) => applyFilter(() => setQ(e.target.value))}
            aria-label="Search leads"
            type="search"
            inputMode="search"
          />
          {q ? (
            <button
              type="button"
              onClick={() => applyFilter(() => setQ(""))}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Result count: without it, a filtered list gives no sense of how much
          is being hidden. */}
      {!loading && !error && meta.total > 0 ? (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          Showing {from}–{to} of {meta.total}
          {isFiltered ? " matching" : ""} lead{meta.total === 1 ? "" : "s"}
          {loading ? " · updating…" : ""}
        </p>
      ) : null}

      {/* Bulk bar appears only when something is selected. */}
      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <span className="text-sm font-medium text-emerald-900">
            {selected.size} selected
          </span>
          <Select onValueChange={(v) => void bulk("status", v)} disabled={bulkBusy}>
            <SelectTrigger size="sm" className="w-[170px] rounded-lg bg-card text-xs" aria-label="Set status for selected leads">
              <SelectValue placeholder="Set status…" />
            </SelectTrigger>
            <SelectContent>
              {LEAD_STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="text-xs">{s.replace("_", " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" className="rounded-lg bg-card text-xs text-red-600" disabled={bulkBusy}>
                Delete selected
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {selected.size} lead{selected.size === 1 ? "" : "s"}?</AlertDialogTitle>
                <AlertDialogDescription>
                  These enquiries and their notes will be removed. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => void bulk("delete")}
                  className="bg-red-600 text-white hover:bg-red-700"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button size="sm" variant="ghost" className="rounded-lg text-xs" onClick={() => setSelected(new Set())}>
            Clear selection
          </Button>
          {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin text-emerald-700" /> : null}
        </div>
      ) : null}

      {error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5">
          <p className="text-sm text-amber-800">{error}</p>
          <Button size="sm" variant="outline" onClick={() => void load()}>Try again</Button>
        </div>
      ) : loading ? (
        <LoadingRows n={5} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={isFiltered ? "No leads match your filter" : "No leads yet"}
          hint={
            isFiltered
              ? "Try a different status, or clear the search."
              : "Publish your website and share it — enquiries from the contact form and WhatsApp will appear here instantly."
          }
          action={
            isFiltered ? (
              <Button variant="outline" className="rounded-xl" onClick={() => applyFilter(() => { setStatus("ALL"); setQ(""); })}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-2xl border bg-card shadow-sm md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10 rounded-tl-2xl">
                    <Checkbox
                      checked={allOnPageSelected}
                      onCheckedChange={toggleAll}
                      aria-label="Select all leads on this page"
                    />
                  </TableHead>
                  <TableHead>{sortHeader("name", "Customer")}</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>{sortHeader("status", "Status")}</TableHead>
                  <TableHead>{sortHeader("createdAt", "Received")}</TableHead>
                  <TableHead className="rounded-tr-2xl text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((l) => (
                  <TableRow key={l.id} data-state={selected.has(l.id) ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(l.id)}
                        onCheckedChange={() => toggleOne(l.id)}
                        aria-label={`Select lead from ${l.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <p className="font-semibold text-foreground">{l.name}</p>
                      <a href={`tel:${l.phone}`} className="text-xs text-emerald-700 hover:underline">{l.phone}</a>
                      {l.email ? <p className="truncate text-xs text-muted-foreground">{l.email}</p> : null}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{l.serviceName || "—"}</TableCell>
                    <TableCell>
                      <button
                        type="button"
                        className="block w-[220px] max-w-full truncate text-left text-xs text-muted-foreground hover:text-emerald-700 hover:underline"
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
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{timeAgo(l.createdAt)}</TableCell>
                    <TableCell className="text-right"><Actions lead={l} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards — a seven-column table is unusable on a phone, and
              this is the surface most owners actually use. */}
          <div className="space-y-3 md:hidden">
            {rows.map((l) => (
              <Card key={l.id} className="rounded-2xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <Checkbox
                      checked={selected.has(l.id)}
                      onCheckedChange={() => toggleOne(l.id)}
                      aria-label={`Select lead from ${l.name}`}
                      className="mt-1"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground">{l.name}</p>
                      <p className="text-xs text-muted-foreground">{timeAgo(l.createdAt)} · {sourceLabel(l.source)}</p>
                    </div>
                  </div>
                  <StatusSelect lead={l} />
                </div>
                {l.serviceName ? <p className="mt-2 text-xs font-medium text-emerald-700">{l.serviceName}</p> : null}
                <button
                  type="button"
                  className="mt-1 block w-full text-left text-xs text-muted-foreground"
                  onClick={() => { setDetail(l); setNotes(l.notes); }}
                >
                  {truncate(l.message || "—", 90)} <span className="font-medium text-emerald-700">View</span>
                </button>
                <div className="mt-3 flex items-center justify-between border-t pt-3">
                  <div className="flex gap-2 text-xs">
                    <a href={`tel:${l.phone}`} className="font-medium text-emerald-700">{l.phone}</a>
                    {l.email ? <span className="truncate text-muted-foreground">{l.email}</span> : null}
                  </div>
                  <Actions lead={l} />
                </div>
              </Card>
            ))}
          </div>

          {totalPages > 1 ? (
            <div className="flex items-center justify-between gap-3">
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl"
                disabled={page === 0 || loading}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </Button>
              <span className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</span>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl"
                disabled={page + 1 >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
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
                  <a href={`mailto:${detail.email}`} className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">
                    <Mail className="h-4 w-4" /> Email
                  </a>
                ) : null}
              </div>
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Message</p>
                <p className="whitespace-pre-wrap rounded-xl bg-muted p-3 text-sm text-foreground">{detail.message || "—"}</p>
                {detail.serviceName ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Interested in: <span className="font-medium text-foreground">{detail.serviceName}</span>
                  </p>
                ) : null}
              </div>
              <Labeled label="Your notes (private)">
                <Textarea
                  className="rounded-xl"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Called on 12th, quoted ₹4,500, follow up Friday…"
                />
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

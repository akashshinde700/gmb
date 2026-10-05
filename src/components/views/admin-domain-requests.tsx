"use client";
// WebSetu admin — "buy a domain for me" requests: quote, mark paid, connect.

import { useCallback, useEffect, useState } from "react";
import { Globe, Loader2, Phone, RefreshCw } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import { toast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

interface AdminDomainRequest {
  id: string;
  domain: string;
  alternatives: string[];
  note: string;
  availability: string;
  status: string;
  quotedPrice: number | null;
  adminNote: string;
  createdAt: string;
  business: { id: string; name: string; slug: string; phone: string; email: string; ownerName: string };
}

const FILTERS = ["OPEN", "REQUESTED", "QUOTED", "PAID", "CONNECTED", "CANCELLED", "ALL"] as const;
const TONE: Record<string, string> = {
  REQUESTED: "bg-amber-100 text-amber-800",
  QUOTED: "bg-sky-100 text-sky-800",
  PAID: "bg-violet-100 text-violet-800",
  CONNECTED: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-zinc-100 text-zinc-600",
};

function errMsg(e: unknown): string {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Something went wrong";
}

export default function DomainRequestsTab() {
  const [rows, setRows] = useState<AdminDomainRequest[] | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("OPEN");

  const load = useCallback(async () => {
    setRows(null);
    try {
      const status = filter === "OPEN" || filter === "ALL" ? "" : filter;
      const res = await api.get<{ requests: AdminDomainRequest[] }>(
        `/api/admin/domain-requests${status ? `?status=${status}` : ""}`,
      );
      setRows(
        filter === "OPEN"
          ? res.requests.filter((r) => ["REQUESTED", "QUOTED", "PAID"].includes(r.status))
          : res.requests,
      );
    } catch (e) {
      toast({ title: "Could not load domain requests", description: errMsg(e), variant: "destructive" });
      setRows([]);
    }
  }, [filter]);

  useEffect(() => {
    // Fetch whenever the filter changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Domain requests</h2>
          <p className="text-sm text-muted-foreground">
            Customers who asked us to buy their domain. Quote the price → mark paid once received → register
            it at the registrar, point DNS here, then Connect.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              filter === f ? "border-emerald-600 bg-emerald-600 text-white" : "border-border bg-card text-muted-foreground"
            }`}
          >
            {f.charAt(0) + f.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {rows === null ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : rows.length === 0 ? (
        <Card className="rounded-2xl p-8 text-center text-sm text-muted-foreground">No requests here.</Card>
      ) : (
        rows.map((r) => <RequestCard key={r.id} row={r} onChanged={load} />)
      )}
    </div>
  );
}

function RequestCard({ row, onChanged }: { row: AdminDomainRequest; onChanged: () => Promise<void> }) {
  const [price, setPrice] = useState(row.quotedPrice != null ? String(row.quotedPrice) : "");
  const [note, setNote] = useState(row.adminNote);
  const [domain, setDomain] = useState(row.domain);
  const [busy, setBusy] = useState<string | null>(null);

  async function save(status?: string) {
    setBusy(status ?? "save");
    try {
      await api.patch("/api/admin/domain-requests", {
        id: row.id,
        quotedPrice: price.trim() === "" ? null : Number(price),
        adminNote: note,
        ...(domain !== row.domain ? { domain } : {}),
        ...(status ? { status } : {}),
      });
      toast({ title: status ? `Marked ${status.toLowerCase()}` : "Saved", description: status ? "The customer has been notified." : undefined });
      await onChanged();
    } catch (e) {
      toast({ title: "Could not update", description: errMsg(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  const closed = row.status === "CONNECTED" || row.status === "CANCELLED";

  return (
    <Card className="rounded-2xl p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-base font-bold text-foreground">
            <Globe className="h-4 w-4 text-emerald-600" aria-hidden="true" /> {row.domain}
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE[row.status] ?? ""}`}>{row.status}</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Availability when requested: <strong>{row.availability}</strong>
            {row.alternatives.length ? ` · Alternatives: ${row.alternatives.join(", ")}` : ""}
          </p>
          {row.note && <p className="mt-1 text-xs text-foreground">Customer note: {row.note}</p>}
        </div>
        <div className="text-right text-xs">
          <p className="font-semibold text-foreground">{row.business.name}</p>
          <p className="text-muted-foreground">{row.business.ownerName} · {row.business.email}</p>
          <a href={`tel:${row.business.phone}`} className="inline-flex items-center gap-1 font-semibold text-emerald-700">
            <Phone className="h-3 w-3" aria-hidden="true" /> {row.business.phone}
          </a>
          <p className="text-muted-foreground">{new Date(row.createdAt).toLocaleString("en-IN")}</p>
        </div>
      </div>

      {!closed && (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Domain to register
            <Input value={domain} onChange={(e) => setDomain(e.target.value)} className="rounded-xl" />
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Price to customer (₹ / year)
            <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className="rounded-xl" placeholder="e.g. 999" />
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground sm:col-span-3">
            Note shown to the customer (payment details, next steps)
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="rounded-xl" />
          </label>
        </div>
      )}

      {!closed && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void save()}>
            {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
          {row.status === "REQUESTED" && (
            <Button size="sm" disabled={!!busy || !price.trim()} onClick={() => void save("QUOTED")}>
              {busy === "QUOTED" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send quote"}
            </Button>
          )}
          {(row.status === "REQUESTED" || row.status === "QUOTED") && (
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void save("PAID")}>
              {busy === "PAID" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Mark paid"}
            </Button>
          )}
          {row.status === "PAID" && (
            <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={!!busy} onClick={() => void save("CONNECTED")}>
              {busy === "CONNECTED" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Connect to website"}
            </Button>
          )}
          <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" disabled={!!busy} onClick={() => void save("CANCELLED")}>
            Close request
          </Button>
        </div>
      )}
      {row.status === "PAID" && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Before connecting: at the registrar point <code>www</code> (CNAME) and <code>@</code> (A record) at this
          server, then issue the HTTPS certificate in CloudPanel. Connect adds both hostnames to the site.
        </p>
      )}
    </Card>
  );
}

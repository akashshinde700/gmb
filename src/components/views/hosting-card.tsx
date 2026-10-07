"use client";
// WebSetu — the "Hosting & Email" tab.
//
// One screen for everything that has to happen at the registrar for a customer
// domain to be a working business presence: the site records, proof of
// ownership, the certificate permission, and the four email records that decide
// whether a quotation lands in an inbox or a spam folder.
//
// Written for someone with their registrar's DNS page open in the next tab, so
// every record is named literally — type, name, value — and every row carries
// one plain sentence about what it does. The check button runs real DNS lookups
// and says what it actually found, including "it points somewhere else", which
// is the answer people actually need.

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, CircleDashed, Copy, Loader2, Mail, RefreshCw, ShieldCheck, XCircle, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { api, ApiError } from "@/lib/api-client";

interface DnsRecord {
  id: string;
  purpose: "site" | "certificate" | "verification" | "email";
  type: string;
  name: string;
  value: string;
  priority?: number;
  ttl: string;
  why: string;
  required: boolean;
  needsValue?: boolean;
}

interface DnsGroup {
  purpose: DnsRecord["purpose"];
  title: string;
  blurb: string;
  records: DnsRecord[];
}

interface RecordResult {
  id: string;
  status: "ok" | "wrong" | "missing" | "skipped" | "error";
  found: string[];
  detail: string;
}

interface BundleSummary {
  total: number;
  ok: number;
  pending: number;
  wrong: number;
  missing: number;
  errors: number;
  siteLive: boolean;
  emailReady: boolean;
  allDone: boolean;
  headline: string;
}

interface HostingResponse {
  domain: { id: string; hostname: string; status: string; verifiedAt: string | null; lastError: string } | null;
  settings: { emailProvider: string; dkim: string; dmarcPosture: string };
  bundle: { hostname: string; target: { host: string; ips: string[] }; groups: DnsGroup[]; notes: string[] } | null;
  statuses: RecordResult[];
  summary: BundleSummary | null;
  lastCheckAt: string | null;
  platform: {
    mailerConfigured: boolean;
    providers: { key: string; label: string; blurb: string }[];
  };
}

function errMsg(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return e instanceof Error ? e.message : "Something went wrong";
}

const DMARC_STEPS: { key: string; label: string; hint: string }[] = [
  { key: "none", label: "Watch", hint: "Reports forged mail without blocking anything. Start here." },
  { key: "quarantine", label: "Spam-folder", hint: "Mail that fails authentication goes to spam, not the inbox." },
  { key: "reject", label: "Reject", hint: "The strongest setting — only once the reports come back clean." },
];

function StatusPill({ result }: { result?: RecordResult }) {
  if (!result) return <Badge variant="outline" className="gap-1 text-muted-foreground"><CircleDashed className="h-3 w-3" /> Not checked</Badge>;
  if (result.status === "ok") return <Badge className="gap-1 border-emerald-200 bg-emerald-100 text-emerald-700"><Check className="h-3 w-3" /> In place</Badge>;
  if (result.status === "wrong") return <Badge className="gap-1 border-rose-200 bg-rose-100 text-rose-700"><XCircle className="h-3 w-3" /> Points elsewhere</Badge>;
  if (result.status === "error") return <Badge className="gap-1 border-amber-200 bg-amber-100 text-amber-800"><AlertTriangle className="h-3 w-3" /> Could not check</Badge>;
  if (result.status === "skipped") return <Badge variant="outline" className="gap-1 text-muted-foreground"><CircleDashed className="h-3 w-3" /> Needs a value</Badge>;
  return <Badge variant="outline" className="gap-1 text-muted-foreground"><CircleDashed className="h-3 w-3" /> Not published</Badge>;
}

function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <button
      type="button"
      title="Copy"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="inline-flex max-w-full items-center gap-1 truncate rounded bg-background px-1.5 py-0.5 font-semibold text-foreground ring-1 ring-border hover:ring-emerald-400"
    >
      <span className="truncate">{value}</span>
      {copied ? <Check className="h-3 w-3 shrink-0 text-emerald-600" /> : <Copy className="h-3 w-3 shrink-0" />}
    </button>
  );
}

export default function HostingCard() {
  const [data, setData] = useState<HostingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [purging, setPurging] = useState(false);
  const [dkimDraft, setDkimDraft] = useState("");
  const [savingDkim, setSavingDkim] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await api.get<HostingResponse>("/api/hosting");
      setData(next);
      setDkimDraft(next.settings.dkim);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const statusOf = (id: string) => data?.statuses.find((s) => s.id === id);

  async function check() {
    setChecking(true);
    try {
      const next = await api.post<{ statuses: RecordResult[]; summary: BundleSummary; lastCheckAt: string }>("/api/hosting", { action: "verify" });
      setData((prev) => (prev ? { ...prev, statuses: next.statuses, summary: next.summary, lastCheckAt: next.lastCheckAt } : prev));
      toast({ title: "Checked", description: next.summary.headline });
    } catch (e) {
      toast({ title: "Could not check", description: errMsg(e), variant: "destructive" });
    } finally {
      setChecking(false);
    }
  }

  async function setProvider(provider: string) {
    setBusy(true);
    try {
      const next = await api.post<HostingResponse>("/api/hosting", { action: "email", provider });
      setData(next);
      setDkimDraft(next.settings.dkim);
      toast({ title: "Mailbox updated", description: `The email records for ${provider} are below — publish them at your registrar.` });
    } catch (e) {
      toast({ title: "Could not change the mailbox", description: errMsg(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function saveDkim() {
    setSavingDkim(true);
    try {
      const next = await api.post<HostingResponse>("/api/hosting", { action: "dkim", value: dkimDraft.trim() });
      setData(next);
      toast({ title: dkimDraft.trim() ? "Value saved" : "Value cleared", description: dkimDraft.trim() ? "Publish it, then check again." : "The record now waits for a value again." });
    } catch (e) {
      toast({ title: "Could not save", description: errMsg(e), variant: "destructive" });
    } finally {
      setSavingDkim(false);
    }
  }

  async function setPosture(posture: string) {
    setBusy(true);
    try {
      setData(await api.post<HostingResponse>("/api/hosting", { action: "dmarc", posture }));
    } catch (e) {
      toast({ title: "Could not change DMARC", description: errMsg(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function purge() {
    setPurging(true);
    try {
      await api.post("/api/hosting", { action: "purge" });
      toast({ title: "Cache cleared", description: "Your latest edits are live now." });
    } catch (e) {
      toast({ title: "Could not clear the cache", description: errMsg(e), variant: "destructive" });
    } finally {
      setPurging(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="space-y-4">
        {[0, 1].map((i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="flex items-center justify-between gap-3 rounded-2xl p-6">
        <p className="text-sm text-muted-foreground">{error || "Could not load your hosting settings."}</p>
        <Button variant="outline" className="rounded-xl" onClick={() => void load()}>Retry</Button>
      </Card>
    );
  }

  const summary = data.summary;
  const provider = data.settings.emailProvider;
  const bundle = data.bundle;

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
              <ShieldCheck className="h-4 w-4" /> Hosting &amp; email
            </h2>
            <p className="mt-2 text-lg font-semibold text-foreground">
              {data.domain ? data.domain.hostname : "No domain connected yet"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {summary ? summary.headline : bundle ? "Publish these records at your registrar, then check them here." : "Add a domain in Settings first."}
            </p>
            {data.lastCheckAt && (
              <p className="mt-1 text-xs text-muted-foreground">
                Last checked {new Date(data.lastCheckAt).toLocaleString()}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            <Button className="rounded-xl bg-emerald-600 hover:bg-emerald-700" disabled={checking || !bundle} onClick={() => void check()}>
              {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {checking ? "Checking DNS…" : "Check everything"}
            </Button>
          </div>
        </div>

        {summary && (
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className={`rounded-xl border p-3 text-sm ${summary.siteLive ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-border bg-muted/40"}`}>
              <p className="font-semibold">Website</p>
              <p className="mt-0.5 text-xs">{summary.siteLive ? "Serving on this domain." : "Records not complete yet."}</p>
            </div>
            <div className={`rounded-xl border p-3 text-sm ${summary.emailReady ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-border bg-muted/40"}`}>
              <p className="font-semibold">Email delivery</p>
              <p className="mt-0.5 text-xs">{summary.emailReady ? "MX and SPF in place." : "MX or SPF missing."}</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
              <p className="font-semibold">{summary.ok}/{summary.total} records</p>
              <p className="mt-0.5 text-xs">
                {summary.wrong ? `${summary.wrong} pointing elsewhere · ` : ""}
                {summary.missing ? `${summary.missing} not published · ` : ""}
                {summary.pending ? `${summary.pending} waiting for a value` : summary.ok === summary.total ? "everything in place" : ""}
              </p>
            </div>
          </div>
        )}
      </Card>

      {bundle && (
        <Card className="rounded-2xl p-6">
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
            <Mail className="h-4 w-4" /> Business email
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick where your mail lives. The MX, SPF, DKIM and DMARC records below change to match.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {data.platform.providers.map((p) => {
              const active = p.key === provider;
              return (
                <button
                  key={p.key}
                  type="button"
                  disabled={busy}
                  onClick={() => void setProvider(p.key)}
                  className={`rounded-xl border p-3 text-left transition ${active ? "border-emerald-400 bg-emerald-50" : "border-border hover:border-emerald-300"}`}
                >
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    {p.label}
                    {active && <Badge className="bg-emerald-600 text-white">Selected</Badge>}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{p.blurb}</p>
                </button>
              );
            })}
          </div>

          {!data.platform.mailerConfigured && (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              Lead-alert email is not configured on this deployment yet, so enquiry notifications cannot be sent until our team sets up the mail server. The records below are for your own mailbox, not for us.
            </p>
          )}

          {provider !== "none" && (
            <div className="mt-4 rounded-xl border border-border p-3">
              <p className="text-sm font-semibold">DKIM value</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {provider === "microsoft"
                  ? "Your Microsoft tenant hostname, the …onmicrosoft.com one."
                  : "Copy it from your mailbox provider's admin console — the DKIM or email-authentication page."}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Input
                  value={dkimDraft}
                  onChange={(e) => setDkimDraft(e.target.value)}
                  placeholder={provider === "microsoft" ? "contoso.onmicrosoft.com" : "v=DKIM1; k=rsa; p=MIGf…"}
                  className="min-w-[16rem] flex-1 rounded-xl"
                />
                <Button variant="outline" className="rounded-xl" disabled={savingDkim} onClick={() => void saveDkim()}>
                  {savingDkim ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save
                </Button>
              </div>
            </div>
          )}

          {provider !== "none" && (
            <div className="mt-3 rounded-xl border border-border p-3">
              <p className="text-sm font-semibold">DMARC enforcement</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {DMARC_STEPS.map((step) => (
                  <button
                    key={step.key}
                    type="button"
                    disabled={busy}
                    onClick={() => void setPosture(step.key)}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                      data.settings.dmarcPosture === step.key ? "border-emerald-400 bg-emerald-50 text-emerald-800" : "border-border hover:border-emerald-300"
                    }`}
                  >
                    {step.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {DMARC_STEPS.find((s) => s.key === data.settings.dmarcPosture)?.hint}
              </p>
            </div>
          )}
        </Card>
      )}

      {bundle && (
        <Card className="rounded-2xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Records to publish</h3>
            <Button variant="outline" className="rounded-xl" disabled={purging} onClick={() => void purge()}>
              {purging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />} Clear site cache
            </Button>
          </div>

          {bundle.groups.filter((g) => g.records.length).map((group) => (
            <div key={group.purpose} className="mt-4">
              <p className="text-sm font-semibold text-foreground">{group.title}</p>
              <p className="text-xs text-muted-foreground">{group.blurb}</p>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[34rem] border-separate border-spacing-y-1 text-xs">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="pr-3 font-medium">Type</th>
                      <th className="pr-3 font-medium">Name</th>
                      <th className="pr-3 font-medium">Value</th>
                      <th className="pr-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.records.map((r) => {
                      const result = statusOf(r.id);
                      return (
                        <tr key={r.id} className="align-top">
                          <td className="pr-3 font-semibold">{r.type}{r.priority !== undefined ? ` · ${r.priority}` : ""}</td>
                          <td className="pr-3"><CopyValue value={r.name === "@" ? bundle.hostname : r.name} /></td>
                          <td className="pr-3">
                            <CopyValue value={r.value} />
                            <p className="mt-0.5 max-w-[32rem] text-[11px] leading-snug text-muted-foreground">{r.why}</p>
                            {result?.found.length ? (
                              <p className="mt-0.5 text-[11px] text-rose-600">Found: {result.found.slice(0, 3).join(", ")}</p>
                            ) : null}
                          </td>
                          <td className="pr-3">
                            <StatusPill result={result} />
                            {result?.detail && result.status !== "ok" ? (
                              <p className="mt-1 max-w-[16rem] text-[11px] leading-snug text-muted-foreground">{result.detail}</p>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {bundle.notes.length > 0 && (
            <ul className="mt-4 space-y-1.5 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              {bundle.notes.map((note, i) => <li key={i}>{note}</li>)}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

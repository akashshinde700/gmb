"use client";
// WebSetu — "Your own domain" panel in the dashboard Settings tab.
//
// Lives in its own file rather than inside dashboard-view.tsx, which is already
// past three thousand lines.
//
// The copy here is written for a shop owner who is reading it with their
// registrar's control panel open in the next tab, so the DNS record is named
// literally — type, name, value — instead of being described.

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Globe, Loader2, Search, ShoppingCart, Trash2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { api, ApiError } from "@/lib/api-client";

interface DomainRow {
  id: string;
  hostname: string;
  status: string;
  primary: boolean;
  lastError: string;
  lastCheckAt: string | null;
  verifiedAt: string | null;
}

interface DomainsResponse {
  domains: DomainRow[];
  target: { host: string; ips: string[] };
  allowance: number;
  used: number;
  canAdd: boolean;
}

function errMsg(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return e instanceof Error ? e.message : "Something went wrong";
}

export default function DomainsCard() {
  const [data, setData] = useState<DomainsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hostname, setHostname] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [mode, setMode] = useState<"own" | "buy">("own");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await api.get<DomainsResponse>("/api/domains"));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch on mount; the loading flag is set once before the first await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function add() {
    const value = hostname.trim();
    if (!value) return;
    setAdding(true);
    try {
      await api.post("/api/domains", { hostname: value });
      setHostname("");
      await load();
      toast({ title: "Domain added", description: "Now create the DNS record shown below." });
    } catch (e) {
      toast({ title: "Could not add domain", description: errMsg(e), variant: "destructive" });
    } finally {
      setAdding(false);
    }
  }

  async function check(id: string) {
    setBusyId(id);
    try {
      const res = await api.post<{ domain: DomainRow }>(`/api/domains/${id}`);
      await load();
      toast(
        res.domain.status === "ACTIVE"
          ? { title: "Domain is live", description: `${res.domain.hostname} now serves your website.` }
          : { title: "Not pointing here yet", description: res.domain.lastError },
      );
    } catch (e) {
      toast({ title: "Check failed", description: errMsg(e), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  async function makePrimary(id: string) {
    setBusyId(id);
    try {
      await api.patch(`/api/domains/${id}`, { primary: true });
      await load();
      toast({ title: "Primary domain updated", description: "Your other domains now redirect here." });
    } catch (e) {
      toast({ title: "Could not update", description: errMsg(e), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string, name: string) {
    setBusyId(id);
    try {
      await api.del(`/api/domains?id=${encodeURIComponent(id)}`);
      await load();
      toast({ title: "Domain removed", description: `${name} no longer points to your site.` });
    } catch (e) {
      toast({ title: "Could not remove", description: errMsg(e), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  const target = data?.target.host ?? "";

  return (
    <Card className="rounded-2xl p-4 sm:p-6">
      <h2 className="mb-1 text-sm font-bold uppercase tracking-wider text-muted-foreground">Your own domain</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Serve this website at your own address, like www.yourshop.com. Connecting a domain is included in
        your plan — the domain itself is paid for separately.
      </p>

      <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-muted p-1" role="tablist" aria-label="Domain option">
        {([
          ["own", "I have a domain"],
          ["buy", "Buy one for me"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              mode === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "buy" ? <BuyDomainPanel /> : (<>

      <ol className="mb-5 grid gap-2 sm:grid-cols-2">
        {[
          ["Buy a domain", "From any registrar — GoDaddy, Hostinger, BigRock, Namecheap. You pay them directly; your WebSetu price does not change."],
          ["Connect it here", "Type the domain below (www.yourshop.com is easiest) and press Connect domain."],
          ["Add one DNS record", "Open DNS settings at your registrar and add the record we show — type, name and value, exactly as written."],
          ["Check & go live", "Press Check now. Once DNS is verified we finish the secure (HTTPS) setup for you and confirm when it is live."],
        ].map(([title, body], i) => (
          <li key={title} className="flex gap-3 rounded-xl border bg-muted/40 p-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white">
              {i + 1}
            </span>
            <span>
              <span className="block text-xs font-semibold text-foreground">{title}</span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">{body}</span>
            </span>
          </li>
        ))}
      </ol>

      {loading ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : error ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5">
          <p className="text-sm text-amber-800">{error}</p>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {data!.domains.map((d) => {
            const isSubdomain = d.hostname.split(".").length > 2;
            return (
              <div key={d.id} className="rounded-xl border p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate text-sm font-semibold text-foreground">
                      <Globe className="h-4 w-4 shrink-0 text-emerald-600" />
                      {d.hostname}
                      {d.primary && (
                        <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700">Primary</Badge>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {d.status === "ACTIVE"
                        ? "Live — your website is served on this domain"
                        : d.lastError || "Waiting for the DNS record"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                    {d.status !== "ACTIVE" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === d.id}
                        onClick={() => void check(d.id)}
                      >
                        {busyId === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check now"}
                      </Button>
                    )}
                    {d.status === "ACTIVE" && !d.primary && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === d.id}
                        onClick={() => void makePrimary(d.id)}
                      >
                        Make primary
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600 hover:bg-red-50"
                      aria-label={`Remove ${d.hostname}`}
                      disabled={busyId === d.id}
                      onClick={() => void remove(d.id, d.hostname)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {d.status !== "ACTIVE" && (
                  <div className="mt-3 rounded-lg bg-muted p-3">
                    <p className="mb-2 text-[11px] font-semibold text-foreground">
                      Open DNS settings at your registrar and add{isSubdomain ? " this record" : " these records"}:
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full border-separate border-spacing-y-1 text-left font-mono text-[11px]">
                        <thead>
                          <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            <th className="pr-3 font-sans font-semibold">Type</th>
                            <th className="pr-3 font-sans font-semibold">Name / Host</th>
                            <th className="font-sans font-semibold">Value / Points to</th>
                          </tr>
                        </thead>
                        <tbody className="text-foreground">
                          {/* Most registrars refuse a CNAME on the bare domain,
                              so www and the apex get different record types
                              rather than one line that is wrong half the time. */}
                          {isSubdomain ? (
                            <tr>
                              <td className="pr-3 align-middle">CNAME</td>
                              <td className="pr-3 align-middle">{d.hostname.split(".")[0]}</td>
                              <td className="align-middle"><CopyValue value={target} /></td>
                            </tr>
                          ) : (
                            <>
                              <tr>
                                <td className="pr-3 align-middle">A</td>
                                <td className="pr-3 align-middle">@</td>
                                <td className="align-middle"><CopyValue value={data!.target.ips[0] ?? ""} /></td>
                              </tr>
                              <tr>
                                <td className="pr-3 align-middle text-muted-foreground">ALIAS</td>
                                <td className="pr-3 align-middle text-muted-foreground">@</td>
                                <td className="align-middle">
                                  <CopyValue value={target} />
                                  <span className="ml-1 font-sans text-[10px] text-muted-foreground">
                                    (only if your registrar offers ALIAS/ANAME — use instead of the A record)
                                  </span>
                                </td>
                              </tr>
                            </>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                      <li>Delete any other A or CNAME record with the same name first.</li>
                      <li>Leave TTL at its default (or 3600).</li>
                      <li>
                        {isSubdomain
                          ? `Want ${d.hostname.replace(/^www\./, "")} to work too? Add it above as a second domain — it needs its own A record.`
                          : `Want www.${d.hostname} to work too? Add it above as a second domain — it uses a CNAME.`}
                      </li>
                    </ul>
                  </div>
                )}
              </div>
            );
          })}

          {data!.canAdd ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                className="w-full rounded-xl sm:min-w-[200px] sm:flex-1"
                placeholder="www.yourshop.com"
                aria-label="Domain name"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void add();
                }}
              />
              <Button className="w-full rounded-xl sm:w-auto" disabled={adding || !hostname.trim()} onClick={() => void add()}>
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : "Connect domain"}
              </Button>
            </div>
          ) : (
            // Domains are sold as an add-on, not unlocked by moving up a tier,
            // so this must never read as "upgrade your plan" — that would send
            // the customer to buy the wrong thing.
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
              <p className="text-sm font-medium text-amber-900">
                {data!.allowance === 0
                  ? "Want your website on your own domain?"
                  : `You have used all ${data!.allowance} of your domain${data!.allowance === 1 ? "" : "s"}.`}
              </p>
              <p className="mt-1 text-sm text-amber-800">
                {data!.allowance === 0
                  ? "Your current plan does not include one. The ₹599 WebSetu plan includes a custom domain — or ask us and we will set it up for you."
                  : "Remove one above to free a slot, or contact us and we will add more."}
              </p>
              <a
                href="mailto:info@aetherdevsolutions.com?subject=Custom%20domain%20for%20my%20WebSetu%20website"
                className="mt-3 inline-block rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
              >
                Ask about a domain
              </a>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            DNS changes usually apply within an hour but can take up to 48. Your site stays reachable at
            its WebSetu address the whole time.
          </p>
        </div>
      )}
      </>)}
    </Card>
  );
}

function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span>ask support</span>;
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
      className="inline-flex items-center gap-1 rounded bg-background px-1.5 py-0.5 font-semibold text-foreground ring-1 ring-border hover:ring-emerald-400"
    >
      {value}
      {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}


interface DomainRequestRow {
  id: string;
  domain: string;
  alternatives: string[];
  note: string;
  availability: string;
  status: string;
  quotedPrice: number | null;
  adminNote: string;
  createdAt: string;
}

const REQUEST_STATUS: Record<string, { label: string; tone: string; help: string }> = {
  REQUESTED: { label: "Requested", tone: "bg-amber-100 text-amber-800", help: "We are checking the price with the registrar." },
  QUOTED: { label: "Price shared", tone: "bg-sky-100 text-sky-800", help: "Pay the domain price — we will share payment details on call / WhatsApp." },
  PAID: { label: "Paid — registering", tone: "bg-violet-100 text-violet-800", help: "We are registering the domain and connecting it." },
  CONNECTED: { label: "Connected", tone: "bg-emerald-100 text-emerald-800", help: "Your website now opens on this domain." },
  CANCELLED: { label: "Closed", tone: "bg-muted text-muted-foreground", help: "" },
};

function BuyDomainPanel() {
  const [requests, setRequests] = useState<DomainRequestRow[] | null>(null);
  const [domain, setDomain] = useState("");
  const [alternatives, setAlternatives] = useState("");
  const [note, setNote] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ domain: string; availability: string } | null>(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      setRequests((await api.get<{ requests: DomainRequestRow[] }>("/api/domains/requests")).requests);
    } catch (e) {
      toast({ title: "Could not load your domain requests", description: errMsg(e), variant: "destructive" });
      setRequests([]);
    }
  }, []);

  useEffect(() => {
    // Fetch on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function check() {
    if (!domain.trim()) return;
    setChecking(true);
    setResult(null);
    try {
      setResult(await api.post<{ domain: string; availability: string }>("/api/domains/requests", { check: domain.trim() }));
    } catch (e) {
      toast({ title: "Could not check", description: errMsg(e), variant: "destructive" });
    } finally {
      setChecking(false);
    }
  }

  async function submit() {
    if (!domain.trim()) return;
    setSending(true);
    try {
      await api.post("/api/domains/requests", {
        domain: domain.trim(),
        alternatives: alternatives.split(",").map((a) => a.trim()).filter(Boolean),
        note: note.trim(),
      });
      setDomain("");
      setAlternatives("");
      setNote("");
      setResult(null);
      await load();
      toast({ title: "Request sent", description: "We will confirm the price before buying anything." });
    } catch (e) {
      toast({ title: "Could not send request", description: errMsg(e), variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  async function cancel(id: string) {
    try {
      await api.del(`/api/domains/requests?id=${encodeURIComponent(id)}`);
      await load();
    } catch (e) {
      toast({ title: "Could not cancel", description: errMsg(e), variant: "destructive" });
    }
  }

  const open = (requests ?? []).some((r) => ["REQUESTED", "QUOTED", "PAID"].includes(r.status));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 text-[12px] leading-relaxed text-emerald-900">
        <p className="font-semibold">We buy it, set it up and connect it — no settings for you to touch.</p>
        <p className="mt-1">
          Tell us the name you want. We confirm the exact yearly price before buying, register it in your
          business name, and connect it with HTTPS. The domain fee is paid separately; your WebSetu plan
          price stays the same.
        </p>
      </div>

      {requests === null ? (
        <Skeleton className="h-16 w-full rounded-xl" />
      ) : (
        requests.map((r) => {
          const st = REQUEST_STATUS[r.status] ?? REQUEST_STATUS.REQUESTED;
          return (
            <div key={r.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Globe className="h-4 w-4 text-emerald-600" aria-hidden="true" /> {r.domain}
                </p>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${st.tone}`}>{st.label}</span>
              </div>
              {r.quotedPrice != null && r.status !== "CANCELLED" && (
                <p className="mt-2 text-sm text-foreground">
                  Domain price: <strong>₹{r.quotedPrice.toLocaleString("en-IN")}</strong>
                  <span className="text-muted-foreground"> / year, paid separately</span>
                </p>
              )}
              {st.help && <p className="mt-1 text-xs text-muted-foreground">{st.help}</p>}
              {r.adminNote && <p className="mt-2 rounded-lg bg-muted p-2 text-xs text-foreground">{r.adminNote}</p>}
              {["REQUESTED", "QUOTED"].includes(r.status) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-2 h-7 px-2 text-xs text-red-600 hover:bg-red-50"
                  onClick={() => void cancel(r.id)}
                >
                  Cancel request
                </Button>
              )}
            </div>
          );
        })
      )}

      {!open && (
        <div className="space-y-3 rounded-xl border p-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              className="w-full rounded-xl sm:flex-1"
              placeholder="yourbusiness.com or yourbusiness.in"
              aria-label="Domain you want"
              value={domain}
              onChange={(e) => {
                setDomain(e.target.value);
                setResult(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void check();
              }}
            />
            <Button variant="outline" className="rounded-xl" disabled={checking || !domain.trim()} onClick={() => void check()}>
              {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Search className="h-4 w-4" /> Check</>}
            </Button>
          </div>
          {result && (
            <p
              role="status"
              className={`text-xs font-medium ${
                result.availability === "AVAILABLE"
                  ? "text-emerald-700"
                  : result.availability === "TAKEN"
                  ? "text-red-600"
                  : "text-muted-foreground"
              }`}
            >
              {result.availability === "AVAILABLE"
                ? `${result.domain} looks available.`
                : result.availability === "TAKEN"
                ? `${result.domain} is already registered — try another ending (.in, .co.in) or a variation.`
                : `Could not check ${result.domain} right now — you can still request it and we will confirm.`}
            </p>
          )}
          <Input
            className="rounded-xl"
            placeholder="Other choices, comma separated (optional)"
            aria-label="Alternative domains"
            value={alternatives}
            onChange={(e) => setAlternatives(e.target.value)}
          />
          <Textarea
            className="rounded-xl"
            rows={2}
            placeholder="Anything we should know? (optional)"
            aria-label="Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button className="w-full rounded-xl sm:w-auto" disabled={sending || !domain.trim()} onClick={() => void submit()}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ShoppingCart className="h-4 w-4" /> Request this domain</>}
          </Button>
        </div>
      )}
    </div>
  );
}

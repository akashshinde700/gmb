"use client";
// WebSetu — the reseller console.
//
// The API is the product; this page is the shopfront. An agency sets their
// brand here once — the name, the logo, the support address, the colour and
// the domain their clients will visit — mints a key, and from then on works
// through the Builder API. Everything on this page maps to one endpoint, so
// anything the page can do, their own tooling can do too.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { errMsg } from "@/components/views/console-ui";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

interface BrandForm {
  brandName: string;
  logoUrl: string;
  supportEmail: string;
  primaryColor: string;
  hostname: string;
}
interface SiteRow {
  slug: string; name: string; status: string; url: string; editUrl: string;
  apiRef: string; createdAt: string; leads: number;
}
interface KeyRow {
  id: string; label: string; prefix: string; createdAt: string;
  lastUsedAt: string | null; revoked: boolean;
}

const EMPTY: BrandForm = { brandName: "", logoUrl: "", supportEmail: "", primaryColor: "", hostname: "" };

function when(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function ResellerConsole() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [brand, setBrand] = useState<BrandForm>(EMPTY);
  const [saved, setSaved] = useState<BrandForm>(EMPTY);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [savingBrand, setSavingBrand] = useState(false);
  const [minting, setMinting] = useState(false);
  /** The plaintext of the key just minted. Present for one page view, then gone. */
  const [freshKey, setFreshKey] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ brand: BrandForm; sites: SiteRow[]; keys: KeyRow[] }>("/api/reseller");
      setBrand(data.brand);
      setSaved(data.brand);
      setSites(data.sites);
      setKeys(data.keys);
      setError("");
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

  async function saveBrand() {
    setSavingBrand(true);
    try {
      const data = await api.put<{ brand: BrandForm }>("/api/reseller", brand);
      setBrand(data.brand);
      setSaved(data.brand);
      toast({ title: "Brand saved", description: "Your pages and emails now carry it." });
    } catch (e) {
      toast({ title: "Could not save the brand", description: errMsg(e), variant: "destructive" });
    } finally {
      setSavingBrand(false);
    }
  }

  async function mintKey() {
    setMinting(true);
    try {
      const data = await api.post<{ key: string; apiKey: KeyRow }>("/api/reseller/keys", { label: "Console key" });
      setFreshKey(data.key);
      setKeys((k) => [{ ...data.apiKey, lastUsedAt: null, revoked: false }, ...k]);
      toast({ title: "Key created", description: "Copy it now — it is not shown again." });
    } catch (e) {
      toast({ title: "Could not create a key", description: errMsg(e), variant: "destructive" });
    } finally {
      setMinting(false);
    }
  }

  async function revokeKey(id: string) {
    try {
      await api.del(`/api/reseller/keys/${id}`);
      setKeys((k) => k.map((row) => (row.id === id ? { ...row, revoked: true } : row)));
      toast({ title: "Key revoked", description: "It stops working on the next call." });
    } catch (e) {
      toast({ title: "Could not revoke the key", description: errMsg(e), variant: "destructive" });
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}
      </div>
    );
  }
  if (error) {
    return <Card className="rounded-2xl p-6 text-sm text-muted-foreground">{error}</Card>;
  }

  const dirty = JSON.stringify(brand) !== JSON.stringify(saved);

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl p-6">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wider text-muted-foreground">Your brand</h2>
        <p className="mb-5 text-sm text-muted-foreground">
          This is what your clients see — on the pages they log in to, in their lead alerts, and in the footer of
          every website you build. The platform&apos;s name appears nowhere.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="brand-name">Agency name</Label>
            <Input id="brand-name" className="rounded-xl" value={brand.brandName} placeholder="e.g. Pune Web Studio"
              onChange={(e) => setBrand({ ...brand, brandName: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="brand-host">Your domain</Label>
            <Input id="brand-host" className="rounded-xl" value={brand.hostname} placeholder="e.g. punewebstudio.in"
              onChange={(e) => setBrand({ ...brand, hostname: e.target.value })} />
            <p className="mt-1 text-xs text-muted-foreground">Point it here and the login and signup pages wear your name.</p>
          </div>
          <div>
            <Label htmlFor="brand-logo">Logo URL</Label>
            <Input id="brand-logo" className="rounded-xl" value={brand.logoUrl} placeholder="https://…/logo.png"
              onChange={(e) => setBrand({ ...brand, logoUrl: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="brand-email">Support email</Label>
            <Input id="brand-email" className="rounded-xl" value={brand.supportEmail} placeholder="support@youragency.in"
              onChange={(e) => setBrand({ ...brand, supportEmail: e.target.value })} />
            <p className="mt-1 text-xs text-muted-foreground">Lead alerts for your clients&apos; sites are copied here.</p>
          </div>
          <div>
            <Label htmlFor="brand-colour">Brand colour</Label>
            <div className="flex items-center gap-2">
              <input id="brand-colour" type="color" aria-label="Brand colour"
                className="h-10 w-14 cursor-pointer rounded-lg border border-input bg-transparent"
                value={/^#[0-9a-f]{6}$/i.test(brand.primaryColor) ? brand.primaryColor : "#0f766e"}
                onChange={(e) => setBrand({ ...brand, primaryColor: e.target.value })} />
              <Input className="rounded-xl" value={brand.primaryColor} placeholder="#0f766e"
                onChange={(e) => setBrand({ ...brand, primaryColor: e.target.value })} />
            </div>
          </div>
        </div>
        <div className="mt-5 flex items-center gap-3">
          <Button className="rounded-xl" disabled={!dirty || savingBrand} onClick={saveBrand}>
            {savingBrand ? "Saving…" : "Save brand"}
          </Button>
          {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
        </div>
      </Card>

      <Card className="rounded-2xl p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">API keys</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              One key per environment. Send it as <code className="rounded bg-muted px-1.5 py-0.5 text-xs">Authorization: Bearer …</code>
              {" — "}
              <Link href="/developers" className="font-medium text-emerald-700 underline-offset-2 hover:underline">
                API reference
              </Link>
            </p>
          </div>
          <Button className="rounded-xl" disabled={minting} onClick={mintKey}>
            {minting ? "Creating…" : "Create key"}
          </Button>
        </div>

        {freshKey && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Copy this key now</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg bg-white px-3 py-2 text-sm">{freshKey}</code>
              <Button variant="outline" className="rounded-xl" onClick={() => { void navigator.clipboard.writeText(freshKey); }}>
                Copy
              </Button>
              <Button variant="ghost" className="rounded-xl" onClick={() => setFreshKey("")}>Done</Button>
            </div>
            <p className="mt-2 text-xs text-emerald-800">It is stored hashed. Nobody — including us — can show it again.</p>
          </div>
        )}

        {keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">No keys yet. Create one to start building sites through the API.</p>
        ) : (
          <ul className="divide-y">
            {keys.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{k.prefix}…</code>
                    {k.label}
                    {k.revoked && <Badge variant="secondary">revoked</Badge>}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    created {when(k.createdAt)} · last used {when(k.lastUsedAt)}
                  </p>
                </div>
                {!k.revoked && (
                  <Button variant="outline" className="rounded-xl" onClick={() => revokeKey(k.id)}>
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="rounded-2xl p-6">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wider text-muted-foreground">Sites you have built</h2>
        <p className="mb-4 text-sm text-muted-foreground">Every site created with your keys, with the enquiries it has brought in.</p>
        {sites.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet. POST to <code className="rounded bg-muted px-1.5 py-0.5 text-xs">/api/v1/sites</code> with a key.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4 font-semibold">Business</th>
                  <th className="py-2 pr-4 font-semibold">Status</th>
                  <th className="py-2 pr-4 font-semibold">Leads</th>
                  <th className="py-2 pr-4 font-semibold">Reference</th>
                  <th className="py-2 font-semibold">Created</th>
                </tr>
              </thead>
              <tbody>
                {sites.map((s) => (
                  <tr key={s.slug} className="border-b last:border-0">
                    <td className="py-3 pr-4">
                      <a href={s.url} target="_blank" rel="noreferrer" className="font-medium text-emerald-700 underline-offset-2 hover:underline">
                        {s.name}
                      </a>
                      <p className="text-xs text-muted-foreground">{s.slug}</p>
                    </td>
                    <td className="py-3 pr-4"><Badge variant={s.status === "PUBLISHED" ? "default" : "secondary"}>{s.status.toLowerCase()}</Badge></td>
                    <td className="py-3 pr-4">{s.leads}</td>
                    <td className="py-3 pr-4 text-xs text-muted-foreground">{s.apiRef || "—"}</td>
                    <td className="py-3 text-xs text-muted-foreground">{when(s.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

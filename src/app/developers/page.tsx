import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { brandForHost } from "@/lib/reseller";

/**
 * The public Builder API reference.
 *
 * Written for the person integrating on the other side: an agency developer who
 * wants to create a client's website from their own dashboard and never see
 * our UI. Every claim on this page is a behaviour of the code in
 * src/app/api/v1 — if it is not true there, it does not belong here.
 */

export async function generateMetadata(): Promise<Metadata> {
  const brand = await brandForHost((await headers()).get("host"));
  return {
    title: `Builder API — ${brand.whiteLabel ? brand.name : "WebSetu"}`,
    description: "Create a client's website, with hosting, SEO and a lead inbox, in one API call.",
  };
}

function Code({ children }: { children: string }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-xl bg-zinc-900 p-4 text-xs leading-relaxed text-zinc-100">
      <code>{children}</code>
    </pre>
  );
}

function Row({ method, path, children }: { method: string; path: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b py-4 last:border-0 sm:flex-row sm:items-baseline sm:gap-4">
      <code className={`w-fit shrink-0 rounded-lg px-2 py-1 text-xs font-bold ${
        method === "GET" ? "bg-sky-100 text-sky-800" : method === "POST" ? "bg-emerald-100 text-emerald-800" : "bg-zinc-200 text-zinc-700"
      }`}>{method}</code>
      <div className="min-w-0">
        <code className="text-sm font-semibold">{path}</code>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}

export default async function DevelopersPage() {
  const host = (await headers()).get("host") ?? "your-domain";
  const brand = await brandForHost(host);
  const name = brand.whiteLabel ? brand.name : "WebSetu";
  const base = `https://${brand.whiteLabel && brand.hostname ? brand.hostname : host}`;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Builder API</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Websites for your clients, from your own code</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        One call creates the website — designed from the business&apos;s own details, published on its own address,
        with Google-ready SEO and a lead inbox the client can log in to. {name} stays invisible: your brand is on the
        pages they see.
      </p>

      <section className="mt-10">
        <h2 className="text-lg font-bold tracking-tight">Authentication</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Mint a key in your reseller console. Send it as a bearer token on every request. Keys are stored hashed —
          we can show one once, at creation, and never again. Revoking a key stops it on the next call.
        </p>
        <Code>{`curl ${base}/api/v1/sites \\
  -H "Authorization: Bearer wsk_…"`}</Code>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-bold tracking-tight">Endpoints</h2>
        <div className="mt-3">
          <Row method="POST" path="/api/v1/sites">
            Create a site. Required: <code>name</code> and <code>category</code>. Optional:{" "}
            <code>city</code>, <code>phone</code>, <code>address</code>, <code>description</code>,{" "}
            <code>ownerName</code>, <code>ownerEmail</code>, <code>apiRef</code>, <code>publish</code>.
            Answers 201 with the site and a one-time owner login; 422 names exactly which fields were wrong.
          </Row>
          <Row method="GET" path="/api/v1/sites">
            Every site this key created, newest first, with the primary domain and the number of leads each has.
          </Row>
          <Row method="GET" path="/api/v1/sites/{slug}">
            One site, only if this key created it. Anything else is a 404 — a key cannot see another agency&apos;s work.
          </Row>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-bold tracking-tight">Create a site</h2>
        <Code>{`curl -X POST ${base}/api/v1/sites \\
  -H "Authorization: Bearer wsk_…" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Smile Studio Dental",
    "category": "Dental Clinic",
    "city": "Pune",
    "phone": "+919812345678",
    "address": "12 FC Road, Pune",
    "description": "Family dental clinic on FC Road.",
    "ownerEmail": "owner@smilestudio.in",
    "apiRef": "client-1042"
  }'

# 201
{
  "site": { "slug": "smile-studio-dental", "url": "${base}/s/smile-studio-dental", "status": "PUBLISHED" },
  "owner": { "email": "owner@smilestudio.in", "password": "…" }
}`}</Code>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          <strong>Idempotent by <code>apiRef</code>.</strong> Send your own id for the client (a CRM id, an order
          number) and a retry after a timeout returns the site that already exists with{" "}
          <code>created: false</code> instead of building a second one. Nothing is charged twice.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          The owner password is returned once, in the creation response. Give it to your client, or ask us to wire
          your own login flow — the account is a normal account and can be handed over. A client&apos;s own domain,
          once they have one, replaces the <code>/s/&lt;slug&gt;</code> address in <code>url</code>.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-bold tracking-tight">What the client gets</h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
          <li>· A designed website generated from the details you sent — not a template with the name swapped. Two dental clinics never get the same layout, palette or artwork.</li>
          <li>· A real address, sitemap, schema markup and per-page SEO, with the business&apos;s Google Business Profile facts when they are public.</li>
          <li>· A lead inbox: every call click, WhatsApp click and form submission, with where the visitor came from.</li>
          <li>· Their own login, on your domain, wearing your brand.</li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-bold tracking-tight">Limits and errors</h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
          <li>· Site creation: 60 per key per hour. Key creation: 20 per account per hour.</li>
          <li>· <code>401</code> — missing, malformed or revoked key. <code>404</code> — no such site for this key.</li>
          <li>· <code>422</code> — <code>{`{"error":"Missing or invalid: category"}`}</code>. We name the fields rather than guess at them.</li>
        </ul>
      </section>

      <div className="mt-12 flex flex-wrap items-center gap-4 border-t pt-6">
        <Link href="/reseller" className="text-sm font-medium text-emerald-700 underline underline-offset-2">
          Reseller console
        </Link>
        <Link href="/" className="text-sm text-muted-foreground underline underline-offset-2">
          Back to {name}
        </Link>
      </div>
    </main>
  );
}

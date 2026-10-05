// WebSetu — customer domain routing and DNS verification.
//
// How a customer domain reaches their site:
//
//   1. They add `www.example.com` in the dashboard. A row is created PENDING.
//   2. They point DNS at us — a CNAME to the platform host, or an A record to
//      the platform IP.
//   3. Verification resolves the name and confirms it actually points here.
//      Only then does the row become ACTIVE.
//   4. `proxy.ts` maps the incoming Host header to the tenant and rewrites the
//      request onto /s/<slug>.
//
// The certificate is the one step this app does not perform. The production
// server runs nginx under CloudPanel, which has no on-demand TLS, so a verified
// domain is added to the site and issued a certificate through CloudPanel —
// per customer, by an admin. `/api/domains/check` answers 200 only for ACTIVE
// rows and exists for whatever automates that.
//
// Step 3 is the one that matters for safety. Without it anyone could type a
// domain they do not own and have this platform serve, or request certificates
// for, a name belonging to someone else.

import { promises as dns } from "node:dns";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { normalizeHost, platformHosts } from "@/lib/domain-rules";

export {
  checkHostname, domainAllowance, normalizeHost, platformHosts, txtRecordName, txtRecordValue,
} from "@/lib/domain-rules";

/** Where customers point their DNS. */
export function dnsTarget(): { host: string; ips: string[] } {
  const host = (process.env.DOMAIN_TARGET_HOST || platformHosts()[0] || "").toLowerCase();
  const ips = (process.env.DOMAIN_TARGET_IPS || "")
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);
  return { host, ips };
}

export function newDomainToken(): string {
  return randomBytes(16).toString("hex");
}

/* ------------------------------ verification ------------------------------ */

export interface VerifyResult {
  ok: boolean;
  detail: string;
}

/**
 * Confirm that `hostname` resolves to this platform.
 *
 * A CNAME pointing at the platform host is the preferred setup and the only one
 * that survives us changing servers. An A record matching a configured IP is
 * accepted too, because apex domains cannot carry a CNAME at most registrars.
 *
 * DNS failures are reported as failures, never as successes — a lookup that
 * times out must not activate a domain.
 */
export async function verifyDns(hostname: string): Promise<VerifyResult> {
  const target = dnsTarget();
  if (!target.host && !target.ips.length) {
    return { ok: false, detail: "The platform has no DNS target configured yet" };
  }

  // CNAME first: it is what the instructions ask for.
  let cnameMiss = "";
  try {
    const cnames = await dns.resolveCname(hostname);
    for (const cname of cnames) {
      if (normalizeHost(cname) === target.host) {
        return { ok: true, detail: `CNAME points at ${target.host}` };
      }
    }
    // A CNAME that names something else is NOT a failure on its own. Pointing
    // www at the bare domain, which in turn has the A record, is a normal setup
    // at most registrars and serves this site perfectly well. Rejecting it here
    // left a customer staring at "expected …" while their DNS was already
    // correct, so the address check below decides.
    if (cnames.length) cnameMiss = `CNAME points at ${cnames[0]}, expected ${target.host}`;
  } catch {
    // No CNAME is normal for an apex domain; fall through to A records.
  }

  if (target.ips.length) {
    try {
      // resolve4 follows the whole CNAME chain, so this also covers
      // www -> bare domain -> A record.
      const addresses = await dns.resolve4(hostname);
      for (const address of addresses) {
        if (target.ips.includes(address)) {
          return { ok: true, detail: `Resolves to ${address}` };
        }
      }
      if (addresses.length) {
        return {
          ok: false,
          detail: cnameMiss || `A record points at ${addresses[0]}, expected ${target.ips.join(" or ")}`,
        };
      }
    } catch {
      /* fall through to the messages below */
    }
  }

  return {
    ok: false,
    detail: cnameMiss || "No DNS record found yet. Changes can take up to a few hours to spread.",
  };
}

/**
 * Run verification for one domain row and persist the outcome. Returns the
 * updated row. Safe to call repeatedly — it is how the dashboard's "Check now"
 * button works.
 */
export async function verifyDomain(id: string) {
  const domain = await db.domain.findUnique({ where: { id } });
  if (!domain) return null;

  const result = await verifyDns(domain.hostname);
  const updated = await db.domain.update({
    where: { id },
    data: {
      status: result.ok ? "ACTIVE" : "PENDING",
      lastCheckAt: new Date(),
      lastError: result.ok ? "" : result.detail,
      verifiedAt: result.ok ? domain.verifiedAt ?? new Date() : domain.verifiedAt,
    },
  });

  // The routing cache holds negative results too, so a domain that has just
  // gone live must not wait out a TTL before it serves.
  forgetHost(domain.hostname);
  return updated;
}

/* -------------------------------- routing --------------------------------- */

export interface HostRoute {
  slug: string;
  /** The hostname the site should canonicalise to, when it is not this one. */
  primaryHost: string | null;
}

// `proxy.ts` runs on every request, so the lookup is cached. The TTL is short
// because the cost of a stale miss is a customer refreshing a page during
// setup, while the cost of a long TTL is exactly that, for longer.
const TTL_MS = 60_000;
const NEGATIVE_TTL_MS = 30_000;
const cache = new Map<string, { route: HostRoute | null; expiresAt: number }>();

export function forgetHost(hostname: string) {
  cache.delete(hostname);
}

export function forgetAllHosts() {
  cache.clear();
}

/**
 * Map a Host header to the tenant it belongs to, or null for the platform's own
 * hostnames and anything unknown.
 *
 * Never throws: a database blip here would otherwise take down every page on
 * every domain, so a failed lookup degrades to "not a tenant domain" and the
 * platform site is served.
 */
export async function resolveHost(rawHost: string | null | undefined): Promise<HostRoute | null> {
  const hostname = normalizeHost(rawHost);
  if (!hostname) return null;
  if (platformHosts().includes(hostname)) return null;

  const hit = cache.get(hostname);
  if (hit && hit.expiresAt > Date.now()) return hit.route;

  let route: HostRoute | null = null;
  try {
    const domain = await db.domain.findUnique({
      where: { hostname },
      select: {
        status: true,
        primary: true,
        business: {
          select: {
            slug: true,
            domains: {
              where: { status: "ACTIVE", primary: true },
              select: { hostname: true },
              take: 1,
            },
          },
        },
      },
    });

    if (domain && domain.status === "ACTIVE") {
      const canonical = domain.business.domains[0]?.hostname ?? null;
      route = {
        slug: domain.business.slug,
        primaryHost: canonical && canonical !== hostname ? canonical : null,
      };
    }
  } catch (e) {
    console.error("[domains] host lookup failed:", e);
    // Do not cache an error as a negative result: the next request should try
    // again rather than serve the wrong site for the next thirty seconds.
    return null;
  }

  cache.set(hostname, {
    route,
    expiresAt: Date.now() + (route ? TTL_MS : NEGATIVE_TTL_MS),
  });
  return route;
}

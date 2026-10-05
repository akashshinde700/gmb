// WebSetu — hostname rules for customer domains.
//
// No imports at all, so the parsing can be unit-tested by running the file
// directly. Everything here answers one question: is this string a hostname we
// are willing to route and to have a certificate issued for?

/** Hostnames that belong to the platform and can never be claimed by a tenant. */
export function platformHosts(): string[] {
  const configured = (process.env.PLATFORM_HOSTS || "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

  let appHost = "";
  try {
    appHost = new URL(process.env.NEXT_PUBLIC_APP_URL || "https://www.websetu.instantqr.tech").hostname;
  } catch {
    appHost = "www.websetu.instantqr.tech";
  }

  return Array.from(new Set([...configured, appHost.toLowerCase(), "localhost"]));
}

/**
 * Reduce an incoming Host header to a comparable hostname: lower case, no port,
 * no trailing dot, no surrounding whitespace.
 *
 * `Host` is attacker-controlled on every request, so this never throws and
 * returns "" for anything it does not fully understand — a caller that gets ""
 * simply serves the platform site.
 */
export function normalizeHost(raw: string | null | undefined): string {
  let host = String(raw ?? "").trim().toLowerCase();
  if (!host) return "";
  // An IPv6 literal arrives bracketed; a tenant domain never does.
  if (host.startsWith("[")) return "";
  const colon = host.indexOf(":");
  if (colon >= 0) host = host.slice(0, colon);
  if (host.endsWith(".")) host = host.slice(0, -1);
  return host;
}

export interface HostnameCheck {
  ok: boolean;
  hostname: string;
  error?: string;
}

const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Validate a hostname a customer typed into the dashboard.
 *
 * Deliberately strict. This value ends up in a routing table and in a
 * certificate request, so "probably fine" is not good enough: an IP address, a
 * wildcard, a bare TLD or a platform hostname all get rejected with a reason
 * the customer can act on.
 */
export function checkHostname(raw: string): HostnameCheck {
  let input = String(raw ?? "").trim().toLowerCase();
  if (!input) return { ok: false, hostname: "", error: "Enter a domain name" };

  // People paste URLs. Take the host out of one rather than rejecting it.
  if (input.includes("://")) {
    try {
      input = new URL(input).hostname;
    } catch {
      return { ok: false, hostname: "", error: "That does not look like a domain name" };
    }
  }
  input = input.split("/")[0];
  const hostname = normalizeHost(input);

  if (!hostname) return { ok: false, hostname: "", error: "That does not look like a domain name" };
  if (hostname.length > 253) return { ok: false, hostname, error: "That domain name is too long" };
  if (hostname.includes("*")) {
    return { ok: false, hostname, error: "Wildcard domains are not supported" };
  }
  // A bare IP cannot be certificated by Let's Encrypt and is never what a
  // customer means here.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    return { ok: false, hostname, error: "Enter a domain name, not an IP address" };
  }

  const labels = hostname.split(".");
  if (labels.length < 2) {
    return { ok: false, hostname, error: "Enter a full domain, like example.com or www.example.com" };
  }
  for (const label of labels) {
    if (!LABEL.test(label)) {
      return {
        ok: false,
        hostname,
        error: "Use only letters, numbers and hyphens — and no hyphen at the start or end of a part",
      };
    }
  }
  // Punycode is fine; a raw unicode domain is not, because it would not match
  // the Host header the browser actually sends.
  if (/[^\x00-\x7f]/.test(hostname)) {
    return { ok: false, hostname, error: "Enter the domain in its punycode form (xn--…)" };
  }

  if (platformHosts().includes(hostname)) {
    return { ok: false, hostname, error: "That domain belongs to the platform" };
  }

  return { ok: true, hostname };
}

/** The TXT record name a customer publishes to prove they own the domain. */
export function txtRecordName(hostname: string): string {
  return `_websetu.${hostname}`;
}

/** The TXT value for a domain's token. */
export function txtRecordValue(token: string): string {
  return `websetu-verify=${token}`;
}

/**
 * How many custom domains a business may connect. -1 means unlimited.
 *
 * Two sources, added together:
 *   - the plan's own allowance, for anything bundled into a tier
 *   - `domainCredits`, what this customer has actually paid for
 *
 * Domains are sold as an add-on, so in practice every plan allows 0 and the
 * whole entitlement comes from the credits an admin grants after payment.
 * Adding rather than overriding means bundling one into a tier later does not
 * silently take away what a customer already bought.
 */
export function domainAllowance(
  plan: { maxDomains?: number | null } | null | undefined,
  business?: { domainCredits?: number | null } | null,
): number {
  const fromPlan = plan?.maxDomains ?? 0;
  if (fromPlan === -1) return -1;

  const credits = business?.domainCredits ?? 0;
  if (credits === -1) return -1;

  return Math.max(0, fromPlan) + Math.max(0, credits);
}

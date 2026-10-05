import { db } from "@/lib/db";
import { normalizeHost } from "@/lib/domain-rules";

/**
 * GET /api/domains/check?domain=www.example.com
 *
 * "Is this hostname served here?" — a 200 means yes, anything else means no.
 *
 * This is the shape Caddy's on-demand TLS `ask` hook expects: before Caddy
 * obtains a certificate for a hostname it has never seen, it calls an endpoint
 * like this one. WebSetu's own server does NOT run Caddy — CloudPanel fronts it
 * with nginx, where each customer domain gets its certificate issued when the
 * vhost is created — so nothing calls this in production today. It stays
 * because it is four lines of logic, it is the correct answer to the question,
 * and Caddyfile.custom-domains.example is written against it for the day the
 * domain count makes per-vhost setup by hand not worth doing.
 *
 * Without this gate the server would request a certificate for every hostname
 * anyone pointed at its IP address — which is how a deployment gets itself
 * rate-limited by Let's Encrypt for a week.
 *
 * Only ACTIVE rows pass. A row is only ACTIVE once its DNS has been observed
 * pointing here, so the customer has already proved control of the name.
 *
 * Deliberately public and unauthenticated: a TLS front-end calls it from the
 * same host, before any session exists, and cannot present one. It leaks nothing — an attacker learns only
 * whether a domain they already named is served here, which they could tell
 * from a single HTTP request anyway.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const hostname = normalizeHost(new URL(req.url).searchParams.get("domain"));
  if (!hostname) return new Response("missing domain", { status: 400 });

  try {
    const domain = await db.domain.findUnique({
      where: { hostname },
      select: { status: true },
    });
    if (domain?.status === "ACTIVE") {
      return new Response("ok", {
        status: 200,
        headers: { "Cache-Control": "no-store, max-age=0" },
      });
    }
    return new Response("unknown domain", { status: 404 });
  } catch (e) {
    // Fail closed. A database blip must not become an open invitation to
    // request certificates for arbitrary hostnames.
    console.error("[domains] on-demand TLS check failed:", e);
    return new Response("unavailable", { status: 503 });
  }
}

import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { ok, route, HttpError } from "@/lib/api";
import { platformHosts } from "@/lib/domains";

export const runtime = "nodejs";

/**
 * GET /api/internal/domains — the hostnames the web server should serve.
 *
 * Read by the root-side helper that creates each customer's nginx vhost and
 * requests its certificate (server/auto-domains.sh). It is deliberately the
 * only thing that endpoint can do: no customer data, no writes, just the list
 * of verified hostnames.
 *
 * Guarded by INTERNAL_TOKEN. With no token configured the route stays off
 * rather than open, so forgetting to set it cannot expose anything.
 */
function authorized(req: Request): boolean {
  const expected = process.env.INTERNAL_TOKEN || "";
  if (expected.length < 16) return false;
  const given = (req.headers.get("x-internal-token") || "").trim();
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export const GET = route(async (req: Request) => {
  if (!authorized(req)) throw new HttpError("Not found", 404);

  const domains = await db.domain.findMany({
    where: { status: "ACTIVE" },
    select: { hostname: true, primary: true, business: { select: { slug: true, status: true } } },
    orderBy: { hostname: "asc" },
  });

  // A site that is not published has nothing to serve, so no certificate is
  // requested for it — a failed challenge would only burn Let's Encrypt quota.
  const platform = new Set(platformHosts());
  const hostnames = domains
    .filter((d) => d.business.status === "PUBLISHED" && !platform.has(d.hostname))
    .map((d) => d.hostname);

  return ok({ hostnames });
});

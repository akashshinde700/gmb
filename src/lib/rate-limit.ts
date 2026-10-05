// WebSetu — in-process fixed-window rate limiter.
//
// The app runs as a single PM2 fork process, so an in-memory counter is the
// whole rate limit. If the deployment ever scales to multiple instances this
// must move to a shared store (Redis) — the interface below is what to keep.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

/** Drop expired buckets so the map cannot grow without bound. */
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfter: number; // seconds
}

/**
 * Count one hit against `key`. Returns ok:false once `limit` hits happen inside
 * `windowMs`. Callers translate that into a 429.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfter: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return { ok: false, remaining: 0, retryAfter: Math.ceil((existing.resetAt - now) / 1000) };
  }
  return { ok: true, remaining: limit - existing.count, retryAfter: 0 };
}

/**
 * How many proxies of our own sit in front of the app.
 *
 * CloudPanel's nginx vhost is one hop. Put Cloudflare (or any other CDN) in
 * front and it becomes two — set TRUSTED_PROXY_HOPS to match, or the limiter
 * starts counting the CDN's edge node as the client.
 */
const TRUSTED_PROXY_HOPS = Math.max(1, Math.trunc(Number(process.env.TRUSTED_PROXY_HOPS)) || 1);

/**
 * Client IP from the reverse proxy, falling back to a constant for local dev.
 *
 * This used to read the FIRST entry of X-Forwarded-For, which is the one value
 * in the whole request an attacker fully controls: nginx *appends* the socket
 * peer to whatever the client sent, so `X-Forwarded-For: 1.2.3.4` from a script
 * arrives as `1.2.3.4, <real ip>` and the limiter counted "1.2.3.4". Changing
 * that header per request reset every per-IP budget in the app — login, lead
 * submission, password reset — to a limit of one attempt each.
 *
 * Reading from the RIGHT fixes it. The rightmost entry was written by our own
 * nginx and cannot be forged from outside; each extra trusted proxy shifts the
 * real client one place further left.
 *
 * X-Real-IP is preferred where it exists because nginx sets it with
 * proxy_set_header, which REPLACES any client-sent value rather than appending
 * to it.
 */
export function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;

  const chain = (req.headers.get("x-forwarded-for") || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!chain.length) return "local";

  // One hop means the last entry; two means the one before it, and so on.
  return chain[Math.max(0, chain.length - TRUSTED_PROXY_HOPS)] || "local";
}

/** Clear all counters — used by tests. */
export function __resetRateLimits() {
  buckets.clear();
}

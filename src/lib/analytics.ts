// WebSetu — analytics rollup and retention.
//
// AnalyticsEvent gains a row per page view and never loses one, so the table
// grows in proportion to every tenant's traffic for ever. Nothing read those
// rows individually — the dashboard only ever shows counts — so past the
// retention window they are folded into one row per business per day per type
// and the originals are deleted.
//
// The grouping is done in JavaScript from `createdAt`, not with a SQL date
// function. The previous summary query used SQLite's `date(… , 'unixepoch')`,
// which is one of the things that would have broken silently on Postgres.

import { db } from "@/lib/db";

/** Days of raw events kept before they are folded into daily totals. */
export const RETENTION_DAYS: number = (() => {
  const raw = Number(process.env.ANALYTICS_RETENTION_DAYS ?? 45);
  if (!Number.isFinite(raw) || raw < 7 || raw > 3650) return 45;
  return Math.trunc(raw);
})();

const DAY_MS = 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
/** Raw rows folded per sweep. Bounded so one run cannot stall a request. */
const BATCH = 20_000;

let lastSweepAt = 0;
let inFlight: Promise<RollupResult> | null = null;

export interface RollupResult {
  eventsFolded: number;
  daysWritten: number;
}

const EMPTY: RollupResult = { eventsFolded: 0, daysWritten: 0 };

/** UTC calendar day of a timestamp, as YYYY-MM-DD. */
export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Fold raw events older than the retention window into AnalyticsDaily, then
 * delete them.
 *
 * Idempotent in the sense that matters: totals are added to whatever the daily
 * row already holds, and the raw rows that contributed are deleted in the same
 * transaction, so a row can never be counted twice — and a crash between the
 * two leaves the raw rows in place to be folded on the next run.
 */
export async function runRollup(now: Date = new Date()): Promise<RollupResult> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * DAY_MS);

  const stale = await db.analyticsEvent.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { id: true, businessId: true, type: true, path: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: BATCH,
  });
  if (!stale.length) return EMPTY;

  // businessId -> day -> type -> { count, paths }
  //
  // The three parts are joined on U+0000, which cannot occur in a cuid, a date
  // key or an event type, so no combination of values can collide with another.
  // Written as an escape rather than a literal NUL byte: the byte itself is
  // invisible in an editor and reads as file corruption to anything that scans
  // the source.
  const buckets = new Map<string, { count: number; paths: Set<string> }>();
  for (const event of stale) {
    const key = `${event.businessId}\u0000${dayKey(event.createdAt)}\u0000${event.type}`;
    const bucket = buckets.get(key) ?? { count: 0, paths: new Set<string>() };
    bucket.count += 1;
    bucket.paths.add(event.path);
    buckets.set(key, bucket);
  }

  const ids = stale.map((e) => e.id);

  await db.$transaction(async (tx) => {
    for (const [key, bucket] of buckets) {
      const [businessId, day, type] = key.split("\u0000");
      await tx.analyticsDaily.upsert({
        where: { businessId_day_type: { businessId, day, type } },
        update: {
          count: { increment: bucket.count },
          // Distinct paths cannot be merged exactly across batches without
          // keeping every path, so this is the larger of the two — an
          // approximation the dashboard already made when it counted
          // (day, path) pairs.
          uniquePaths: { increment: bucket.paths.size },
        },
        create: { businessId, day, type, count: bucket.count, uniquePaths: bucket.paths.size },
      });
    }
    await tx.analyticsEvent.deleteMany({ where: { id: { in: ids } } });
  });

  return { eventsFolded: stale.length, daysWritten: buckets.size };
}

/**
 * Throttled entry point for request handlers. Never throws and never blocks the
 * caller on a failure — a rollup that errors is retried on the next request
 * past the interval.
 */
export async function sweepAnalytics(force = false): Promise<RollupResult> {
  const now = Date.now();
  if (!force && now - lastSweepAt < SWEEP_INTERVAL_MS) return EMPTY;
  if (inFlight) return inFlight;

  lastSweepAt = now;
  inFlight = runRollup()
    .catch((e) => {
      console.error("[analytics] rollup failed:", e);
      return EMPTY;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Reset the throttle — used by tests. */
export function __resetRollupThrottle() {
  lastSweepAt = 0;
  inFlight = null;
}

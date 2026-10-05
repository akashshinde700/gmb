// WebSetu — subscription lifecycle enforcement.
//
// Trials and paid cycles were being written with an end date (`trialEndsAt`,
// `renewsAt`) that nothing ever read: a 3-day trial stayed TRIALING for ever,
// so every trial account kept a live website and full feature access at no
// charge. This module is what makes those dates mean something.
//
// There is no scheduler in this deployment, so the sweep runs lazily off normal
// traffic, throttled to once per interval per process. It is idempotent — a
// second run finds nothing left to do.

import { after } from "next/server";
import { db } from "@/lib/db";
import { DAY_MS, GRACE_DAYS } from "@/lib/expiry-rules";
import { sendPastDue, sendSubscriptionExpired, sendTrialEnded } from "@/lib/emails";

// Re-exported so callers have one import for the whole lifecycle concern.
export { GRACE_DAYS, subscriptionServesSite } from "@/lib/expiry-rules";

const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

let lastSweepAt = 0;
let inFlight: Promise<SweepResult> | null = null;

export interface SweepResult {
  trialsExpired: number;
  markedPastDue: number;
  expiredAfterGrace: number;
}

const EMPTY: SweepResult = { trialsExpired: 0, markedPastDue: 0, expiredAfterGrace: 0 };

interface OwnerRow {
  id: string;
  business: { userId: string; user: { email: string; name: string } };
}

/**
 * Run mail after the response when a request context exists, and inline when
 * one does not (a script or a test calling runSweep directly). Failures are
 * contained here so a mailbox problem cannot roll back a status change that has
 * already been written.
 */
function dispatchMail(send: () => Promise<unknown>) {
  const guarded = async () => {
    try {
      await send();
    } catch (e) {
      console.error("[expiry] lifecycle mail failed:", e);
    }
  };
  try {
    after(guarded);
  } catch {
    void guarded();
  }
}

/** Notify the owners of the subscriptions that just changed state. */
async function notify(rows: OwnerRow[], title: string, body: string) {
  if (!rows.length) return;
  await db.notification.createMany({
    data: rows.map((r) => ({ userId: r.business.userId, title, body })),
  });
}

/**
 * Move every overdue subscription to its next state:
 *   TRIALING past trialEndsAt        -> EXPIRED   (website goes dark)
 *   ACTIVE   past renewsAt           -> PAST_DUE  (still served, owner warned)
 *   PAST_DUE past renewsAt + grace   -> EXPIRED
 *
 * Business rows are deliberately left alone: a tenant who pays again should get
 * their PUBLISHED site back without an admin re-publishing it, and the public
 * gates already refuse to serve a business whose subscription is EXPIRED.
 */
export async function runSweep(now: Date = new Date()): Promise<SweepResult> {
  const cutoff = new Date(now.getTime() - GRACE_DAYS * DAY_MS);
  const owner = {
    business: { select: { userId: true, user: { select: { email: true, name: true } } } },
  } as const;

  const [trials, lapsed, graceOver] = await Promise.all([
    db.subscription.findMany({
      where: { status: "TRIALING", trialEndsAt: { not: null, lte: now } },
      select: { id: true, ...owner },
    }),
    db.subscription.findMany({
      where: { status: "ACTIVE", renewsAt: { not: null, lte: now } },
      select: { id: true, ...owner },
    }),
    db.subscription.findMany({
      where: { status: "PAST_DUE", renewsAt: { not: null, lte: cutoff } },
      select: { id: true, ...owner },
    }),
  ]);

  if (trials.length) {
    await db.subscription.updateMany({
      where: { id: { in: trials.map((s) => s.id) }, status: "TRIALING" },
      data: { status: "EXPIRED" },
    });
    await notify(
      trials,
      "Your free trial has ended",
      "Your website is offline until you choose a plan. Everything you built is saved — subscribe and it goes live again instantly.",
    );
    for (const row of trials) {
      dispatchMail(() =>
        sendTrialEnded({ to: row.business.user.email, name: row.business.user.name }),
      );
    }
  }

  if (lapsed.length) {
    await db.subscription.updateMany({
      where: { id: { in: lapsed.map((s) => s.id) }, status: "ACTIVE" },
      data: { status: "PAST_DUE" },
    });
    await notify(
      lapsed,
      "Payment due for your plan",
      `Your subscription renewal is pending. Your website stays online for ${GRACE_DAYS} more days — please renew to avoid interruption.`,
    );
    for (const row of lapsed) {
      dispatchMail(() =>
        sendPastDue({
          to: row.business.user.email,
          name: row.business.user.name,
          graceDays: GRACE_DAYS,
        }),
      );
    }
  }

  if (graceOver.length) {
    await db.subscription.updateMany({
      where: { id: { in: graceOver.map((s) => s.id) }, status: "PAST_DUE" },
      data: { status: "EXPIRED" },
    });
    await notify(
      graceOver,
      "Your website is offline",
      "The renewal grace period has ended and your website is no longer public. Renew any time to bring it straight back.",
    );
    for (const row of graceOver) {
      dispatchMail(() =>
        sendSubscriptionExpired({ to: row.business.user.email, name: row.business.user.name }),
      );
    }
  }

  return {
    trialsExpired: trials.length,
    markedPastDue: lapsed.length,
    expiredAfterGrace: graceOver.length,
  };
}

/**
 * Throttled entry point for request handlers. Never throws and never blocks the
 * caller's own work on a failure — a sweep that errors is retried on the next
 * request past the interval.
 */
export async function sweepSubscriptions(force = false): Promise<SweepResult> {
  const now = Date.now();
  if (!force && now - lastSweepAt < SWEEP_INTERVAL_MS) return EMPTY;
  if (inFlight) return inFlight;

  lastSweepAt = now;
  inFlight = runSweep()
    .catch((e) => {
      console.error("[expiry] subscription sweep failed:", e);
      return EMPTY;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Reset the throttle — used by tests. */
export function __resetSweepThrottle() {
  lastSweepAt = 0;
  inFlight = null;
}

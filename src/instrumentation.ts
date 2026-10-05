/**
 * Server startup hook — runs once per Next.js server instance, before the first
 * request is handled.
 *
 * Its one job is the subscription sweep. That sweep is what expires trials,
 * marks subscriptions past due and cuts off service after the grace period, and
 * until now it only ran when somebody happened to call /api/auth/me or the
 * admin stats endpoint. On a quiet weekend nobody calls either, so a trial that
 * ended on Saturday morning kept serving until the owner opened the dashboard
 * on Monday — and the customer notice that goes with it went out two days late.
 *
 * A timer rather than a system cron because there is exactly one process to put
 * it in: PM2 runs this app as a single fork (instances: 1, exec_mode: "fork"),
 * which is also what the in-memory rate limiter assumes. If that ever becomes
 * cluster mode, this moves out to a real scheduler — every instance running its
 * own sweep is wasted work at best.
 *
 * The request-time sweep stays. It is throttled to the same interval, so it
 * costs nothing while the timer is healthy, and it keeps the guarantee that a
 * request never reads a subscription the sweep should already have expired.
 */

/** Ten minutes, matching the throttle inside sweepSubscriptions. */
const SWEEP_EVERY_MS = 10 * 60 * 1000;

export async function register() {
  // The hook also runs for the edge runtime, where there is no database and no
  // long-lived process to hold a timer.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Imported here rather than at the top of the file: a static import would
  // pull Prisma into every runtime this module is evaluated in.
  const { sweepSubscriptions } = await import("@/lib/expiry");

  const tick = () => {
    // force: the timer IS the schedule, so the throttle would only ever make it
    // skip its own tick after a request-time sweep landed a moment earlier.
    void sweepSubscriptions(true);
  };

  // Not on the first tick: startup is the busiest moment in the process's life,
  // and nothing expires in the first ten minutes that will not still be expired
  // ten minutes later.
  const timer = setInterval(tick, SWEEP_EVERY_MS);
  // Let the process exit on its own during tests and one-off scripts.
  timer.unref?.();
}

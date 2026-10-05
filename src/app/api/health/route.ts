import { db } from "@/lib/db";
import { mailConfigured } from "@/lib/mailer";
import { smsConfigured, smsQuota } from "@/lib/sms";

/**
 * GET /api/health — liveness + dependency probe.
 *
 * Deliberately outside `route()` and the auth guards: a monitor must be able to
 * reach it, and it must answer even when the database is down — that is the
 * case it exists to report. Nothing here reveals anything a probe should not
 * see: no counts, no versions, no error details, just up/down per dependency.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();

  let database = false;
  try {
    await db.$queryRaw`SELECT 1`;
    database = true;
  } catch (e) {
    console.error("[health] database probe failed:", e);
  }

  // The SMS allowance is monthly and shared by the whole platform, so running
  // out is a real outage of the alert channel — worth seeing on a dashboard
  // before the first customer reports a missing text. Unavailable when the
  // database probe failed, since the counter lives there.
  const sms = smsConfigured();
  const smsRemaining = sms && database ? (await smsQuota().catch(() => null))?.remaining ?? null : null;

  const body = {
    ok: database,
    checks: {
      database,
      // Not a live SMTP handshake: verifying on every probe would hammer the
      // mail provider and get the sender throttled. This reports whether the
      // deployment is configured to send at all, which is the failure people
      // actually hit.
      mail: mailConfigured(),
      sms,
      smsRemaining,
    },
    uptimeSeconds: Math.round(process.uptime()),
    tookMs: Date.now() - startedAt,
  };

  return Response.json(body, {
    status: database ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

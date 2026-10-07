import { timingSafeEqual } from "node:crypto";
import { runAutopilotSweep } from "@/lib/autopilot";
import { HttpError, ok, route } from "@/lib/api";

export const runtime = "nodejs";
/** A sweep touches the database and can call a model provider per site. */
export const maxDuration = 300;

/**
 * POST /api/internal/autopilot — the scheduled maintenance pass.
 *
 * Run by tools/autopilot.mjs from cron. Guarded by INTERNAL_TOKEN and off when
 * none is configured, exactly like the domains endpoint: forgetting to set the
 * token must not leave a route that edits customer sites open to the world.
 */
function authorized(req: Request): boolean {
  const expected = process.env.INTERNAL_TOKEN || "";
  if (expected.length < 16) return false;
  const given = (req.headers.get("x-internal-token") || "").trim();
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export const POST = route(async (req: Request) => {
  if (!authorized(req)) throw new HttpError("Not found", 404);
  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || 50) || 50));

  const { ran, results } = await runAutopilotSweep(limit);
  const changed = results.filter((r) => !r.skipped);
  return ok({
    ran,
    checked: results.length,
    improved: changed.length,
    results: changed.map((r) => ({ slug: r.slug, name: r.name, before: r.before, after: r.after, changed: r.changed })),
  });
});

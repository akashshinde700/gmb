import { db } from "@/lib/db";
import { ok, readJson, route, str } from "@/lib/api";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { isVisitId } from "@/lib/visits";

// ORDER_PLACED is deliberately absent: it is written by the order endpoint,
// inside the same transaction as the order. An allow-listed "order" event would
// let anybody inflate a shop's numbers without buying anything.
const EVENT_TYPES = ["VISIT", "CART_ADD", "CTA_CALL", "CTA_WHATSAPP", "CTA_EMAIL", "CTA_DIRECTIONS", "FORM_SUBMIT"];

/**
 * POST /api/analytics/event — public tracking on published websites.
 * Always answers 200 so a blocked or throttled beacon never breaks the page;
 * `tracked` says whether the event was actually recorded.
 */
export const POST = route(async (req: Request) => {
  const body = await readJson<{
    slug?: string; type?: string; path?: string; experiment?: string; variant?: string;
    visitor?: string; visit?: string;
  }>(req);
  const slug = str(body.slug, 120);
  const type = str(body.type, 30);
  if (!slug || !EVENT_TYPES.includes(type)) return ok({ tracked: false });

  // Unauthenticated write path: without a cap a single script can inflate a
  // tenant's analytics and grow the table without bound.
  const limited = rateLimit(`event:${slug}:${clientIp(req)}`, 120, 10 * 60 * 1000);
  if (!limited.ok) return ok({ tracked: false, throttled: true });

  const business = await db.business.findUnique({
    where: { slug },
    select: { id: true, status: true },
  });
  if (!business || business.status !== "PUBLISHED") return ok({ tracked: false });

  // An A/B test rides along with the ordinary events rather than having its own
  // table: "which headline did this visitor see" is a property of the visit, the
  // call and the enquiry alike, and keeping them together is what makes the
  // comparison a like-for-like one.
  const experiment = str(body.experiment, 40);
  const variant = str(body.variant, 4);
  const meta: Record<string, string> = {};
  if (experiment && (variant === "a" || variant === "b")) {
    meta.experiment = experiment;
    meta.variant = variant;
  }
  // Which visit this happened in, so the owner can read a lead as a journey
  // instead of a single row: "looked at the gallery, tapped WhatsApp, then
  // filled the form". Values are validated here — this is an open write path.
  const visitor = str(body.visitor, 40);
  const visit = str(body.visit, 40);
  if (isVisitId(visitor)) meta.visitor = visitor;
  if (isVisitId(visit)) meta.visit = visit;

  await db.analyticsEvent.create({
    data: { businessId: business.id, type, path: str(body.path, 200) || "/", meta: JSON.stringify(meta) },
  });
  return ok({ tracked: true });
});

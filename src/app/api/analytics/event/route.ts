import { db } from "@/lib/db";
import { ok, readJson, route, str } from "@/lib/api";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const EVENT_TYPES = ["VISIT", "CTA_CALL", "CTA_WHATSAPP", "CTA_EMAIL", "CTA_DIRECTIONS", "FORM_SUBMIT"];

/**
 * POST /api/analytics/event — public tracking on published websites.
 * Always answers 200 so a blocked or throttled beacon never breaks the page;
 * `tracked` says whether the event was actually recorded.
 */
export const POST = route(async (req: Request) => {
  const body = await readJson<{ slug?: string; type?: string; path?: string }>(req);
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

  await db.analyticsEvent.create({
    data: { businessId: business.id, type, path: str(body.path, 200) || "/" },
  });
  return ok({ tracked: true });
});

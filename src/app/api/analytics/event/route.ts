import { db } from "@/lib/db";
import { fail, ok } from "@/lib/auth";

const EVENT_TYPES = ["VISIT", "CTA_CALL", "CTA_WHATSAPP", "CTA_EMAIL", "CTA_DIRECTIONS", "FORM_SUBMIT"];

/** POST /api/analytics/event — public tracking on published websites */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { slug?: string; type?: string; path?: string };
    const slug = (body.slug || "").trim();
    const type = (body.type || "").trim();
    if (!slug || !EVENT_TYPES.includes(type)) return fail("Invalid event");

    const business = await db.business.findUnique({ where: { slug } });
    if (!business || business.status !== "PUBLISHED") return ok({ tracked: false });

    await db.analyticsEvent.create({
      data: { businessId: business.id, type, path: (body.path || "/").slice(0, 200) },
    });
    return ok({ tracked: true });
  } catch {
    return ok({ tracked: false });
  }
}

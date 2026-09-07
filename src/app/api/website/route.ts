import { db } from "@/lib/db";
import { fail, getSessionBusiness, getSessionUser, ok } from "@/lib/auth";
import { serializeWebsite } from "@/lib/serialize";
import type { SiteSection, SiteTheme } from "@/lib/types";

export async function GET(req: Request) {
  const session = await getSessionUser(req);
  if (!session) return fail("Unauthorized", 401);
  const business = await getSessionBusiness(session.id);
  if (!business?.website) return fail("Website not found", 404);
  return ok(serializeWebsite(business.website));
}

export async function PUT(req: Request) {
  const session = await getSessionUser(req);
  if (!session) return fail("Unauthorized", 401);
  const business = await getSessionBusiness(session.id);
  if (!business?.website) return fail("Website not found", 404);

  const body = (await req.json()) as {
    sections?: SiteSection[]; theme?: SiteTheme;
    seoTitle?: string; seoDescription?: string; keywords?: string; ogImage?: string;
  };

  const data: Record<string, unknown> = {};
  if (Array.isArray(body.sections)) {
    // Validate section structure
    const clean = body.sections
      .filter((s) => s && typeof s.type === "string")
      .map((s) => ({
        id: String(s.id || `s_${Math.random().toString(36).slice(2, 10)}`),
        type: s.type,
        visible: s.visible !== false,
        content: typeof s.content === "object" && s.content !== null ? s.content : {},
      }));
    data.sectionsJson = JSON.stringify(clean);
    data.version = { increment: 1 };
  }
  if (body.theme && typeof body.theme === "object") data.themeJson = JSON.stringify(body.theme);
  if (body.seoTitle !== undefined) data.seoTitle = String(body.seoTitle).slice(0, 200);
  if (body.seoDescription !== undefined) data.seoDescription = String(body.seoDescription).slice(0, 400);
  if (body.keywords !== undefined) data.keywords = String(body.keywords).slice(0, 500);
  if (body.ogImage !== undefined) data.ogImage = String(body.ogImage).slice(0, 1000);

  const updated = await db.website.update({ where: { businessId: business.id }, data });
  return ok(serializeWebsite(updated));
}

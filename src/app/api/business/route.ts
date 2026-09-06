import { db } from "@/lib/db";
import { fail, getSessionBusiness, getSessionUser, ok } from "@/lib/auth";
import { serializeBusiness } from "@/lib/serialize";

export async function GET(req: Request) {
  const session = await getSessionUser(req);
  if (!session) return fail("Unauthorized", 401);
  const business = await getSessionBusiness(session.id);
  if (!business) return fail("No business found. Complete onboarding first.", 404);
  return ok(serializeBusiness(business));
}

export async function PUT(req: Request) {
  const session = await getSessionUser(req);
  if (!session) return fail("Unauthorized", 401);
  const business = await getSessionBusiness(session.id);
  if (!business) return fail("No business found. Complete onboarding first.", 404);

  const body = (await req.json()) as Record<string, unknown>;
  const str = (key: string, max = 2000) =>
    body[key] === undefined ? undefined : String(body[key]).slice(0, max).trim();

  const data: Record<string, string> = {};
  const fields = ["name", "tagline", "description", "ownerName", "phone", "whatsapp", "email",
    "address", "city", "state", "pincode", "establishedYear", "gstin", "logoUrl", "coverUrl",
    "brandPrimary", "brandSecondary", "brandAccent", "templateId", "gmbUrl", "mapsUrl", "placeId"];
  for (const f of fields) {
    const v = str(f);
    if (v !== undefined) data[f] = v;
  }
  if (body.hours !== undefined) data.hoursJson = JSON.stringify(body.hours);
  if (body.socials !== undefined) data.socialsJson = JSON.stringify(body.socials);

  if (data.name !== undefined && !data.name) return fail("Business name cannot be empty");

  const updated = await db.business.update({ where: { id: business.id }, data });
  return ok(serializeBusiness(updated));
}

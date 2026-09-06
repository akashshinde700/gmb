import { db } from "@/lib/db";
import { createToken, fail, getSessionUser, ok } from "@/lib/auth";

export async function GET(req: Request) {
  const session = await getSessionUser(req);
  if (!session) return fail("Unauthorized", 401);

  const business = await db.business.findUnique({
    where: { userId: session.id },
    include: {
      website: true,
      subscription: { include: { plan: true } },
    },
  });

  let serialized = null;
  if (business) {
    const { serializeBusiness, serializeWebsite, serializeSub } = await import("@/lib/serialize");
    serialized = {
      ...serializeBusiness(business),
      website: business.website ? serializeWebsite(business.website) : null,
      subscription: business.subscription ? serializeSub(business.subscription) : null,
    };
  }

  return ok({ user: session, business: serialized });
}

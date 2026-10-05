import { db } from "@/lib/db";
import { serializeBusiness, serializeSub, serializeWebsite } from "@/lib/serialize";
import { ok, requireUser, route } from "@/lib/api";
import { adminBackupToken } from "@/lib/auth";
import { allowanceFor } from "@/lib/appearance";
import { sweepSubscriptions } from "@/lib/expiry";

export const GET = route(async (req: Request) => {
  const session = await requireUser(req);

  // Trials and renewals are enforced here rather than by a scheduler: this route
  // runs on every dashboard load, so states never drift far from the clock. It
  // is throttled internally and never throws.
  await sweepSubscriptions();

  const business = await db.business.findUnique({
    where: { userId: session.id },
    include: {
      website: true,
      subscription: { include: { plan: true } },
      // The address the owner should actually hand out once a domain is live.
      domains: { where: { status: "ACTIVE" }, orderBy: { primary: "desc" }, take: 1 },
    },
  });

  return ok({
    user: session,
    // True while an admin is inside a customer's account. The console shows a
    // way back on every screen because of this — a browser has one cookie jar,
    // so "open this customer" changes who the whole browser is, and the admin
    // console left open in another tab keeps rendering as if nothing happened
    // until it asks the server for something and is told it is not an admin.
    impersonating: !!adminBackupToken(req),
    business: business
      ? {
          ...serializeBusiness(business),
          website: business.website ? serializeWebsite(business.website) : null,
          subscription: business.subscription ? serializeSub(business.subscription) : null,
          // Lets the dashboard show "2 of 5 design changes left" without a
          // second request.
          appearance: allowanceFor(business),
          primaryDomain: business.domains[0]?.hostname ?? null,
        }
      : null,
  });
});

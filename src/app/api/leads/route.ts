import { db } from "@/lib/db";
import { containsInsensitive } from "@/lib/db-portable";
import { HttpError, limitOrThrow, limitSubjectOrThrow, ok, pageParams, readJson, requireBusiness, requireUser, route, str } from "@/lib/api";
import { subscriptionServesSite } from "@/lib/expiry";
import { after } from "next/server";
import { sendLeadAlert, sendLeadAutoReply } from "@/lib/emails";
import { sendLeadSms, smsConfigured } from "@/lib/sms";

const LEAD_STATUSES = ["NEW", "CONTACTED", "FOLLOW_UP", "QUALIFIED", "CONVERTED", "CLOSED", "SPAM"];

/** Columns a caller may sort by. An allow-list, not a passthrough: the value
 *  goes straight into an orderBy, so anything else is refused. */
const LEAD_SORT_FIELDS = ["createdAt", "name", "status", "updatedAt"];

/**
 * Lead alerts are on unless the owner turned them off in Settings. A malformed
 * or missing preferences blob must not silently stop alerts, so anything
 * unparseable reads as "on".
 */
function leadAlertsEnabled(notifyJson: string | undefined | null): boolean {
  try {
    const prefs = JSON.parse(notifyJson || "{}") as { leadAlerts?: boolean };
    return prefs.leadAlerts !== false;
  } catch {
    return true;
  }
}

/**
 * Unlike email, SMS is opt-in: the platform shares one gateway phone with a
 * capped monthly allowance, so an unreadable preferences blob reads as "no"
 * here rather than "yes".
 */
function smsAlertsEnabled(notifyJson: string | undefined | null): boolean {
  try {
    const prefs = JSON.parse(notifyJson || "{}") as { smsAlerts?: boolean };
    return prefs.smsAlerts === true;
  } catch {
    return false;
  }
}

/** GET /api/leads — list tenant leads (auth required) */
export const GET = route(async (req: Request) => {
  const session = await requireUser(req);
  const business = await requireBusiness(session);
  const { take, skip, searchParams } = pageParams(req, 100, 500);

  const status = searchParams.get("status");
  if (status && status !== "ALL" && !LEAD_STATUSES.includes(status)) {
    throw new HttpError("Invalid status filter");
  }
  const search = str(searchParams.get("q"), 100);

  // Sorting is server-side because the client only ever holds one page: sorting
  // a page in the browser would order twenty-five rows out of three hundred and
  // call it sorted.
  const sortBy = str(searchParams.get("sortBy"), 20) || "createdAt";
  if (!LEAD_SORT_FIELDS.includes(sortBy)) throw new HttpError("Invalid sort field");
  const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";

  const where = {
    businessId: business.id,
    ...(status && status !== "ALL" ? { status } : {}),
    ...(search
      ? {
          OR: [
            { name: containsInsensitive(search) },
            { phone: containsInsensitive(search) },
            { email: containsInsensitive(search) },
            { message: containsInsensitive(search) },
          ],
        }
      : {}),
  };

  const [leads, total, newCount] = await Promise.all([
    db.lead.findMany({ where, orderBy: { [sortBy]: sortOrder }, take, skip }),
    db.lead.count({ where }),
    // Unfiltered, so the "new leads" badge counts everything waiting rather
    // than whatever happens to match the current search.
    db.lead.count({ where: { businessId: business.id, status: "NEW" } }),
  ]);
  return ok(leads, 200, { total, take, skip, newCount, sortBy, sortOrder });
});

/** POST /api/leads — PUBLIC endpoint: enquiry form on the published website (no auth) */
export const POST = route(async (req: Request) => {
  const body = await readJson<{
    slug?: string; name?: string; phone?: string; email?: string;
    message?: string; serviceName?: string; source?: string; website?: string;
  }>(req);

  // Honeypot: real users never see or fill this field, bots fill everything.
  if (str(body.website, 100)) return ok({ id: "", message: "Thank you! Your enquiry has been received." }, 201);

  const slug = str(body.slug, 120);
  const name = str(body.name, 100);
  const phone = str(body.phone, 20);
  if (!slug) throw new HttpError("Website not specified");
  if (!name || !phone) throw new HttpError("Name and phone are required");
  if (!/^[+\d][\d\s-]{6,19}$/.test(phone)) throw new HttpError("Please enter a valid phone number");

  // Unauthenticated write path: cap per IP overall and per site, so one script
  // cannot flood a tenant's inbox (or the database).
  limitOrThrow(req, "lead:ip", 10, 10 * 60 * 1000);
  limitSubjectOrThrow(`lead:site:${slug}`, 30, 10 * 60 * 1000);

  const business = await db.business.findUnique({
    where: { slug },
    include: {
      subscription: true,
      // The owner's account address is the fallback when no public business
      // email is set, and notifyJson decides whether they want alerts at all.
      user: { select: { email: true, name: true, notifyJson: true } },
    },
  });
  if (!business) throw new HttpError("Business not found", 404);
  if (business.status !== "PUBLISHED") {
    throw new HttpError("This website is not accepting enquiries right now", 403);
  }
  if (!subscriptionServesSite(business.subscription)) {
    throw new HttpError("This website is not accepting enquiries right now", 403);
  }

  const email = str(body.email, 200);
  const serviceName = str(body.serviceName, 150);

  // Lead + its analytics event + the owner's notification are one unit: a lead
  // that exists without its notification is a lead the owner never learns about.
  const lead = await db.$transaction(async (tx) => {
    const created = await tx.lead.create({
      data: {
        businessId: business.id,
        name,
        phone,
        email,
        message: str(body.message, 2000),
        serviceName,
        source: body.source === "WHATSAPP" ? "WHATSAPP" : "FORM",
      },
    });

    await tx.analyticsEvent.create({
      data: { businessId: business.id, type: "FORM_SUBMIT", path: "/contact" },
    });

    await tx.notification.create({
      data: {
        userId: business.userId,
        title: "New lead received 🔔",
        body: `${name} (${phone}) enquired on your website${serviceName ? ` about ${serviceName}` : ""}.`,
      },
    });

    return created;
  });

  // Email goes out after the response: the visitor sees their confirmation
  // immediately, and an SMTP hiccup can never turn a captured lead into an
  // error. The in-app notification written above is the durable record.
  after(async () => {
    const alertsOn = leadAlertsEnabled(business.user?.notifyJson);
    const ownerEmail = business.email || business.user?.email || "";
    if (alertsOn && ownerEmail) {
      await sendLeadAlert({
        to: ownerEmail,
        businessName: business.name,
        lead: {
          name: lead.name,
          phone: lead.phone,
          email: lead.email,
          message: lead.message,
          serviceName: lead.serviceName,
        },
      });
    }
    // A text to the owner's own phone, for the shopkeeper who will not open the
    // email for hours. Never to the visitor: the gateway sends from a personal
    // number, and messaging customers from it is exactly what gets a number
    // blocked — and in India what DLT registration governs.
    if (smsAlertsEnabled(business.user?.notifyJson) && smsConfigured()) {
      const ownerPhone = business.whatsapp || business.phone;
      if (ownerPhone) {
        await sendLeadSms({
          to: ownerPhone,
          businessName: business.name,
          leadName: lead.name,
          leadPhone: lead.phone,
          serviceName: lead.serviceName,
        });
      }
    }

    // Acknowledge the visitor in the tenant's name, only when they gave an
    // address. This is a reply to their own action, not marketing.
    if (lead.email) {
      await sendLeadAutoReply({
        to: lead.email,
        leadName: lead.name,
        businessName: business.name,
        businessPhone: business.phone,
        businessEmail: business.email,
      });
    }
  });

  return ok(
    { id: lead.id, message: "Thank you! Your enquiry has been received. We will contact you soon." },
    201,
  );
});

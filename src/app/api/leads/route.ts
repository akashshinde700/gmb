import { db } from "@/lib/db";
import { fail, getSessionBusiness, getSessionUser, ok } from "@/lib/auth";

/** GET /api/leads — list tenant leads (auth required) */
export async function GET(req: Request) {
  const session = await getSessionUser(req);
  if (!session) return fail("Unauthorized", 401);
  const business = await getSessionBusiness(session.id);
  if (!business) return fail("No business found", 404);

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const search = searchParams.get("q") || "";

  const leads = await db.lead.findMany({
    where: {
      businessId: business.id,
      ...(status && status !== "ALL" ? { status } : {}),
      ...(search ? {
        OR: [
          { name: { contains: search } },
          { phone: { contains: search } },
          { email: { contains: search } },
          { message: { contains: search } },
        ],
      } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return ok(leads);
}

/** POST /api/leads — PUBLIC endpoint: enquiry form on the published website (no auth) */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      slug?: string; name?: string; phone?: string; email?: string;
      message?: string; serviceName?: string; source?: string;
    };
    const slug = (body.slug || "").trim();
    const name = (body.name || "").trim();
    const phone = (body.phone || "").trim();
    if (!slug) return fail("Website not specified");
    if (!name || !phone) return fail("Name and phone are required");
    if (!/^[+\d][\d\s-]{6,15}$/.test(phone)) return fail("Please enter a valid phone number");

    const business = await db.business.findUnique({
      where: { slug },
      include: { subscription: true },
    });
    if (!business) return fail("Business not found", 404);
    if (business.status !== "PUBLISHED") return fail("This website is not accepting enquiries right now", 403);
    if (business.subscription?.status === "EXPIRED") return fail("This website is not accepting enquiries right now", 403);

    const lead = await db.lead.create({
      data: {
        businessId: business.id,
        name: name.slice(0, 100),
        phone: phone.slice(0, 20),
        email: (body.email || "").trim().slice(0, 200),
        message: (body.message || "").trim().slice(0, 2000),
        serviceName: (body.serviceName || "").trim().slice(0, 150),
        source: body.source === "WHATSAPP" ? "WHATSAPP" : "FORM",
      },
    });

    await db.analyticsEvent.create({
      data: { businessId: business.id, type: "FORM_SUBMIT", path: "/contact" },
    });
    await db.notification.create({
      data: {
        userId: business.userId,
        title: "New lead received 🔔",
        body: `${name} (${phone}) enquired on your website${body.serviceName ? ` about ${body.serviceName}` : ""}.`,
      },
    });

    return ok({ id: lead.id, message: "Thank you! Your enquiry has been received. We will contact you soon." }, 201);
  } catch {
    return fail("Could not submit enquiry. Please try again.", 500);
  }
}

import { db } from "@/lib/db";
import { fail, ok } from "@/lib/auth";

/** POST /api/platform-lead — public lead capture for the SaaS itself (Contact Sales / Request Demo) */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      name?: string; email?: string; phone?: string;
      businessType?: string; message?: string; source?: string;
    };
    const name = (body.name || "").trim();
    if (!name) return fail("Name is required");
    const email = (body.email || "").trim().toLowerCase();
    const phone = (body.phone || "").trim();
    if (!email && !phone) return fail("Email or phone is required");

    const lead = await db.platformLead.create({
      data: {
        name: name.slice(0, 100),
        email, phone,
        businessType: (body.businessType || "").slice(0, 100),
        message: (body.message || "").slice(0, 2000),
        source: ["CONTACT", "DEMO", "SALES"].includes(body.source || "") ? body.source! : "CONTACT",
      },
    });
    return ok({ id: lead.id, message: "Thanks! Our team will reach out to you within 24 hours." }, 201);
  } catch {
    return fail("Could not submit. Please try again.", 500);
  }
}

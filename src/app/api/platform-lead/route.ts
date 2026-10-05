import { db } from "@/lib/db";
import { HttpError, isEmail, limitOrThrow, ok, readJson, route, str } from "@/lib/api";

/** POST /api/platform-lead — public lead capture for the SaaS itself (Contact Sales / Request Demo) */
export const POST = route(async (req: Request) => {
  const body = await readJson<{
    name?: string; email?: string; phone?: string;
    businessType?: string; message?: string; source?: string; website?: string;
  }>(req);

  // Honeypot field — hidden from real users, filled by bots.
  if (str(body.website, 100)) return ok({ id: "", message: "Thanks! Our team will reach out to you within 24 hours." }, 201);

  const name = str(body.name, 100);
  if (!name) throw new HttpError("Name is required");
  const email = str(body.email, 200).toLowerCase();
  const phone = str(body.phone, 20);
  if (!email && !phone) throw new HttpError("Email or phone is required");
  if (email && !isEmail(email)) throw new HttpError("Please enter a valid email address");
  if (phone && !/^[+\d][\d\s-]{6,19}$/.test(phone)) throw new HttpError("Please enter a valid phone number");

  limitOrThrow(req, "platform-lead", 5, 10 * 60 * 1000);

  const lead = await db.platformLead.create({
    data: {
      name,
      email,
      phone,
      businessType: str(body.businessType, 100),
      message: str(body.message, 2000),
      source: ["CONTACT", "DEMO", "SALES"].includes(String(body.source)) ? String(body.source) : "CONTACT",
    },
  });
  return ok({ id: lead.id, message: "Thanks! Our team will reach out to you within 24 hours." }, 201);
});

// WebSetu — shared account provisioning used by admin-created customers.
//
// Onboarding (the customer-facing wizard) and admin provisioning must produce
// the same shape of tenant: business + generated website + a subscription.

import { db } from "@/lib/db";
import { TRIAL_DAYS } from "@/lib/trial";
import { hashPassword, uniqueSlug } from "@/lib/auth";
import { generateSite } from "@/lib/sections";
import { HttpError } from "@/lib/api";
import { randomInt } from "node:crypto";

/**
 * Readable one-time password for an account an admin creates on someone's
 * behalf. Ambiguous characters are left out so it survives being read down a
 * phone line, and it always satisfies the registration rules.
 */
export function generatePassword(): string {
  const words = ["Setu", "Nova", "Vega", "Orbit", "Delta", "Prism", "Coral", "Lumen", "Rapid", "Terra"];
  const word = words[randomInt(words.length)];
  const second = words[randomInt(words.length)];
  return `${word}${second}${randomInt(100, 999)}`;
}

export interface ProvisionInput {
  name: string;
  email: string;
  password?: string;
  business?: {
    name: string;
    category: string;
    phone?: string;
    city?: string;
    address?: string;
    planId?: string;
    cycle?: "MONTHLY" | "YEARLY";
    trialDays?: number;
  };
}

/**
 * Create a customer account, optionally with its business, website and
 * subscription, in one transaction. Returns the plain password so the admin can
 * hand it over once — it is never stored or logged in readable form.
 */
export async function provisionCustomer(input: ProvisionInput) {
  const email = input.email.trim().toLowerCase();
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) throw new HttpError("An account with this email already exists", 409);

  const password = input.password?.trim() || generatePassword();
  if (password.length < 8) throw new HttpError("Password must be at least 8 characters");

  let plan: Awaited<ReturnType<typeof db.plan.findFirst>> = null;
  if (input.business) {
    plan = input.business.planId
      ? await db.plan.findUnique({ where: { id: input.business.planId } })
      : ((await db.plan.findFirst({ where: { active: true, customForBusinessId: null }, orderBy: { sortOrder: "asc" } })) ?? null);
    if (input.business.planId && !plan) throw new HttpError("Selected plan does not exist");
    if (!plan) throw new HttpError("No subscription plans are configured yet", 503);
  }

  const slug = input.business ? await uniqueSlug(input.business.name) : null;
  const trialDays = input.business?.trialDays ?? TRIAL_DAYS;
  const cycle = input.business?.cycle === "YEARLY" ? "YEARLY" : "MONTHLY";

  const site = input.business
    ? generateSite({
        business: {
          name: input.business.name,
          category: input.business.category,
          tagline: "",
          description: "",
          city: input.business.city ?? "",
          phone: input.business.phone ?? "",
          whatsapp: input.business.phone ?? "",
          email,
          address: input.business.address ?? "",
          establishedYear: "",
          brandPrimary: "#059669",
          brandSecondary: "#064e3b",
          brandAccent: "#f59e0b",
          coverUrl: "",
          mapsUrl: "",
        },
        ai: null,
      })
    : null;

  const result = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name: input.name.trim(), email, passwordHash: hashPassword(password), role: "CUSTOMER" },
    });

    let businessId: string | null = null;
    if (input.business && site && slug && plan) {
      const business = await tx.business.create({
        data: {
          userId: user.id,
          name: input.business.name,
          slug,
          category: input.business.category,
          ownerName: input.name.trim(),
          phone: input.business.phone ?? "",
          whatsapp: input.business.phone ?? "",
          email,
          address: input.business.address ?? "",
          city: input.business.city ?? "",
          country: "India",
          status: "DRAFT",
          hoursJson: JSON.stringify({
            Monday: "9:00 AM – 7:00 PM", Tuesday: "9:00 AM – 7:00 PM", Wednesday: "9:00 AM – 7:00 PM",
            Thursday: "9:00 AM – 7:00 PM", Friday: "9:00 AM – 7:00 PM", Saturday: "9:00 AM – 7:00 PM",
            Sunday: "Closed",
          }),
          socialsJson: JSON.stringify({}),
        },
      });
      businessId = business.id;

      await tx.website.create({
        data: {
          businessId: business.id,
          seoTitle: site.seoTitle,
          seoDescription: site.seoDescription,
          keywords: site.keywords,
          themeJson: JSON.stringify(site.theme),
          sectionsJson: JSON.stringify(site.sections),
        },
      });

      await tx.subscription.create({
        data: {
          businessId: business.id,
          planId: plan.id,
          cycle,
          status: trialDays > 0 ? "TRIALING" : "ACTIVE",
          amount: trialDays > 0 ? 0 : cycle === "YEARLY" ? plan.priceYearly : plan.priceMonthly,
          trialEndsAt: trialDays > 0 ? new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000) : null,
          renewsAt:
            trialDays > 0
              ? null
              : new Date(Date.now() + (cycle === "YEARLY" ? 365 : 30) * 24 * 60 * 60 * 1000),
        },
      });
    }

    await tx.notification.create({
      data: {
        userId: user.id,
        title: "Your WebSetu account is ready 🎉",
        body: input.business
          ? `${input.business.name} has been set up for you. Log in to add content and publish.`
          : "Log in and complete the setup wizard to launch your website.",
      },
    });

    return { userId: user.id, businessId };
  });

  return { ...result, email, password, slug };
}

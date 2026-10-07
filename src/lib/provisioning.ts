// WebSetu — shared account provisioning used by admin-created customers.
//
// Onboarding (the customer-facing wizard) and admin provisioning must produce
// the same shape of tenant: business + generated website + a subscription.

import { db } from "@/lib/db";
import { TRIAL_DAYS } from "@/lib/trial";
import { hashPassword, uniqueSlug } from "@/lib/auth";
import { generateSite } from "@/lib/sections";
import { blueprintFor } from "@/lib/blueprint";
import { posterUrl } from "@/lib/site-art";
import { bestCandidate, profileFromSite, type SiteProfile } from "@/lib/uniqueness";
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
    /** Which reseller's client this is (their API created it). */
    resellerId?: string;
    /** The caller's own id for this site, for idempotent retries. */
    apiRef?: string;
    /** Publish immediately. The reseller API sells a live site, not a draft. */
    publish?: boolean;
    /** Facts the caller already knows, carried into the generated copy. */
    description?: string;
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

  // An admin-created business gets the same treatment as one from the wizard:
  // its own palette, its own services, its own section order — from the one
  // blueprint function, so "create customer" does not produce a green site for
  // every trade the way it used to.
  // Same treatment as the wizard: a palette nobody else in the trade is using,
  // and the most distinct of a few candidate genomes (see the note in
  // app/api/onboarding/route.ts — an admin-created customer must not look like
  // the previous one either).
  const tradeMates = input.business
    ? await db.business.findMany({
        where: { category: input.business.category },
        select: {
          brandPrimary: true, brandSecondary: true, brandAccent: true,
          website: { select: { themeJson: true, sectionsJson: true } },
        },
        take: 500,
      })
    : [];
  const takenPalettes = tradeMates.map((b) => `${b.brandPrimary},${b.brandSecondary},${b.brandAccent}`);
  const existingProfiles: SiteProfile[] = tradeMates
    .map((b) => {
      try {
        return profileFromSite({
          brandPrimary: b.brandPrimary,
          brandSecondary: b.brandSecondary,
          brandAccent: b.brandAccent,
          theme: b.website ? (JSON.parse(b.website.themeJson || "{}") as Record<string, never>) : {},
          sections: b.website ? (JSON.parse(b.website.sectionsJson || "[]") as { type: string; content?: Record<string, unknown> }[]) : [],
        });
      } catch {
        return null;
      }
    })
    .filter((x): x is SiteProfile => x !== null);

  const candidates = input.business
    ? [0, 1, 2].map((attempt) =>
        blueprintFor({
          name: input.business!.name,
          city: input.business!.city ?? "",
          category: input.business!.category,
          taken: takenPalettes,
          attempt,
        }),
      )
    : [];
  const picked = candidates.length
    ? bestCandidate(
        candidates,
        (candidate) =>
          profileFromSite({
            brandPrimary: candidate.palette[0],
            brandSecondary: candidate.palette[1],
            brandAccent: candidate.palette[2],
            theme: {
              ...candidate.look,
              shadow: candidate.dna.design.shadow,
              spacing: candidate.dna.design.spacing,
              button: candidate.dna.design.button,
              header: candidate.dna.design.header,
              footer: candidate.dna.design.footer,
              imageTreatment: candidate.dna.design.imageTreatment,
              motion: candidate.dna.motion,
            },
            sections: candidate.dna.sectionPlan.map((c) => ({ type: c.type, content: { variant: c.variant } })),
          }),
        existingProfiles,
      )
    : null;
  const blueprint = picked?.chosen ?? null;

  const site = input.business && blueprint
    ? generateSite({
        business: {
          name: input.business.name,
          category: input.business.category,
          tagline: "",
          description: input.business.description ?? "",
          city: input.business.city ?? "",
          phone: input.business.phone ?? "",
          whatsapp: input.business.phone ?? "",
          email,
          address: input.business.address ?? "",
          establishedYear: "",
          brandPrimary: blueprint.palette[0],
          brandSecondary: blueprint.palette[1],
          brandAccent: blueprint.palette[2],
          slug: slug ?? undefined,
          coverUrl: "",
          mapsUrl: "",
        },
        ai: null,
        blueprint,
        dna: blueprint.dna,
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
          resellerId: input.business.resellerId ?? null,
          apiRef: input.business.apiRef ?? "",
          ownerName: input.name.trim(),
          phone: input.business.phone ?? "",
          whatsapp: input.business.phone ?? "",
          email,
          address: input.business.address ?? "",
          city: input.business.city ?? "",
          country: "India",
          // A reseller's API sells a website, not a login: unless asked
          // otherwise, the site they create is live the moment they get the URL.
          status: input.business.publish ? "PUBLISHED" : "DRAFT",
          // The trade's own colours and a cover image of its own. Without these
          // every admin-created business came out on the schema defaults — the
          // same green, whichever trade it was.
          brandPrimary: blueprint!.palette[0],
          brandSecondary: blueprint!.palette[1],
          brandAccent: blueprint!.palette[2],
          coverUrl: slug ? posterUrl(slug, "wide", 0, { section: "cover" }) : "",
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
          publishedAt: input.business.publish ? new Date() : null,
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
        title: input.business?.resellerId ? `${input.business.name} is live 🎉` : "Your WebSetu account is ready 🎉",
        body: input.business
          ? `${input.business.name} has been set up for you. ${input.business.publish ? "Your website is live — log in to add your photos and details." : "Log in to add content and publish."}`
          : "Log in and complete the setup wizard to launch your website.",
      },
    });

    return { userId: user.id, businessId };
  });

  return { ...result, email, password, slug };
}

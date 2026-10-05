// One-off migration to single pricing: ₹599/month or ₹5,999/year, custom
// domain included (the customer buys the domain itself from any registrar).
//
//   npx tsx prisma/update-plans.ts
//
// Idempotent. What it does:
//   1. creates or updates the "standard" plan with the new price and features
//   2. hides every other public plan from pricing (active = false); per-customer
//      custom plans are left alone
//   3. moves unpaid subscriptions (TRIALING / EXPIRED) onto the new plan so
//      their checkout shows ₹599. Paying customers (ACTIVE / PAST_DUE) keep
//      their current plan and price until an admin moves them — the script
//      only reports how many there are.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const SLUG = "standard";
const PLAN = {
  name: "WebSetu",
  tagline: "Everything your business needs online",
  priceMonthly: 599,
  priceYearly: 5999,
  maxPages: -1,
  aiCredits: 100,
  maxDomains: 2,
  maxPalettes: -1,
  maxThemeChanges: -1,
  popular: true,
  active: true,
  sortOrder: 1,
  featuresJson: JSON.stringify([
    "Website designed for your business type",
    "AI-written content, services & FAQs",
    "Connect your own domain — www and bare domain (you buy the domain)",
    "Free yourname.websetu subdomain",
    "Unlimited pages & design changes",
    "SEO + Google Maps + AEO ready",
    "Lead inbox, WhatsApp & call buttons",
    "UPI payment QR, blog & analytics",
  ]),
};

async function main() {
  const plan = await db.plan.upsert({
    where: { slug: SLUG },
    update: PLAN,
    create: { slug: SLUG, ...PLAN },
  });
  console.log(`✔ ${plan.name}: ₹${plan.priceMonthly}/mo · ₹${plan.priceYearly}/yr · ${plan.maxDomains} custom hostnames (www + bare domain)`);

  const hidden = await db.plan.updateMany({
    where: { id: { not: plan.id }, customForBusinessId: null, active: true },
    data: { active: false, popular: false },
  });
  console.log(`✔ ${hidden.count} old public plan(s) hidden from pricing`);

  const moved = await db.subscription.updateMany({
    where: { planId: { not: plan.id }, status: { in: ["TRIALING", "EXPIRED"] }, plan: { customForBusinessId: null } },
    data: { planId: plan.id },
  });
  console.log(`✔ ${moved.count} trial/expired subscription(s) moved to ₹599`);

  const paying = await db.subscription.count({
    where: { planId: { not: plan.id }, status: { in: ["ACTIVE", "PAST_DUE"] } },
  });
  if (paying) {
    console.log(`ℹ ${paying} paying subscription(s) are still on an old plan — move them from the admin console when they renew.`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());

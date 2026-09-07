// One-off migration: apply page limits per plan (Starter 5 / Business 10 / Professional 20)
// alongside pricing (Starter ₹999 / Business ₹1499 / Professional ₹2999).
// Explicit + idempotent — safe to run multiple times.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const UPDATES: Record<string, { priceMonthly: number; priceYearly: number; maxPages: number; aiCredits: number; popular: boolean; features: string[] }> = {
  starter: {
    priceMonthly: 999, priceYearly: 9990, maxPages: 5, aiCredits: 10, popular: false,
    features: [
      "1 website on yourname.websetu.in", "5 pages", "Professional template",
      "Basic SEO setup", "Contact form + lead inbox", "WhatsApp button", "Mobile responsive",
    ],
  },
  business: {
    priceMonthly: 1499, priceYearly: 14990, maxPages: 10, aiCredits: 50, popular: true,
    features: [
      "Everything in Starter", "Up to 10 pages", "Premium templates",
      "Advanced SEO + Local SEO", "Blog / CMS", "Google Maps integration",
      "Analytics dashboard", "Lead management (CRM)", "Priority support",
    ],
  },
  professional: {
    priceMonthly: 2999, priceYearly: 29990, maxPages: 20, aiCredits: 500, popular: false,
    features: [
      "Everything in Business", "Up to 20 pages", "AI content generation", "AEO (Answer Engine Optimization)",
      "Advanced GEO / multi-location pages", "Custom domain connection",
      "Advanced analytics", "Product catalogue", "Dedicated manager",
    ],
  },
};

async function main() {
  for (const [slug, u] of Object.entries(UPDATES)) {
    const plan = await db.plan.findUnique({ where: { slug } });
    if (!plan) { console.log(`⚠ plan ${slug} not found — skipped`); continue; }
    await db.plan.update({
      where: { id: plan.id },
      data: {
        priceMonthly: u.priceMonthly,
        priceYearly: u.priceYearly,
        maxPages: u.maxPages,
        aiCredits: u.aiCredits,
        popular: u.popular,
        featuresJson: JSON.stringify(u.features),
      },
    });
    console.log(`✔ ${slug}: ₹${u.priceMonthly}/mo · ${u.maxPages} pages · ${u.features.join(" | ")}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());

// One-off migration: update plan pricing (Starter ₹999 / Business ₹1499 / Professional ₹2999)
// and replace unlimited pages (-1) with finite limits. Safe to run once.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const UPDATES: Record<string, { priceMonthly: number; priceYearly: number; maxPages: number; aiCredits: number; swap: string[] }> = {
  starter: {
    priceMonthly: 999, priceYearly: 9990, maxPages: 8, aiCredits: 10,
    swap: ["5 pages", "8 pages"],
  },
  business: {
    priceMonthly: 1499, priceYearly: 14990, maxPages: 25, aiCredits: 50,
    swap: ["Unlimited pages", "Up to 25 pages"],
  },
  professional: {
    priceMonthly: 2999, priceYearly: 29990, maxPages: 60, aiCredits: 500,
    swap: ["AI content generation", "Up to 60 pages", "AI content generation"],
  },
};

async function main() {
  for (const [slug, u] of Object.entries(UPDATES)) {
    const plan = await db.plan.findUnique({ where: { slug } });
    if (!plan) { console.log(`⚠ plan ${slug} not found — skipped`); continue; }
    const features: string[] = JSON.parse(plan.featuresJson || "[]");
    let next = features.map((f) => (f === u.swap[0] ? u.swap[1] : f));
    if (u.swap.length > 2 && !next.includes(u.swap[1])) {
      next = next.map((f) => (f === u.swap[2] ? u.swap[1] : f));
      if (!next.includes(u.swap[1])) next.splice(1, 0, u.swap[1]);
    }
    await db.plan.update({
      where: { id: plan.id },
      data: {
        priceMonthly: u.priceMonthly,
        priceYearly: u.priceYearly,
        maxPages: u.maxPages,
        aiCredits: u.aiCredits,
        featuresJson: JSON.stringify(next),
      },
    });
    console.log(`✔ ${slug}: ₹${u.priceMonthly}/mo · maxPages ${u.maxPages} · ${next.join(" | ")}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());

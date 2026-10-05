/**
 * Set how many custom domains each plan bundles.
 *
 *   node scripts/set-plan-domains.mjs --dry
 *   node scripts/set-plan-domains.mjs
 *
 * Every tier is 0 on purpose. Domains are sold as a paid add-on, not bundled:
 * a customer who wants one pays for it and an admin grants it per account
 * (Admin -> Customers -> ... -> Custom domains), whichever plan they are on.
 * The plan number and the per-customer grant add together, so this exists for
 * the day a tier does include one.
 *
 * Idempotent — safe to re-run.
 */
import { PrismaClient } from "@prisma/client";

const TIERS = {
  starter: 0,
  business: 0,
  professional: 0,
  enterprise: 0,
};

const db = new PrismaClient();
const dryRun = process.argv.includes("--dry");

for (const [slug, maxDomains] of Object.entries(TIERS)) {
  const plan = await db.plan.findUnique({ where: { slug }, select: { name: true, maxDomains: true } });
  if (!plan) {
    console.warn(`  ?  ${slug}: no such plan — skipped`);
    continue;
  }
  if (plan.maxDomains === maxDomains) {
    console.log(`  =  ${plan.name}: already ${maxDomains}`);
    continue;
  }
  console.log(`  ${dryRun ? "~" : "+"}  ${plan.name}: ${plan.maxDomains} -> ${maxDomains}`);
  if (!dryRun) await db.plan.update({ where: { slug }, data: { maxDomains } });
}

// Plans built for one customer inherit whatever the admin set for them; they
// are never touched here.
const custom = await db.plan.count({ where: { customForBusinessId: { not: null } } });
if (custom) console.log(`\n${custom} custom plan(s) left untouched — set those per customer.`);

console.table(
  await db.plan.findMany({
    where: { customForBusinessId: null },
    select: { name: true, priceMonthly: true, maxDomains: true },
    orderBy: { sortOrder: "asc" },
  }),
);

await db.$disconnect();

/**
 * Move all data from SQLite to PostgreSQL, in two phases.
 *
 *   # 1. while still on SQLite
 *   node scripts/use-db.mjs sqlite && npx prisma generate
 *   node scripts/migrate-db.mjs export        # -> db-export.json
 *
 *   # 2. after pointing DATABASE_URL at PostgreSQL
 *   node scripts/use-db.mjs postgresql && npx prisma generate && npx prisma db push
 *   node scripts/migrate-db.mjs import        # <- db-export.json
 *
 * Two phases rather than one because the generated Prisma client is
 * provider-specific: one process cannot hold both a SQLite and a PostgreSQL
 * client. The JSON file in between is also a plain, inspectable backup — worth
 * keeping until the new database has been running for a while.
 *
 * Import order follows foreign keys, and each table is written in chunks so a
 * large tenant does not build one enormous statement.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const FILE = "db-export.json";
const CHUNK = 500;

// Parents before children. Reversed for a wipe.
const TABLES = [
  "user",
  "plan",
  "business",
  "website",
  "subscription",
  "payment",
  "service",
  "product",
  "galleryItem",
  "testimonial",
  "faq",
  "blogPost",
  "lead",
  "domain",
  "coupon",
  "template",
  "analyticsEvent",
  "analyticsDaily",
  "platformLead",
  "platformLeadFollowUp",
  "notification",
  "passwordReset",
  "auditLog",
  "setting",
  "palette",
  "platformPost",
];

const db = new PrismaClient();
const mode = process.argv[2];

function chunks(rows) {
  const out = [];
  for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK));
  return out;
}

if (mode === "export") {
  const data = {};
  for (const table of TABLES) {
    if (!db[table]) {
      console.warn(`  ?  ${table}: not in this client — skipped`);
      continue;
    }
    const rows = await db[table].findMany();
    data[table] = rows;
    console.log(`  ->  ${table}: ${rows.length}`);
  }
  // Dates serialise to ISO strings; the import turns them back.
  writeFileSync(FILE, JSON.stringify(data, null, 2));
  console.log(`\nwrote ${FILE}`);
} else if (mode === "import") {
  const data = JSON.parse(readFileSync(FILE, "utf8"));

  // Anything already in the target is removed first, children before parents,
  // so a re-run is a clean reload rather than a pile of unique-constraint
  // errors.
  for (const table of [...TABLES].reverse()) {
    if (!db[table] || !data[table]) continue;
    await db[table].deleteMany({});
  }

  for (const table of TABLES) {
    const rows = data[table];
    if (!db[table] || !rows?.length) continue;

    // Prisma returns dates as Date objects and JSON.stringify made them
    // strings; createMany needs them back as Dates.
    const revived = rows.map((row) => {
      const out = {};
      for (const [key, value] of Object.entries(row)) {
        out[key] =
          typeof value === "string" && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(value)
            ? new Date(value)
            : value;
      }
      return out;
    });

    let written = 0;
    for (const chunk of chunks(revived)) {
      await db[table].createMany({ data: chunk });
      written += chunk.length;
    }
    console.log(`  <-  ${table}: ${written}`);
  }
  console.log("\nimport complete");
} else {
  console.error("usage: node scripts/migrate-db.mjs export|import");
  process.exit(1);
}

await db.$disconnect();

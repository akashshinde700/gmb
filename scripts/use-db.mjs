/**
 * Switch the Prisma datasource between SQLite and PostgreSQL.
 *
 *   node scripts/use-db.mjs postgresql
 *   node scripts/use-db.mjs sqlite
 *
 * Prisma will not read the provider from an environment variable — it has to be
 * a literal in the schema — so switching means rewriting that one line. This
 * script does it predictably instead of by hand, and prints the DATABASE_URL
 * the chosen provider needs. The app reads the provider off that URL, so there
 * is nothing else to keep in step.
 *
 * Run `npx prisma generate` afterwards: the generated client is provider-
 * specific, and a client built for SQLite will not talk to PostgreSQL.
 */
import { readFileSync, writeFileSync } from "node:fs";

const SCHEMA = "prisma/schema.prisma";
const target = process.argv[2];

if (target !== "sqlite" && target !== "postgresql") {
  console.error("usage: node scripts/use-db.mjs sqlite|postgresql");
  process.exit(1);
}

const schema = readFileSync(SCHEMA, "utf8");
const match = /datasource\s+db\s*\{[^}]*\}/m.exec(schema);
if (!match) {
  console.error(`could not find the datasource block in ${SCHEMA}`);
  process.exit(1);
}

const current = /provider\s*=\s*"([^"]+)"/.exec(match[0])?.[1];
if (current === target) {
  console.log(`already on ${target}`);
} else {
  const updated = match[0].replace(/provider\s*=\s*"[^"]+"/, `provider = "${target}"`);
  writeFileSync(SCHEMA, schema.replace(match[0], updated));
  console.log(`${SCHEMA}: provider ${current} -> ${target}`);
}

console.log("\nSet in .env:");
if (target === "postgresql") {
  console.log("  DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/websetu?schema=public");
} else {
  console.log("  DATABASE_URL=file:../db/custom.db");
}
console.log("\nThen: npx prisma generate && npx prisma db push");

/**
 * Fail the build if the deployable artifact carries something a deployable
 * artifact must never carry.
 *
 *   node scripts/check-standalone.mjs        # after `next build`
 *
 * Why this exists: `next build` copies a route's runtime file reads into
 * `.next/standalone` by resolving them statically. When a path cannot be
 * resolved — an environment variable, `os.tmpdir()` — the tracer's documented
 * fallback is "include everything under the project root". That is not a
 * hypothetical. It shipped a `.next/standalone` containing `db/custom.db` (the
 * live database: scrypt password hashes, leads, payment rows), `src/`, `e2e/`,
 * `marketing_content/`, a 1.4 MB rejected-patch file, and the build machine's
 * `.env`.
 *
 * The root cause is fixed in the source (see the `turbopackIgnore` comments in
 * src/lib/uploads.ts and src/app/api/admin/backup/route.ts). This script is the
 * net under that fix: the next dynamic file read someone adds cannot quietly
 * reintroduce the same leak without turning the build red.
 *
 * Exits 0 when clean, 1 when not. Safe to run in CI.
 */

import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const STANDALONE = ".next/standalone";

/** Never allowed anywhere in the artifact. */
const FORBIDDEN_FILES = [
  { test: (name) => name === ".env" || (name.startsWith(".env.") && name !== ".env.example"), why: "environment file (secrets)" },
  { test: (name) => name.endsWith(".db") || name.endsWith(".db-wal") || name.endsWith(".db-shm") || name.endsWith(".sqlite"), why: "database file (customer data)" },
  { test: (name) => name === ".git", why: "git directory (full history)" },
  { test: (name) => name.endsWith(".pem") || name.endsWith(".key"), why: "key material" },
  { test: (name, rel) => name === "deploy.py" || name === "deploy_config.json" || rel === ".tmpkeys", why: "deployment credentials" },
];

/**
 * Directories that are repository material, not runtime material.
 *
 * `src/` is on this list deliberately. It is TypeScript the server never reads
 * — it is compiled into `.next/server` — and its presence is the exact
 * fingerprint of a trace that widened to the project root, so it is worth
 * failing on even though shipping readable source is not itself dangerous.
 */
const FORBIDDEN_DIRS = ["db", "e2e", "tests", "scripts", "tools", "marketing_content", ".git", "src"];

/** How deep to walk. The repo material that leaked before was all within 3. */
const MAX_DEPTH = 4;

async function walk(dir, depth, onEntry) {
  if (depth > MAX_DEPTH) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // unreadable or absent — nothing to report
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(STANDALONE, full);
    await onEntry(entry, full, rel);
    if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== ".next") {
      await walk(full, depth + 1, onEntry);
    }
  }
}

const problems = [];

try {
  await stat(STANDALONE);
} catch {
  console.error(`check-standalone: ${STANDALONE} does not exist — run \`next build\` first.`);
  process.exit(1);
}

await walk(STANDALONE, 0, async (entry, full, rel) => {
  const topLevel = rel.split(path.sep)[0];
  for (const rule of FORBIDDEN_FILES) {
    if (rule.test(entry.name, rel)) {
      problems.push(`${rel} — ${rule.why}`);
    }
  }
  if (entry.isDirectory() && FORBIDDEN_DIRS.includes(entry.name) && topLevel === entry.name) {
    problems.push(`${rel}/ — repository directory, not runtime material`);
  }
  // A stray copy of the checked-out repository shows up as dotfiles at the top.
  if (entry.name === ".gitignore" || entry.name === ".gitattributes") {
    problems.push(`${rel} — repository metadata`);
  }
  void full;
});

if (problems.length) {
  console.error(`\ncheck-standalone: ${problems.length} problem(s) in ${STANDALONE}:\n`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    "\nA runtime file read with an unresolvable path makes the build tracer include the\n" +
      "whole project. Find the read (the build log names the file) and mark it:\n" +
      "  path.resolve(/* turbopackIgnore: true */ someDynamicValue)\n",
  );
  process.exit(1);
}

console.log(`check-standalone: ${STANDALONE} is clean.`);

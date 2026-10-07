/**
 * Remove the build machine's `.env` from the deployable output.
 *
 *   node scripts/strip-standalone-env.mjs
 *
 * `next build` copies `.env` and `.env.production` into `.next/standalone` by
 * design (see writeStandaloneDirectory in next/dist/build/index.js). That means
 * the developer's `.env` — `APP_SECRET`, `RAZORPAY_KEY_SECRET`, `SMTP_PASS`,
 * `HTTPSMS_API_KEY` — ends up inside the folder that gets uploaded on deploy,
 * archived in CI, or handed to somebody to "just run".
 *
 * Nothing in this deployment reads it. `server.js` never calls loadEnvConfig,
 * and the deploy path supplies configuration from outside the artifact:
 *
 *   scripts/deploy-swap.py:174   uploads the real .env to the app directory
 *   scripts/deploy-swap.py:90    PM2 inlines the full runtime env
 *   scripts/deploy-swap.py:236   `set -a && . ./.env && set +a` before starting
 *
 * So the copy is pure liability, and it goes. Use KEEP_BUILD_ENV=1 if you have
 * a deployment that genuinely boots a standalone artifact with a baked-in env
 * file — and if you do, make sure the artifact is treated as a secret.
 */

import { rm, stat } from "node:fs/promises";
import path from "node:path";

const STANDALONE = path.join(".next", "standalone");
const TARGETS = [".env", ".env.production", ".env.local", ".env.production.local", ".env.development"];

if (process.env.KEEP_BUILD_ENV === "1") {
  console.log("strip-standalone-env: KEEP_BUILD_ENV=1, leaving env files in place.");
  process.exit(0);
}

try {
  await stat(STANDALONE);
} catch {
  console.error(`strip-standalone-env: ${STANDALONE} does not exist — run \`next build\` first.`);
  process.exit(1);
}

const removed = [];
for (const name of TARGETS) {
  const target = path.join(STANDALONE, name);
  try {
    await stat(target);
    await rm(target, { force: true });
    removed.push(name);
  } catch {
    /* not present — the common case in CI, where env comes from the runner */
  }
}

console.log(
  removed.length
    ? `strip-standalone-env: removed ${removed.join(", ")} from ${STANDALONE} (runtime env comes from the environment).`
    : `strip-standalone-env: no env files in ${STANDALONE}.`,
);

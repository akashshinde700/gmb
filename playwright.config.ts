import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * WebSetu end-to-end tests.
 *
 * The suite runs against the production build (npm run build) on port 3100.
 * Start one yourself and the config reuses it; otherwise Playwright starts it.
 * Tests share a single seeded database, so specs that write data create their
 * own accounts rather than editing the seeded demo tenants.
 */
// The audit runs against the production build: `next dev` (turbopack) does not
// hydrate under headless Chromium, and production is what customers get.
const PORT = Number(process.env.PW_PORT || 3100);
const BASE = process.env.PW_BASE_URL || `http://127.0.0.1:${PORT}`;

/** Read .env for the standalone server, which does not load it itself. */
function loadEnvFile(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const raw = readFileSync(resolve(__dirname, ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m) out[m[1]] = m[2];
    }

    // DATABASE_URL is written relative to prisma/schema.prisma so the same
    // value works on every machine. The standalone server runs from
    // .next/standalone, where that relative path points at nothing — which
    // surfaces as a 500 on login rather than as a missing-database error. The
    // deploy passes an absolute path for the same reason; so does this.
    const url = out.DATABASE_URL;
    if (url?.startsWith("file:") && !url.startsWith("file:/")) {
      out.DATABASE_URL = `file:${resolve(__dirname, "prisma", url.slice(5))}`;
    }
  } catch {
    // No .env is fine locally; the suite will fail loudly on the first login
    // rather than silently, which is the correct signal.
  }
  return out;
}

export default defineConfig({
  testDir: "./e2e",
  // Everything shares one SQLite file; parallel writers deadlock it.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `node .next/standalone/server.js`,
    url: `${BASE}/api/plans`,
    reuseExistingServer: true,
    timeout: 180_000,
    // The standalone server does not read .env — that is the whole reason the
    // deploy writes a PM2 ecosystem file — so the suite has to hand it the same
    // values. Without APP_SECRET it refuses to sign anything and every login in
    // the suite fails with a 500 that looks like an application bug.
    env: {
      ...loadEnvFile(),
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
      // No outbound mail or SMS from a test run. The suite registers accounts
      // as pw-<tag>@example.com, and each registration sends a real welcome
      // email — which bounced straight back into the WebSetu mailbox, dozens
      // per run. The mailer now refuses reserved test domains on its own; this
      // is the second lock, so a test that mails a plausible-looking address
      // still cannot reach anybody.
      SMTP_HOST: "",
      SMTP_USER: "",
      SMTP_PASS: "",
      HTTPSMS_API_KEY: "",
    },
  },
});

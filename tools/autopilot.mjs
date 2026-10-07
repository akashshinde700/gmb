#!/usr/bin/env node
/**
 * Run the platform's maintenance pass over every published site.
 *
 *   INTERNAL_TOKEN=... APP_URL=https://app.websetu.in node tools/autopilot.mjs
 *
 * Meant for cron — once a week is plenty, and once a day is harmless. It calls
 * the app rather than the database so the pass always behaves exactly like the
 * "Run a check now" button in the dashboard.
 *
 *   # weekly, Mondays at 4am
 *   0 4 * * 1  cd /opt/websetu && INTERNAL_TOKEN=... node tools/autopilot.mjs >> /var/log/websetu-autopilot.log 2>&1
 */

const BASE = (process.env.APP_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const TOKEN = process.env.INTERNAL_TOKEN || "";
const LIMIT = process.env.LIMIT || "200";

if (TOKEN.length < 16) {
  console.error("INTERNAL_TOKEN is missing or too short — refusing to run.");
  process.exit(2);
}

const res = await fetch(`${BASE}/api/internal/autopilot?limit=${encodeURIComponent(LIMIT)}`, {
  method: "POST",
  headers: { "x-internal-token": TOKEN },
});
const body = await res.json().catch(() => null);
if (!res.ok) {
  console.error(`Autopilot failed: ${res.status} ${body?.error || ""}`);
  process.exit(1);
}

const { ran, checked, improved, results } = body.data;
console.log(`[${new Date().toISOString()}] autopilot: checked ${checked}/${ran} published sites, improved ${improved}`);
for (const r of results) {
  console.log(`  ${r.name} (${r.slug}): ${r.before} → ${r.after} · ${r.changed.join(", ")}`);
}

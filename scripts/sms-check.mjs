/**
 * Verify the httpSMS credentials and list the phones registered as gateways.
 *
 *   node scripts/sms-check.mjs                  # verify + list phones
 *   node scripts/sms-check.mjs +919812345678    # also send one test SMS
 *
 * Reads .env directly so it runs without the Next.js runtime, and so the API
 * key never has to be typed on a command line.
 */
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const KEY = process.env.HTTPSMS_API_KEY;
if (!KEY) {
  console.error("HTTPSMS_API_KEY is missing from .env");
  process.exit(1);
}

async function call(path, init = {}) {
  const res = await fetch(`https://api.httpsms.com${path}`, {
    ...init,
    headers: { "x-api-key": KEY, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* keep the raw body for the error message */
  }
  return { status: res.status, json, text };
}

const phones = await call("/v1/phones");
console.log("GET /v1/phones ->", phones.status);
if (phones.status !== 200) {
  console.error(phones.text.slice(0, 500));
  process.exit(1);
}

const list = phones.json?.data ?? [];
if (!list.length) {
  console.log("No phone registered yet. Install the httpSMS Android app and sign in with this account.");
} else {
  for (const p of list) {
    console.log(`  ${p.phone_number}  sim=${p.sim ?? "DEFAULT"}  id=${p.id}`);
  }
}

const to = process.argv[2];
if (to) {
  const from = process.env.HTTPSMS_FROM || list[0]?.phone_number;
  if (!from) {
    console.error("No sender number: set HTTPSMS_FROM, or register a phone first.");
    process.exit(1);
  }
  const sent = await call("/v1/messages/send", {
    method: "POST",
    body: JSON.stringify({ from, to, content: "WebSetu SMS test - lead alerts are wired up." }),
  });
  console.log(`POST /v1/messages/send -> ${sent.status}`);
  console.log(sent.text.slice(0, 400));
}

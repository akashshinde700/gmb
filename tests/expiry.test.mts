/**
 * Unit tests for subscription entitlement and JSON-LD escaping.
 *
 *   node --experimental-strip-types tests/expiry.test.mts
 *
 * Both decide something a customer or a visitor sees: the first is when a site
 * goes dark (getting it wrong either serves a product for free or takes a
 * paying customer offline), the second is whether tenant-authored text can
 * break out of a <script> tag on a published site.
 */

import { subscriptionServesSite, GRACE_DAYS } from "../src/lib/expiry-rules.ts";
import { jsonLdScript } from "../src/lib/site-utils.ts";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const NOW = new Date("2026-03-10T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
const ahead = (days: number) => new Date(NOW.getTime() + days * DAY);

console.log("subscriptionServesSite");
check("no subscription row keeps a legacy site visible", subscriptionServesSite(null, NOW));
check(
  "live trial serves",
  subscriptionServesSite({ status: "TRIALING", trialEndsAt: ahead(1) }, NOW),
);
check(
  "trial one second past its end does not serve",
  !subscriptionServesSite({ status: "TRIALING", trialEndsAt: new Date(NOW.getTime() - 1000) }, NOW),
);
check(
  "trial with no end date serves",
  subscriptionServesSite({ status: "TRIALING", trialEndsAt: null }, NOW),
);
check(
  "active plan serves regardless of renewal date",
  subscriptionServesSite({ status: "ACTIVE", renewsAt: ago(30) }, NOW),
);
check(
  "past due inside the grace window still serves",
  subscriptionServesSite({ status: "PAST_DUE", renewsAt: ago(Math.max(0, GRACE_DAYS - 1)) }, NOW),
);
check(
  "past due beyond the grace window stops serving",
  !subscriptionServesSite({ status: "PAST_DUE", renewsAt: ago(GRACE_DAYS + 1) }, NOW),
);
check("expired never serves", !subscriptionServesSite({ status: "EXPIRED" }, NOW));
check("canceled never serves", !subscriptionServesSite({ status: "CANCELED" }, NOW));

console.log("jsonLdScript");
const CLOSE_TAG = "</" + "script>";
const evil = { name: `Acme ${CLOSE_TAG}<img src=x onerror=alert(1)>`, note: "Tea & Co" };
const encoded = jsonLdScript(evil);
check("no literal closing script tag survives", !encoded.includes(CLOSE_TAG), encoded);
check("no raw angle bracket survives", !encoded.includes("<") && !encoded.includes(">"));
check("ampersand is escaped too", !encoded.includes("&"));
check(
  "the parsed value is unchanged",
  JSON.parse(encoded).name === evil.name && JSON.parse(encoded).note === evil.note,
);
const seps = jsonLdScript({ s: "a" + String.fromCharCode(0x2028) + "b" + String.fromCharCode(0x2029) + "c" });
check(
  "line separators are escaped",
  !seps.includes(String.fromCharCode(0x2028)) && !seps.includes(String.fromCharCode(0x2029)),
);
check("line separators still parse back", JSON.parse(seps).s.length === 5);

console.log(`
${passed} passed, ${failed} failed`);
if (failed) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}

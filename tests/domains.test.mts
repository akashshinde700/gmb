/**
 * Unit tests for customer-domain hostname handling.
 *
 *   node --experimental-strip-types tests/domains.test.mts
 *
 * These two functions guard a routing table and a certificate request. A wrong
 * "yes" from checkHostname means asking a certificate authority for a name the
 * customer does not own; a wrong parse in normalizeHost means serving one
 * tenant's site on another tenant's domain. Both are pinned down here.
 */

import {
  checkHostname, domainAllowance, normalizeHost, txtRecordName, txtRecordValue,
} from "../src/lib/domain-rules.ts";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function eq(name: string, actual: unknown, expected: unknown) {
  if (actual === expected) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    console.log(`  FAIL ${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function accepts(input: string, expected: string) {
  const r = checkHostname(input);
  eq(`accepts "${input}"`, r.ok ? r.hostname : `rejected: ${r.error}`, expected);
}

function rejects(name: string, input: string) {
  eq(`rejects ${name}`, checkHostname(input).ok, false);
}

// The platform host must be stable regardless of the developer's own .env.
process.env.NEXT_PUBLIC_APP_URL = "https://www.websetu.instantqr.tech";

console.log("normalizeHost — the Host header is attacker-controlled");
eq("lower-cases", normalizeHost("WWW.Example.COM"), "www.example.com");
eq("drops the port", normalizeHost("example.com:3000"), "example.com");
eq("drops a trailing dot", normalizeHost("example.com."), "example.com");
eq("trims whitespace", normalizeHost("  example.com  "), "example.com");
eq("null is empty", normalizeHost(null), "");
eq("undefined is empty", normalizeHost(undefined), "");
eq("an IPv6 literal is refused", normalizeHost("[::1]:3000"), "");

console.log("checkHostname — accepted");
accepts("example.com", "example.com");
accepts("www.example.com", "www.example.com");
accepts("shop.example.co.in", "shop.example.co.in");
accepts("  WWW.Example.com  ", "www.example.com");
accepts("https://www.example.com/pricing", "www.example.com");
accepts("example.com.", "example.com");
accepts("my-shop-1.example.com", "my-shop-1.example.com");
accepts("xn--80ak6aa92e.com", "xn--80ak6aa92e.com");

console.log("checkHostname — rejected");
rejects("an empty string", "");
rejects("a bare label with no dot", "example");
rejects("an IPv4 address", "203.0.113.10");
rejects("a wildcard", "*.example.com");
rejects("a label starting with a hyphen", "-bad.example.com");
rejects("a label ending with a hyphen", "bad-.example.com");
rejects("an underscore", "my_shop.example.com");
rejects("a space inside", "my shop.example.com");
rejects("raw unicode rather than punycode", "münchen.example.com");
rejects("the platform's own hostname", "www.websetu.instantqr.tech");
rejects("localhost", "localhost");

console.log("DNS record helpers");
eq("txt name is namespaced", txtRecordName("example.com"), "_websetu.example.com");
eq("txt value carries the token", txtRecordValue("abc123"), "websetu-verify=abc123");

console.log("domainAllowance — domains are a paid add-on, not a plan feature");
eq("no plan and no credits allows nothing", domainAllowance(null, null), 0);
eq(
  "a plan that bundles none still allows nothing on its own",
  domainAllowance({ maxDomains: 0 }, { domainCredits: 0 }),
  0,
);
eq(
  "credits alone unlock it, whatever the plan",
  domainAllowance({ maxDomains: 0 }, { domainCredits: 1 }),
  1,
);
eq(
  "a bundled domain adds to purchased ones rather than replacing them",
  domainAllowance({ maxDomains: 1 }, { domainCredits: 2 }),
  3,
);
eq("unlimited credits win", domainAllowance({ maxDomains: 0 }, { domainCredits: -1 }), -1);
eq("an unlimited plan wins too", domainAllowance({ maxDomains: -1 }, { domainCredits: 0 }), -1);
eq(
  "a missing business reads as no credits, never as unlimited",
  domainAllowance({ maxDomains: 0 }, undefined),
  0,
);
eq("negative credits cannot subtract a bundled domain", domainAllowance({ maxDomains: 2 }, { domainCredits: -5 }), 2);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}

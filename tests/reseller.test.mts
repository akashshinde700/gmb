/**
 * Unit tests for the white-label reseller surface.
 *
 *   node --experimental-strip-types --import ./tests/path-alias.mjs tests/reseller.test.mts
 *
 * The promises being tested are the ones an agency's business depends on:
 *   · a key is handed out once and only its hash is ever stored;
 *   · a key that has been revoked, or forged, matches nothing;
 *   · a site request names exactly the fields that are wrong, and never invents
 *     a value the caller did not send;
 *   · a site's public URL prefers the client's own domain.
 */

import {
  createApiKey, hashApiKey, looksLikeApiKey, hashMatches, cleanBrandInput,
  readSiteRequest, siteRequestProblems, siteUrls, PLATFORM_BRAND,
} from "@/lib/reseller";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) passed++;
  else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ---------- keys ----------
const a = createApiKey();
const b = createApiKey();

check("a key is prefixed for identification", a.key.startsWith("wsk_"));
check("the prefix is a label, not the secret", a.prefix.length < a.key.length);
check("two keys differ", a.key !== b.key);
check("the plaintext is never the stored hash", a.hash !== a.key);
check("the hash is a sha-256 hex digest", /^[0-9a-f]{64}$/.test(a.hash));
check("a minted key looks like a key", looksLikeApiKey(a.key));
check("a short string is not a key", !looksLikeApiKey("wsk_short"));
check("a random string is not a key", !looksLikeApiKey("hunter2"));
check("the hash is the hash of the key", hashApiKey(a.key) === a.hash);
check("the right key matches its hash", hashMatches(hashApiKey(a.key), a.hash));
check("another key does not", !hashMatches(hashApiKey(b.key), a.hash));
check("a forged key does not", !hashMatches(hashApiKey(`${a.key}x`), a.hash));
check("an empty key does not", !hashMatches(hashApiKey(""), a.hash));
check("an empty hash does not match", !hashMatches(hashApiKey(a.key), ""));

// ---------- brand input ----------
const cleaned = cleanBrandInput({
  brandName: "  Pune Web Studio  ",
  logoUrl: "https://cdn.example.com/logo.png",
  supportEmail: "SUPPORT@Example.IN",
  primaryColor: "#B45309",
  hostname: "https://PuneWebStudio.in/path",
});
check("the brand name is trimmed", cleaned.brandName === "Pune Web Studio");
check("the logo URL is kept when it is http(s)", cleaned.logoUrl === "https://cdn.example.com/logo.png");
check("the support address is lower-cased", cleaned.supportEmail === "support@example.in");
check("the colour is lower-cased", cleaned.primaryColor === "#b45309");
check("a pasted URL becomes a hostname", cleaned.hostname === "punewebstudio.in");

const junk = cleanBrandInput({
  brandName: "x".repeat(200),
  logoUrl: "javascript:alert(1)",
  supportEmail: "not an email",
  primaryColor: "red",
  hostname: "not a host / with spaces",
});
check("the brand name is capped", (junk.brandName ?? "").length <= 60);
check("a non-http logo is dropped rather than rendered", junk.logoUrl === "");
check("an invalid support address is dropped", junk.supportEmail === "");
check("a named colour is not accepted as hex", junk.primaryColor === "");
check("a bad hostname is dropped", junk.hostname === "");

// ---------- site requests ----------
const empty = readSiteRequest({});
check("nothing is invented for a missing name", empty.name === "");
check("nothing is invented for a missing category", empty.category === "");
check("publishing defaults on", empty.publish === true);
const problems = siteRequestProblems(empty);
check("both required fields are named", problems.includes("name") && problems.includes("category"));
check("optional fields are not demanded", !problems.includes("phone") && !problems.includes("city"));

const full = readSiteRequest({
  name: " Smile Studio Dental ",
  category: "Dental Clinic",
  phone: "+91 98123 45678",
  ownerEmail: "Owner@SmileStudio.IN",
  apiRef: "client-1042",
  publish: false,
});
check("the name is trimmed", full.name === "Smile Studio Dental");
check("the owner address is normalised", full.ownerEmail === "owner@smilestudio.in");
check("publish:false is respected", full.publish === false);
check("a complete request has no problems", siteRequestProblems(full).length === 0);
check("a malformed email is named", siteRequestProblems(readSiteRequest({ name: "x", category: "y", ownerEmail: "nope" })).includes("ownerEmail"));
check("a malformed phone is named", siteRequestProblems(readSiteRequest({ name: "x", category: "y", phone: "12" })).includes("phone"));

// ---------- urls ----------
const ownDomain = siteUrls("acme-dental", "acme-dental.in", "https://app.example.com");
check("a connected domain is the public URL", ownDomain.url === "https://acme-dental.in");
const noDomain = siteUrls("acme-dental", null, "https://app.example.com");
check("without a domain the site lives under /s/", noDomain.url === "https://app.example.com/s/acme-dental");
const messy = siteUrls("acme-dental", "https://ACME.in/some/path", "https://app.example.com");
check("a messy domain is cleaned", messy.url === "https://acme.in");
check("the edit link is the dashboard", noDomain.editUrl === "https://app.example.com/dashboard");

// ---------- platform fallback ----------
check("the platform brand is not white-label", PLATFORM_BRAND.whiteLabel === false);
check("the platform brand has a name", PLATFORM_BRAND.name.length > 0);

console.log(`\nreseller: ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}

/**
 * Unit tests for phone-number normalisation, shared by SMS and WhatsApp.
 *
 *   node --experimental-strip-types tests/phone.test.mts
 *
 * Owners type their number however they like — with spaces, with a trunk zero,
 * with or without +91. httpSMS accepts only E.164 and rejects the rest, so this
 * is where a lead alert silently stops arriving. Anything ambiguous must return
 * empty rather than be guessed into a wrong recipient.
 */

import { toE164 } from "../src/lib/phone-format.ts";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function eq(name: string, actual: string, expected: string) {
  if (actual === expected) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    failures.push(`${name} — expected "${expected}", got "${actual}"`);
    console.log(`  FAIL ${name} — expected "${expected}", got "${actual}"`);
  }
}

console.log("toE164 — Indian mobile formats");
eq("plain ten digits", toE164("9876543210"), "+919876543210");
eq("spaced ten digits", toE164("98765 43210"), "+919876543210");
eq("dashed with country code", toE164("+91-98765-43210"), "+919876543210");
eq("trunk zero is dropped", toE164("09876543210"), "+919876543210");
eq("country code without plus", toE164("919876543210"), "+919876543210");
eq("already E.164 passes through", toE164("+919876543210"), "+919876543210");
eq("surrounding whitespace", toE164("  9876543210  "), "+919876543210");
eq("parentheses and dots", toE164("(98765).43210"), "+919876543210");

console.log("toE164 — other countries");
eq("explicit + keeps its own country code", toE164("+14155552671"), "+14155552671");
eq("UK number with +", toE164("+44 20 7946 0958"), "+442079460958");

console.log("toE164 — rejected");
eq("empty string", toE164(""), "");
eq("whitespace only", toE164("   "), "");
eq("letters only", toE164("call me"), "");
eq("too short to be a number", toE164("12345"), "");
eq("far too long", toE164("1234567890123456789"), "");
eq("plus with too few digits", toE164("+123"), "");

console.log("toE164 — the default country is configurable");
eq("ten digits with a US default", toE164("4155552671", "1"), "+14155552671");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}

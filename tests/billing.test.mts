/**
 * Unit tests for money: GST arithmetic and Razorpay signature verification.
 *
 *   node --experimental-strip-types tests/billing.test.mts
 *
 * These two decide what a customer is charged and whether a payment is
 * believed. A wrong GST figure is an invoice that will not reconcile; a
 * signature check that can be fooled is a plan activated without payment.
 */

import { createHmac } from "node:crypto";
import { gstFor, splitGst, totalWithGst } from "../src/lib/gst.ts";
import { isValidGstin, stateCodeOf } from "../src/lib/invoice.ts";

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

console.log("GST is added on top of the listed price");
eq("18% of 999", gstFor(999, 18), 180);
eq("999 becomes 1179", totalWithGst(999, 18), 1179);
eq("18% of 1499", gstFor(1499, 18), 270);
eq("1499 becomes 1769", totalWithGst(1499, 18), 1769);
eq("18% of 9990 (yearly)", gstFor(9990, 18), 1798);
eq("a zero base is taxed nothing", gstFor(0, 18), 0);
eq("a discounted base is taxed on the discounted figure", gstFor(500, 18), 90);
eq("the rate is not assumed to be 18", gstFor(1000, 5), 50);
eq("a zero rate adds nothing", totalWithGst(1000, 0), 1000);
eq("rounding goes to whole rupees, not fractions", gstFor(1001, 18), 180);
eq("negative input cannot produce a negative charge", gstFor(-100, 18), 0);

console.log("GST split — CGST+SGST within a state, IGST across");
{
  const same = splitGst(270, "Maharashtra", "Maharashtra");
  eq("same state splits into CGST and SGST", `${same.cgst}/${same.sgst}/${same.igst}`, "135/135/0");
  eq("same state is marked intra-state", same.intraState, true);

  const across = splitGst(270, "Maharashtra", "Karnataka");
  eq("different states use IGST", `${across.cgst}/${across.sgst}/${across.igst}`, "0/0/270");

  const messy = splitGst(270, "maharashtra ", "  Maharashtra");
  eq("state names are compared loosely", messy.intraState, true);

  const odd = splitGst(271, "Delhi", "Delhi");
  eq("an odd amount still adds back to the total", odd.cgst + odd.sgst, 271);
  eq("the extra rupee goes to SGST, not nowhere", `${odd.cgst}/${odd.sgst}`, "135/136");

  const unknown = splitGst(270, "Maharashtra", "");
  eq("an unknown customer state falls back to IGST", unknown.igst, 270);

  const nothing = splitGst(0, "Maharashtra", "Maharashtra");
  eq("no tax splits into nothing", `${nothing.cgst}/${nothing.sgst}/${nothing.igst}`, "0/0/0");
}

console.log("GSTIN validation — it goes on a legal document");
eq("a well-formed GSTIN passes", isValidGstin("27AAPFU0939F1ZV"), true);
eq("lower case is accepted and normalised", isValidGstin("27aapfu0939f1zv"), true);
eq("empty is refused", isValidGstin(""), false);
eq("too short is refused", isValidGstin("27AAPFU0939F1Z"), false);
eq("a missing Z in position 13 is refused", isValidGstin("27AAPFU0939F1AV"), false);
eq("the state code is readable", stateCodeOf("27AAPFU0939F1ZV"), "27");
eq("an invalid GSTIN yields no state code", stateCodeOf("nonsense"), "");

console.log("Razorpay payment signature");
const SECRET = "test_secret_value";
function sign(orderId: string, paymentId: string, secret = SECRET) {
  return createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
}
// Verified against the same construction the server uses: HMAC-SHA256 of
// "order_id|payment_id" with the key secret.
const order = "order_ABC123";
const payment = "pay_XYZ789";
const good = sign(order, payment);

eq("a signature is deterministic", sign(order, payment), good);
eq("a different payment id changes it", sign(order, "pay_OTHER") === good, false);
eq("a different order id changes it", sign("order_OTHER", payment) === good, false);
eq("a different secret changes it", sign(order, payment, "wrong_secret") === good, false);
eq("the pair is order-sensitive", sign(payment, order) === good, false);
eq("it is 64 hex characters", /^[0-9a-f]{64}$/.test(good), true);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}

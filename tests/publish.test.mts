/**
 * Unit tests for the rules that decide whether a website can go public.
 *
 *   node --experimental-strip-types tests/publish.test.mts
 *
 * These rules used to live inside POST /api/website/publish only, and the
 * onboarding wizard did not know them: it wrote every new business as a DRAFT
 * and said "Your website is ready". Three of the three trial customers on the
 * live system were sitting on complete, publishable sites that had never been
 * public, with the trial running out underneath them.
 *
 * Both callers now read the rules from one module, so what follows is the
 * single definition of "ready" for the whole product.
 */

import { canPublish, publishBlockers, MIN_VISIBLE_SECTIONS } from "../src/lib/publish-rules.ts";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const complete = { name: "Sharma Electricals", phone: "+91 98220 11223", address: "Shop 4, MG Road", city: "Pune" };
const site = { seoTitle: "Sharma Electricals — Electrician in Pune", visibleSections: 6 };

console.log("Ready to publish");

{
  check("a complete business publishes", canPublish(complete, site));
  check("and reports nothing missing", publishBlockers(complete, site).length === 0);
}

console.log("\nEach thing that holds a site back");

{
  const b = publishBlockers({ ...complete, name: "" }, site);
  check("no business name blocks it", b.length === 1 && /name/i.test(b[0]));
}

{
  const b = publishBlockers({ ...complete, phone: "" }, site);
  check("no phone number blocks it", b.length === 1 && /phone/i.test(b[0]));
}

{
  // The gap that caused the bug: the wizard asks for these but does not
  // require them, while publishing does.
  const b = publishBlockers({ ...complete, address: "" }, site);
  check("no address blocks it", b.length === 1 && /address/i.test(b[0]));

  const c = publishBlockers({ ...complete, city: "" }, site);
  check("no city blocks it", c.length === 1 && /address/i.test(c[0]));
}

{
  const b = publishBlockers(complete, { ...site, seoTitle: "" });
  check("no SEO title blocks it", b.length === 1 && /seo/i.test(b[0]));
}

{
  const b = publishBlockers(complete, { ...site, visibleSections: MIN_VISIBLE_SECTIONS - 1 });
  check("too few visible sections blocks it", b.length === 1 && /sections/i.test(b[0]));

  const c = publishBlockers(complete, { ...site, visibleSections: MIN_VISIBLE_SECTIONS });
  check("exactly the minimum is enough", c.length === 0);
}

console.log("\nWhitespace is not a value");

{
  // A form that submits " " must not pass a check that only tests for "".
  check("a blank name is still missing", !canPublish({ ...complete, name: "   " }, site));
  check("a blank address is still missing", !canPublish({ ...complete, address: "  " }, site));
  check("a blank SEO title is still missing", !canPublish(complete, { ...site, seoTitle: " " }));
}

console.log("\nEverything at once");

{
  const b = publishBlockers(
    { name: "", phone: "", address: "", city: "" },
    { seoTitle: "", visibleSections: 0 },
  );
  check("an empty business reports every reason", b.length === 5, `got ${b.length}: ${b.join(" | ")}`);
}

console.log("\n" + "=".repeat(60));
console.log(`passed ${passed}   failed ${failed}`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}

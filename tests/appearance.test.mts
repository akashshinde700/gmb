/**
 * Unit tests for the design-change allowance and the starter content that a
 * new website is created with.
 *
 *   node --experimental-strip-types tests/appearance.test.mts
 *
 * The allowance decides when a customer is told to pay, so every branch of it
 * is pinned down here — an off-by-one either gives the feature away or blocks a
 * paying customer.
 */

import { allowanceFor, type BusinessAllowanceRow } from "../src/lib/appearance-rules.ts";
import { starterFaqs, starterPosts } from "../src/lib/starter-content.ts";

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

function section(title: string) {
  console.log(`\n== ${title}`);
}

const PAID = { maxThemeChanges: -1, priceMonthly: 499, priceYearly: 4990 };
const QUOTED = { maxThemeChanges: -1, priceMonthly: 0, priceYearly: 0 }; // Enterprise: priced per customer

function row(used: number, sub: BusinessAllowanceRow["subscription"]): BusinessAllowanceRow {
  return { themeChangesUsed: used, subscription: sub };
}

// ---------------------------------------------------------------- allowance

section("Allowance — unlimited by default");

{
  const a = allowanceFor(row(0, { status: "TRIALING", plan: PAID }));
  check("a trial restyles without a limit", a.unlimited && a.canChange && a.limit === -1);
}

{
  const a = allowanceFor(row(99, { status: "TRIALING", plan: PAID }));
  check("a heavily used trial is never locked out", a.canChange && a.remaining === -1);
}

{
  const a = allowanceFor(row(0, null));
  check("no subscription at all is still unlimited", a.unlimited && a.canChange);
}

{
  const a = allowanceFor(row(4, { status: "ACTIVE", plan: QUOTED }));
  check("a quote-only plan (Enterprise) restyles freely", a.unlimited && a.canChange);
}

{
  const a = allowanceFor(row(5, { status: "EXPIRED", plan: PAID }));
  check("an expired plan does not bring the old cap back", a.unlimited && a.canChange);
}

{
  const a = allowanceFor(row(50, { status: "ACTIVE", plan: PAID }));
  check("unlimited reports -1, which survives JSON", a.remaining === -1 && a.limit === -1);
  check("JSON keeps the value (no Infinity)", JSON.parse(JSON.stringify(a)).remaining === -1);
}

section("Allowance — explicit admin plan limits still apply");

{
  const a = allowanceFor(row(2, { status: "ACTIVE", plan: { ...PAID, maxThemeChanges: 10 } }));
  check("an explicit plan limit is honoured", !a.unlimited && a.limit === 10 && a.remaining === 8);
}

{
  const a = allowanceFor(row(0, { status: "ACTIVE", plan: { ...PAID, maxThemeChanges: 0 } }));
  check("a plan limit of zero blocks every change", !a.canChange && a.remaining === 0);
}

{
  const a = allowanceFor(row(99, { status: "TRIALING", plan: { ...QUOTED, maxThemeChanges: 3 } }));
  check("remaining never goes negative", a.remaining === 0 && !a.canChange);
}

// ---------------------------------------------------------- starter content

const INPUT = {
  name: "Sharma Electricals",
  category: "Electrician",
  city: "Pune",
  phone: "9876543210",
  services: ["House wiring", "Fan installation"],
};

section("Starter FAQs");

{
  const faqs = starterFaqs(INPUT);
  check("a new site gets FAQs to edit", faqs.length >= 5);
  check("every FAQ has a question and an answer", faqs.every((f) => f.question.length > 0 && f.answer.length > 0));
  check("sort order starts at 1 and increments", faqs.every((f, i) => f.sortOrder === i + 1));
  check("the business name is used", faqs[0].question.includes("Sharma Electricals"));
  check("the services entered in the wizard are listed", faqs[0].answer.includes("House wiring"));
  check("the phone number reaches the pricing answer", faqs.some((f) => f.answer.includes("9876543210")));
}

{
  const faqs = starterFaqs({ ...INPUT, city: "", phone: "", services: [] });
  check("a business with no city still gets usable FAQs", faqs.length >= 5 && faqs.every((f) => f.answer.length > 0));
  check("no phone means no dangling 'call us on'", faqs.every((f) => !f.answer.includes("Call or WhatsApp us on  ")));
}

{
  const ai = {
    faqs: [
      { question: "Do you work on Sundays?", answer: "Yes, for emergencies." },
      { question: "Do you give a warranty?", answer: "One year on all wiring." },
      { question: "Which areas do you cover?", answer: "All of Pune city." },
    ],
  };
  const faqs = starterFaqs({ ...INPUT, ai });
  check("AI answers are used when generation ran", faqs.length === 3 && faqs[0].question === "Do you work on Sundays?");
  check("AI answers are still ordered", faqs.map((f) => f.sortOrder).join(",") === "1,2,3");
}

{
  const ai = { faqs: [{ question: " ", answer: "" }, { question: "Only one?", answer: "Yes." }] };
  const faqs = starterFaqs({ ...INPUT, ai });
  check("a thin or empty AI response falls back to the template", faqs.length >= 5);
}

{
  const long = "q".repeat(500);
  const ai = {
    faqs: [
      { question: long, answer: "a".repeat(5000) },
      { question: "Two?", answer: "Yes." },
      { question: "Three?", answer: "Yes." },
    ],
  };
  const faqs = starterFaqs({ ...INPUT, ai });
  check("an over-long AI question is trimmed", faqs[0].question.length === 300);
  check("an over-long AI answer is trimmed", faqs[0].answer.length === 2000);
}

section("Starter blog posts");

{
  const posts = starterPosts(INPUT);
  check("two draft posts are created", posts.length === 2);
  check("slugs are url safe", posts.every((p) => /^[a-z0-9-]+$/.test(p.slug)));
  check("slugs are unique within the business", new Set(posts.map((p) => p.slug)).size === posts.length);
  check("every post has a title, excerpt and body", posts.every((p) => p.title && p.excerpt && p.content.length > 200));
  check("the city is used in the first post", posts[0].title.includes("Pune"));
  check("the first service is used in the second post", posts[1].title.includes("House wiring"));
}

{
  const posts = starterPosts({ ...INPUT, city: "", services: [] });
  check("no city still produces a readable title", posts[0].title.includes("your city"));
  check("no services still produces a second post", posts[1].title.length > 10 && /^[a-z0-9-]+$/.test(posts[1].slug));
}

{
  const posts = starterPosts({ ...INPUT, name: "Café & Co. — Pune!" });
  check("punctuation in the business name cannot break the slug", posts.every((p) => /^[a-z0-9-]+$/.test(p.slug)));
}

// ------------------------------------------------------------------ summary

console.log(`\n${"=".repeat(60)}`);
console.log(`passed ${passed}   failed ${failed}`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed ? 1 : 0);

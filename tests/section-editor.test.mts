/**
 * Every section type must have somewhere to edit it.
 *
 *   node --experimental-strip-types tests/section-editor.test.mts
 *
 * The builder's SectionEditor is a chain of `section.type === "..."` branches
 * with no fallback. A type missing from every branch does not error — it renders
 * a heading, a Save button, and nothing in between. That is what happened to the
 * Blog section: created with a title and a subtitle, rendered with both, and no
 * way to change either.
 *
 * This reads the two files as text rather than importing them (the editor is a
 * React component in a 3,700-line client module). Crude, and it catches exactly
 * the failure that shipped: a section type that no branch names.
 */

import { readFileSync } from "node:fs";
import { SECTION_LIBRARY } from "../src/lib/sections.ts";

const editor = readFileSync("src/components/views/dashboard-view.tsx", "utf8");

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

/** Does the SectionEditor name this type in a branch of its own or in a list? */
function editorHandles(type: string): boolean {
  // `{section.type === "faq" && (` — a branch of its own.
  //
  // Matched with the `&&` deliberately. A plain substring search also matches
  // `section.type === "blog" ? (...)`, a ternary INSIDE another branch used to
  // vary a hint — which renders no fields. Written loosely, this test passed
  // for a section whose editor was blank, which is the one thing it exists to
  // catch.
  if (editor.includes(`section.type === "${type}" && (`)) return true;
  // `["services", "products", ...].includes(section.type)` — a shared branch.
  for (const m of editor.matchAll(/\[([^\]]*)\]\.includes\(section\.type\)/g)) {
    if (m[1].includes(`"${type}"`)) return true;
  }
  return false;
}

console.log("Every section in the library can be edited");

for (const { type, name } of SECTION_LIBRARY) {
  check(`${name} (${type})`, editorHandles(type), "no branch in SectionEditor — its editor would be blank");
}

console.log("\nThe check itself works");

{
  // If this ever passes, the test above is not testing anything.
  check(
    "a type nobody has implemented is reported as unhandled",
    !editorHandles("definitely-not-a-real-section-type"),
  );
}

console.log("\n" + "=".repeat(60));
console.log(`passed ${passed}   failed ${failed}`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}

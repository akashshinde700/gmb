/**
 * Unit tests for the freeform editor's document model.
 *
 *   node --experimental-strip-types --import ./tests/path-alias.mjs tests/editor.test.mts
 *
 * The interesting promises are the ones a person notices the moment they are
 * broken: undo really brings the old page back, a drag never duplicates or
 * loses a section, clearing a field removes it rather than storing an empty
 * string (the generator's fallbacks only work when the key is gone), and the
 * undo stack does not turn one typed sentence into forty presses. Plus the one
 * that keeps the whole editor honest: every content key a section actually
 * renders must be a key the editor offers.
 */

import { readFileSync } from "node:fs";
import { SECTION_LIBRARY } from "@/lib/sections";
import { SECTION_FIELDS } from "@/lib/section-fields";
import { readSectionStyle, styleAttributes, withSectionStyle } from "@/lib/section-style";
import {
  addItem, addSection, docSignature, duplicateSection, EditorHistory, moveItem, moveSection,
  moveSectionBefore, removeItem, removeSection, setField, setItem, setStyle, summarizeChanges,
  toggleVisible, typeLabel, type EditorDoc,
} from "@/lib/editor";
import type { SectionType, SiteSection } from "@/lib/types";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const section = (id: string, type: SectionType, content: Record<string, unknown> = {}, visible = true): SiteSection =>
  ({ id, type, visible, content });

const doc = (...sections: SiteSection[]): EditorDoc => ({ sections });

// ---------- field edits ----------
const hero = doc(section("a", "hero", { heading: "Old", subheading: "Sub" }), section("b", "about", { title: "About" }));

const renamed = setField(hero, "a", "heading", "New");
check("a field is set", renamed.sections[0].content.heading === "New");
check("the original document is untouched", hero.sections[0].content.heading === "Old");
check("other sections are untouched", renamed.sections[1].content.title === "About");
check("other keys survive", renamed.sections[0].content.subheading === "Sub");

const cleared = setField(renamed, "a", "heading", "");
check("clearing removes the key", !("heading" in cleared.sections[0].content));
const long = setField(hero, "a", "heading", "x".repeat(5000));
check("a pasted novel is capped", String(long.sections[0].content.heading).length <= 2000);
check("a wrong id changes nothing", docSignature(setField(hero, "nope", "heading", "X")) === docSignature(hero));

// ---------- rows ----------
const faq = doc(section("f", "faq", { items: [{ question: "Q1", answer: "A1" }] }));
const withRow = addItem(faq, "f", "items");
check("a row is added", (withRow.sections[0].content.items as unknown[]).length === 2);
const filled = setItem(withRow, "f", "items", 1, "question", "Q2");
check("a row field is set", (filled.sections[0].content.items as { question?: string }[])[1].question === "Q2");
check("the first row is untouched", (filled.sections[0].content.items as { question?: string }[])[0].question === "Q1");
const blanked = setItem(filled, "f", "items", 1, "question", "");
check("clearing a row field removes it", !("question" in (blanked.sections[0].content.items as Record<string, unknown>[])[1]));

const two = doc(section("f", "faq", { items: [{ question: "A" }, { question: "B" }, { question: "C" }] }));
const moved = moveItem(two, "f", "items", 0, 2);
check("rows reorder", JSON.stringify((moved.sections[0].content.items as { question: string }[]).map((r) => r.question)) === '["B","C","A"]');
check("reordering keeps the count", (moved.sections[0].content.items as unknown[]).length === 3);
const removed = removeItem(two, "f", "items", 1);
check("a row is removed", (removed.sections[0].content.items as unknown[]).length === 2);
const emptied = removeItem(doc(section("f", "faq", { items: [{ question: "only" }] })), "f", "items", 0);
check("removing the last row drops the key", !("items" in emptied.sections[0].content));
const capped = addItem(doc(section("f", "faq", { items: new Array(12).fill({ q: "x" }) })), "f", "items", 12);
check("rows are capped", (capped.sections[0].content.items as unknown[]).length === 12);

// ---------- section order and lifecycle ----------
const page = doc(section("1", "hero"), section("2", "services"), section("3", "faq"), section("4", "contact"));
const up = moveSection(page, "3", 1);
check("a section moves", up.sections.map((s) => s.id).join("") === "1324");
check("moving does not duplicate", new Set(up.sections.map((s) => s.id)).size === 4);
check("moving does not lose anything", up.sections.length === 4);
check("an out-of-range move clamps", moveSection(page, "1", 99).sections.map((s) => s.id).join("") === "2341");
check("dragging onto itself is a no-op", docSignature(moveSectionBefore(page, "2", "2")) === docSignature(page));
check("dragging down lands before the target", moveSectionBefore(page, "1", "4").sections.map((s) => s.id).join("") === "2314");
check("dragging up lands before the target", moveSectionBefore(page, "4", "2").sections.map((s) => s.id).join("") === "1423");

const hidden = toggleVisible(page, "2");
check("a section can be hidden", hidden.sections[1].visible === false);
check("hiding twice shows it again", toggleVisible(hidden, "2").sections[1].visible === true);
check("a removed section is gone", removeSection(page, "2").sections.map((s) => s.id).join("") === "134");

const dup = duplicateSection(page, "2");
check("duplicating adds one", dup.sections.length === 5);
check("the copy sits next to the original", dup.sections[1].type === "services" && dup.sections[2].type === "services");
check("the copy has its own id", dup.sections[1].id !== dup.sections[2].id);
check("the copy has its own content object", dup.sections[1].content !== dup.sections[2].content);

const added = addSection(page, "gallery", "2");
check("a section is added after the selected one", added.sections.map((s) => s.type).join(",") === "hero,services,gallery,faq,contact");
check("an added section starts with a heading", String(added.sections[2].content.title).length > 0);
check("an added section is visible", added.sections[2].visible === true);
check("an unknown type is refused", docSignature(addSection(page, "nonsense" as SectionType)) === docSignature(page));
check("a section lands at the end without a selection", addSection(page, "faq").sections[4].type === "faq");

// ---------- style ----------
const styled = setStyle(page, "2", "bg", "dark");
check("a style is stored inside content", readSectionStyle(styled.sections[1]).bg === "dark");
check("styling does not disturb the content", Object.keys(styled.sections[1].content).length === 1);
check("a style attribute is emitted", styleAttributes(readSectionStyle(styled.sections[1]))["data-ws-bg"] === "dark");
check("defaults are not emitted", Object.keys(styleAttributes(readSectionStyle(setStyle(page, "2", "bg", "inherit")))).length === 0);
const two_ = setStyle(styled, "2", "cols", 3);
check("two styles coexist", readSectionStyle(two_.sections[1]).bg === "dark" && readSectionStyle(two_.sections[1]).cols === 3);
const reset = setStyle(two_, "2", "cols", undefined);
check("clearing one style keeps the others", readSectionStyle(reset.sections[1]).bg === "dark" && readSectionStyle(reset.sections[1]).cols === undefined);
check("clearing the last style drops the key", !("__style" in setStyle(styled, "2", "bg", "inherit").sections[1].content));
const junk = withSectionStyle(section("x", "hero", { __style: { bg: "neon", pad: 12 } }), "align", "center");
check("an unknown stored value is ignored", readSectionStyle(junk).bg === undefined);
check("a valid value next to junk survives", readSectionStyle(junk).align === "center");
check("text edits keep the style", readSectionStyle(setField(styled, "2", "title", "Our Services").sections[1]).bg === "dark");

// ---------- change summary ----------
const summary = summarizeChanges(page, setField(moveSection(page, "4", 0), "1", "heading", "Hi"));
check("the summary names an edited section", summary.some((line) => line.startsWith("Hero")), summary.join(" | "));
check("the summary notices the new order", summary.includes("Page order changed"), summary.join(" | "));
check("the summary notices an added section", summarizeChanges(page, addSection(page, "faq")).some((l) => l.endsWith("added")));
check("the summary notices a removal", summarizeChanges(page, removeSection(page, "3")).some((l) => l.endsWith("removed")));
check("the summary notices a style", summarizeChanges(page, setStyle(page, "2", "bg", "dark")).some((l) => l.includes("style")));
check("the summary notices hiding", summarizeChanges(page, toggleVisible(page, "2")).some((l) => l.endsWith("hidden")));
check("an unchanged document summarises to nothing", summarizeChanges(page, page).length === 0);

// ---------- history ----------
const history = new EditorHistory(page);
const step1 = setField(page, "1", "heading", "One");
history.push(step1, "Headline edited");
const step2 = addSection(step1, "faq");
history.push(step2, "Added section");
check("undo goes back one step", docSignature(history.undo()) === docSignature(step1));
check("undo again reaches the start", docSignature(history.undo()) === docSignature(page));
check("undo stops at the start", history.canUndo === false && docSignature(history.undo()) === docSignature(page));
check("redo moves forward", docSignature(history.redo()) === docSignature(step1));
check("redo reaches the end", docSignature(history.redo()) === docSignature(step2));
check("redo stops at the end", history.canRedo === false);

const branch = new EditorHistory(page);
branch.push(setField(page, "1", "heading", "A"), "A");
branch.push(setField(setField(page, "1", "heading", "A"), "2", "title", "B"), "B");
branch.undo();
const branched = branch.push(setField(page, "1", "heading", "C"), "C");
check("a new edit after undo drops the redo tail", branch.canRedo === false);
check("the branch is what is shown", branched.sections[0].content.heading === "C");

const typing = new EditorHistory(page);
typing.pushCoalesced(setField(page, "1", "heading", "H"), "Headline edited", "a:heading", 1000);
typing.pushCoalesced(setField(setField(page, "1", "heading", "H"), "1", "heading", "He"), "Headline edited", "a:heading", 1200);
typing.pushCoalesced(setField(setField(page, "1", "heading", "H"), "1", "heading", "Hel"), "Headline edited", "a:heading", 1400);
check("typing one sentence is one undo step", typing.depth === 2, String(typing.depth));
check("undoing it goes back to the original", docSignature(typing.undo()) === docSignature(page));
typing.redo();
typing.pushCoalesced(setField(page, "1", "heading", "X"), "Headline edited", "a:subheading", 1500);
check("a different field is a new step", typing.depth === 3, String(typing.depth));

const saved = new EditorHistory(page);
saved.push(setField(page, "1", "heading", "One"), "edit");
saved.markSaved();
check("after a save there is nothing to undo", saved.canUndo === false);
check("the saved document is what is current", saved.current.sections[0].content.heading === "One");

const cappedHistory = new EditorHistory(page, 3);
for (let i = 0; i < 10; i++) cappedHistory.push(setField(cappedHistory.current, "1", "heading", `v${i}`), `edit ${i}`);
check("the stack is capped", cappedHistory.depth === 3, String(cappedHistory.depth));

// ---------- the editor offers every field a section renders ----------
const source = readFileSync("src/components/site/sections.tsx", "utf8");
const COMPONENT_TYPE: Record<string, SectionType> = {
  Hero: "hero", Stats: "stats", About: "about", Services: "services", Products: "products",
  WhyUs: "whyUs", Gallery: "gallery", Testimonials: "testimonials", FaqSection: "faq",
  BlogTeaser: "blog", CtaBanner: "cta", Payment: "payment", Hours: "hours", Contact: "contact",
};
const starts = [...source.matchAll(/function (\w+)\(/g)].map((m) => ({ name: m[1], at: m.index ?? 0 }));
starts.push({ name: "END", at: source.length });
const uneditable: string[] = [];
for (let i = 0; i < starts.length - 1; i++) {
  const type = COMPONENT_TYPE[starts[i].name];
  if (!type) continue;
  const body = source.slice(starts[i].at, starts[i + 1].at);
  // The cast can nest (items?: { question, answer }[]), so read it with a brace
  // counter rather than a regex that stops at the first `}`.
  const start = body.indexOf("section.content as {");
  if (start < 0) continue;
  let depth = 0;
  let end = start + "section.content as {".length;
  for (let i = end - 1; i < body.length; i++) {
    if (body[i] === "{") depth++;
    else if (body[i] === "}") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  // Only the top level of the cast: keys inside `items?: { … }[]` are the row
  // fields, and the schema describes those under the `items` field itself.
  const castText = body.slice(start + "section.content as {".length, end);
  const top = castText.replace(/\{[^}]*\}/g, "");
  const keys = [...top.matchAll(/(\w+)\??:/g)].map((m) => m[1]);
  if (/items\??:/.test(castText)) keys.push("items");
  const offered = new Set(SECTION_FIELDS[type].map((f) => f.key));
  for (const key of keys) if (!offered.has(key)) uneditable.push(`${type}.${key}`);
}
check("every content key a section renders is editable", uneditable.length === 0, uneditable.join(", "));

const uncovered: string[] = [];
for (const lib of SECTION_LIBRARY) {
  const fields = SECTION_FIELDS[lib.type];
  if (!fields || fields.length === 0) uncovered.push(lib.type);
  if (fields?.some((f) => f.kind === "items") && !fields.some((f) => f.kind === "items" && f.itemFields?.length)) {
    uncovered.push(`${lib.type}.items`);
  }
}
check("every section type has editable fields", uncovered.length === 0, uncovered.join(", "));
check("every section type has a readable name", SECTION_LIBRARY.every((lib) => typeLabel(lib.type) === lib.name));

console.log(`\neditor: ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}

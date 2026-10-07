/**
 * Unit tests for per-visit tracking.
 *
 *   node --experimental-strip-types --import ./tests/path-alias.mjs tests/visits.test.mts
 *
 * The promise: everything one person does in one sitting carries the same id,
 * a visit ends after half an hour of quiet, and the dashboard can tell which
 * visit produced an enquiry — without inventing a story for pages that never
 * carried an id.
 */

import { VISIT_WINDOW_MS, distinctVisits, isVisitId, nextVisit, visitIdsOf, visitSummaries } from "@/lib/visits";

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) passed++;
  else {
    failed++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const t = (seconds: number) => new Date(1_700_000_000_000 + seconds * 1000);
const row = (type: string, seconds: number, ids: { visitor?: string; visit?: string; leadId?: string } = {}, path = "/") => ({
  type,
  meta: JSON.stringify(ids),
  path,
  createdAt: t(seconds),
});

console.log("\n== What counts as a visit id");
{
  check("a browser-generated id is accepted", isVisitId("s9k2m4x1abcdefgh"));
  check("empty, short and oversized values are not",
    !isVisitId("") && !isVisitId("abc") && !isVisitId("x".repeat(41)) && !isVisitId(null) && !isVisitId(42));
  check("whitespace and punctuation are not", !isVisitId("abc def ghij") && !isVisitId("<script>alert(1)</script>"));
}

console.log("\n== When a visit ends");
{
  const now = 1_700_000_000_000;
  const fresh = nextVisit(null, now, "snew12345678");
  check("a first action starts a visit", fresh.isNew && fresh.id === "snew12345678");

  const kept = nextVisit({ id: fresh.id, at: now }, now + 10 * 60 * 1000, "sneverused123");
  check("ten minutes later it is the same visit", !kept.isNew && kept.id === fresh.id);

  const last = nextVisit({ id: fresh.id, at: now }, now + VISIT_WINDOW_MS, "sneverused123");
  check("exactly on the window it still counts", !last.isNew);

  const expired = nextVisit({ id: fresh.id, at: now }, now + VISIT_WINDOW_MS + 1, "slater12345678");
  check("past the window the visitor gets a new visit", expired.isNew && expired.id === "slater12345678");

  const backwards = nextVisit({ id: fresh.id, at: now + 60 * 60 * 1000 }, now, "sneverused123");
  check("a clock that moved backwards does not split the visit", !backwards.isNew);

  const broken = nextVisit({ id: "!!!", at: Number.NaN }, now, "sfallback12345");
  check("a corrupted stored value is replaced, not trusted", broken.isNew && broken.id === "sfallback12345");
}

console.log("\n== Reading a visit back");
{
  const rows = [
    row("VISIT", 0, { visitor: "v1111111111", visit: "svisit000011" }),
    row("CTA_WHATSAPP", 120, { visitor: "v1111111111", visit: "svisit000011" }),
    row("FORM_SUBMIT", 300, { visitor: "v1111111111", visit: "svisit000011", leadId: "lead_1" }, "/contact"),
    row("VISIT", 400, { visitor: "v2222222222", visit: "svisit000022" }, "/gallery"),
    row("CTA_CALL", 1000), // an old page, no ids at all
  ];
  const report = visitSummaries(rows);
  check("one line per visit, newest first",
    report.visits.length === 2 && report.visits[0].id === "svisit000022",
    report.visits.map((v) => v.id).join(", "));
  check("actions are in the order they happened",
    report.visits[1].actions.map((a) => a.type).join(" > ") === "VISIT > CTA_WHATSAPP > FORM_SUBMIT",
    report.visits[1].actions.map((a) => a.type).join(" > "));
  check("the enquiry is attributed to the visit that produced it",
    report.visits[1].converted && report.visits[1].leadId === "lead_1");
  check("the visit that only looked is not a conversion", !report.visits[0].converted && !report.visits[0].leadId);
  check("the visit's own first and last times are kept",
    new Date(report.visits[1].first).getTime() === t(0).getTime() &&
    new Date(report.visits[1].last).getTime() === t(300).getTime());
  check("the last page of the visit is remembered", report.visits[1].path === "/contact");

  check("actions with no visit id are counted, not invented into a visit",
    report.untracked === 1 && report.visits.length === 2);
  check("the conversion count is a count of visits", report.converted === 1);

  const many = visitSummaries([...Array(60)].map((_, i) => row("VISIT", i, { visit: `svisitf${String(i).padStart(5, "0")}` })), 10);
  check("a busy day is capped rather than returned whole", many.visits.length === 10);

  check("malformed meta never throws", (() => {
    try {
      visitIdsOf("{not json");
      return visitSummaries([{ type: "VISIT", meta: "[[[", path: "/", createdAt: t(0) }]).untracked === 1;
    } catch {
      return false;
    }
  })());

  const unique = distinctVisits([
    row("VISIT", 0, { visit: "svA" + "0".repeat(10) }),
    row("FORM_SUBMIT", 1, { visit: "svA" + "0".repeat(10) }),
    row("VISIT", 2, { visit: "svB" + "0".repeat(10) }),
    row("CTA_CALL", 3, { visit: "svC" + "0".repeat(10) }),
    row("VISIT", 4),
  ]);
  check("unique visits counts visits, not actions", unique === 2, String(unique));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

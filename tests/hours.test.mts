/**
 * Unit tests for the opening-hours parser behind the "Open now" badge.
 *
 *   node --experimental-strip-types tests/hours.test.mts
 *
 * The badge makes a claim to the public, so the parsing is pinned down here:
 * unreadable hours must report "unknown" and render nothing, never a guess.
 */

import { openStatus, parseDayWindow, isToday } from "../src/lib/hours.ts";

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

/** A Wednesday at the given local time. */
function wed(hour: number, minute = 0): Date {
  return new Date(2026, 8, 9, hour, minute, 0); // 9 Sep 2026 is a Wednesday
}

const WEEK = {
  Monday: "9:00 AM – 7:00 PM",
  Tuesday: "9:00 AM – 7:00 PM",
  Wednesday: "9:00 AM – 7:00 PM",
  Thursday: "9:00 AM – 7:00 PM",
  Friday: "9:00 AM – 7:00 PM",
  Saturday: "10:00 AM – 2:00 PM",
  Sunday: "Closed",
};

section("Parsing a day");
check("reads a 12-hour range", JSON.stringify(parseDayWindow("9:00 AM – 7:00 PM")) === JSON.stringify({ opens: 540, closes: 1140 }));
check("reads a plain dash", JSON.stringify(parseDayWindow("9 AM - 7 PM")) === JSON.stringify({ opens: 540, closes: 1140 }));
check("reads a 24-hour range", JSON.stringify(parseDayWindow("09:00 to 19:30")) === JSON.stringify({ opens: 540, closes: 1170 }));
check("understands closed", parseDayWindow("Closed") === "closed");
check("understands 24 hours", JSON.stringify(parseDayWindow("24 hours")) === JSON.stringify({ opens: 0, closes: 1440 }));
check("rolls past midnight", JSON.stringify(parseDayWindow("6 PM – 1 AM")) === JSON.stringify({ opens: 1080, closes: 1500 }));
check("gives up on nonsense rather than guessing", parseDayWindow("whenever we feel like it") === null);
check("gives up on an empty value", parseDayWindow("") === null);
check("gives up on a non-string", parseDayWindow(42) === null);

section("Open / closed");
const during = openStatus(WEEK, wed(11));
check("open during business hours", during.state === "open", during.label);
check("states the closing time", during.detail.includes("7 PM"), during.detail);

const beforeOpening = openStatus(WEEK, wed(7));
check("closed before opening", beforeOpening.state === "closed", beforeOpening.label);
check("says when it opens today", beforeOpening.label.startsWith("Opens"), beforeOpening.label);

const afterClosing = openStatus(WEEK, wed(21));
check("closed after closing", afterClosing.state === "closed", afterClosing.label);
check("points at the next open day", afterClosing.detail.includes("tomorrow"), afterClosing.detail);

const closingSoon = openStatus(WEEK, wed(18, 30));
check("warns when closing within the hour", closingSoon.label === "Closing soon", closingSoon.label);

// Sunday 10:00 — shut all day; the next opening is Monday, i.e. tomorrow.
const sunday = openStatus(WEEK, new Date(2026, 8, 13, 10, 0, 0));
check("a closed day looks ahead to the next open day",
  sunday.state === "closed" && sunday.detail.includes("tomorrow"), sunday.detail);

// Friday evening with the weekend shut: the next opening is named by weekday.
const weekendShut = { ...WEEK, Saturday: "Closed" };
const fridayNight = openStatus(weekendShut, new Date(2026, 8, 11, 22, 0, 0));
check("a multi-day gap names the weekday it reopens",
  fridayNight.detail.includes("Monday"), fridayNight.detail);

section("Unknown hours");
const unknown = openStatus({ Monday: "ring us", Tuesday: "" }, wed(11));
check("unreadable hours report unknown", unknown.state === "unknown", unknown.state);
check("unknown hours render no label", unknown.label === "" && unknown.detail === "");
check("missing hours report unknown", openStatus(undefined, wed(11)).state === "unknown");
check("an empty object reports unknown", openStatus({}, wed(11)).state === "unknown");

section("Short day keys");
const shortKeys = { mon: "9 AM - 6 PM", tue: "9 AM - 6 PM", wed: "9 AM - 6 PM", thu: "9 AM - 6 PM", fri: "9 AM - 6 PM", sat: "Closed", sun: "Closed" };
check("three-letter keys are understood", openStatus(shortKeys, wed(11)).state === "open");
check("today is matched by index, not by locale text", isToday("wed", wed(11)) && !isToday("mon", wed(11)));
check("full day names still match", isToday("Wednesday", wed(11)));

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed ? 1 : 0);

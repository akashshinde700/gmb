// WebSetu — opening-hours parsing for tenant websites.
//
// "Open now" is the single most useful thing a local business page can tell a
// visitor, and it is derived entirely from the hours the owner already entered —
// nothing here invents availability.

export interface DayWindow {
  /** Minutes from midnight. */
  opens: number;
  closes: number;
}

export type OpenState = "open" | "closed" | "unknown";

export interface OpenStatus {
  state: OpenState;
  /** Short label for a badge: "Open now", "Closed", "Opens 9:00 AM". */
  label: string;
  /** Longer sentence for the hours section. */
  detail: string;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const DAY_ALIASES: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

/** Index 0-6 (Sunday-first) for a stored hours key, or null if unrecognised. */
export function dayIndexForKey(key: string): number | null {
  const index = DAY_ALIASES[key.trim().toLowerCase()];
  return index === undefined ? null : index;
}

function toMinutes(rawHour: string, rawMinute: string, ampm: string): number | null {
  let hour = Number(rawHour);
  const minute = rawMinute ? Number(rawMinute) : 0;
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 23 || minute > 59) return null;
  const ap = ampm.trim().toLowerCase();
  if (ap === "am" && hour === 12) hour = 0;
  else if (ap === "pm" && hour < 12) hour += 12;
  return hour * 60 + minute;
}

/**
 * Parse one day's value. Understands "9:00 AM – 7:00 PM", "9-19", "24 hours"
 * and anything containing "closed". Returns null when it cannot be read, which
 * callers treat as "unknown" rather than guessing.
 */
export function parseDayWindow(value: unknown): DayWindow | null | "closed" {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  if (/closed|off|band|holiday/i.test(text)) return "closed";
  if (/24\s*(hours|hrs|x7)?/i.test(text) && !/\d{1,2}\s*[:.]/.test(text)) return { opens: 0, closes: 24 * 60 };

  const m = text.match(
    /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:–|—|-|to|until|till)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i,
  );
  if (!m) return null;

  const opens = toMinutes(m[1], m[2] ?? "", m[3] ?? "");
  let closes = toMinutes(m[4], m[5] ?? "", m[6] ?? "");
  if (opens === null || closes === null) return null;
  // "9 AM - 1 AM" means the shop shuts after midnight.
  if (closes <= opens) closes += 24 * 60;
  return { opens, closes };
}

function formatMinutes(minutes: number): string {
  const total = minutes % (24 * 60);
  const hour24 = Math.floor(total / 60);
  const minute = total % 60;
  const ampm = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return minute ? `${hour12}:${String(minute).padStart(2, "0")} ${ampm}` : `${hour12} ${ampm}`;
}

/** Normalise a stored hours object into a Sunday-first array of windows. */
function weekWindows(hours: unknown): (DayWindow | "closed" | null)[] {
  const week: (DayWindow | "closed" | null)[] = [null, null, null, null, null, null, null];
  if (!hours || typeof hours !== "object") return week;
  for (const [key, value] of Object.entries(hours as Record<string, unknown>)) {
    const index = dayIndexForKey(key);
    if (index === null) continue;
    week[index] = parseDayWindow(value);
  }
  return week;
}

/**
 * Whether the business is open at `now`, with a label suitable for a badge.
 * Returns "unknown" when the hours cannot be parsed — the UI then shows nothing
 * rather than a guess.
 */
export function openStatus(hours: unknown, now: Date = new Date()): OpenStatus {
  const week = weekWindows(hours);
  if (week.every((d) => d === null)) {
    return { state: "unknown", label: "", detail: "" };
  }

  const dayIndex = now.getDay();
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const today = week[dayIndex];

  // Yesterday's window may still be running past midnight.
  const yesterday = week[(dayIndex + 6) % 7];
  if (yesterday && yesterday !== "closed" && yesterday.closes > 24 * 60) {
    if (minutesNow < yesterday.closes - 24 * 60) {
      return {
        state: "open",
        label: "Open now",
        detail: `Open now · closes at ${formatMinutes(yesterday.closes)}`,
      };
    }
  }

  if (today && today !== "closed") {
    // A place that never shuts has no closing time to announce. Formatting the
    // end of the day gave "closes at 12 AM", which reads as "shuts at midnight"
    // to anyone glancing at it — the opposite of what the owner set.
    const allDay = today.opens === 0 && today.closes >= 24 * 60;
    if (allDay) {
      return { state: "open", label: "Open 24 hours", detail: "Open 24 hours, every day" };
    }
    if (minutesNow >= today.opens && minutesNow < today.closes) {
      const closingSoon = today.closes - minutesNow <= 60;
      return {
        state: "open",
        label: closingSoon ? "Closing soon" : "Open now",
        detail: `Open now · closes at ${formatMinutes(today.closes)}`,
      };
    }
    if (minutesNow < today.opens) {
      return {
        state: "closed",
        label: `Opens ${formatMinutes(today.opens)}`,
        detail: `Closed · opens today at ${formatMinutes(today.opens)}`,
      };
    }
  }

  // Shut for the day (or the day is marked closed): find the next open day.
  for (let step = 1; step <= 7; step++) {
    const next = week[(dayIndex + step) % 7];
    if (!next || next === "closed") continue;
    const dayLabel = step === 1 ? "tomorrow" : DAY_NAMES[(dayIndex + step) % 7];
    return {
      state: "closed",
      label: "Closed",
      detail: `Closed · opens ${dayLabel} at ${formatMinutes(next.opens)}`,
    };
  }

  return { state: "closed", label: "Closed", detail: "Closed" };
}

/** Day name for a stored key, so the hours table can highlight today. */
export function isToday(key: string, now: Date = new Date()): boolean {
  return dayIndexForKey(key) === now.getDay();
}

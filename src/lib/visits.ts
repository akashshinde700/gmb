// WebSetu — what one visit did.
//
// A visitor id alone answers "who came back". It cannot answer the question a
// shopkeeper actually asks about a lead: what did this person do before they
// wrote to me? For that, every action in one sitting has to carry the same
// visit id — and a visit has to end the same way it does everywhere else, after
// half an hour without a page.
//
// Nothing here touches storage or the network: the browser side lives in
// lib/site-utils.ts, the reading side in /api/analytics/visits, and both go
// through these functions so the two can never disagree about what a visit is.

/** How long a visit lasts after the last page or action. */
export const VISIT_WINDOW_MS = 30 * 60 * 1000;

/** Ids the API will store: short, browser-generated, url-safe. */
const VISIT_ID = /^[a-z0-9][\w-]{7,39}$/i;

export function isVisitId(value: unknown): value is string {
  return typeof value === "string" && VISIT_ID.test(value);
}

/**
 * Continue the current visit or start a new one.
 *
 * Pure on purpose: the caller supplies "now" and the fresh id, so the rule can
 * be tested without a browser and a clock change cannot make a visit immortal.
 * A stored timestamp in the future (a device clock moving backwards) continues
 * the visit rather than starting a new one on every request.
 */
export function nextVisit(
  stored: { id: string; at: number } | null | undefined,
  now: number,
  freshId: string,
): { id: string; at: number; isNew: boolean } {
  if (stored && isVisitId(stored.id) && Number.isFinite(stored.at) && now - stored.at <= VISIT_WINDOW_MS) {
    return { id: stored.id, at: now, isNew: false };
  }
  return { id: isVisitId(freshId) ? freshId : "visit", at: now, isNew: true };
}

export interface VisitRow {
  type: string;
  meta: string;
  path: string;
  createdAt: Date;
}

export interface VisitSummary {
  id: string;
  first: string;
  last: string;
  path: string;
  actions: { type: string; at: string }[];
  /** The enquiry this visit produced, when it produced one. */
  leadId: string;
  /** The order it placed, when it placed one ("ORD-1042"). */
  order: string;
  converted: boolean;
}

export interface VisitReport {
  visits: VisitSummary[];
  /** Actions older than the visit ids (a page cached before this existed). */
  untracked: number;
  converted: number;
}

/** Read the identifiers out of an event's meta blob. Never throws. */
export function visitIdsOf(meta: string): { visitor: string; visit: string; leadId: string; order: string } {
  try {
    const parsed = JSON.parse(meta || "{}") as Record<string, unknown>;
    return {
      visitor: isVisitId(parsed.visitor) ? parsed.visitor : "",
      visit: isVisitId(parsed.visit) ? parsed.visit : "",
      leadId: typeof parsed.leadId === "string" ? parsed.leadId : "",
      order: typeof parsed.order === "string" ? parsed.order : "",
    };
  } catch {
    return { visitor: "", visit: "", leadId: "", order: "" };
  }
}

/**
 * One line per visit: when it started, what it did in order, whether it ended
 * in an enquiry.
 *
 * Rows without a visit id still count — they are older pages — but they are not
 * invented into a visit: a report that guesses which actions belonged together
 * is worse than one that says how much it could not attribute.
 */
export function visitSummaries(rows: readonly VisitRow[], limit = 50): VisitReport {
  const byId = new Map<string, VisitSummary>();
  let untracked = 0;

  for (const row of rows) {
    const { visit, leadId, order } = visitIdsOf(row.meta);
    if (!visit) {
      untracked++;
      continue;
    }
    const at = row.createdAt.toISOString();
    const existing = byId.get(visit);
    if (!existing) {
      byId.set(visit, {
        id: visit,
        first: at,
        last: at,
        path: row.path || "/",
        actions: [{ type: row.type, at }],
        leadId,
        order,
        converted: Boolean(leadId || order),
      });
      continue;
    }
    existing.last = at;
    existing.path = row.path || existing.path;
    existing.actions.push({ type: row.type, at });
    if (leadId && !existing.leadId) {
      existing.leadId = leadId;
      existing.converted = true;
    }
    // An order is the strongest thing a visit can end in, so it marks the visit
    // converted even on the rare path where the lead row was lost.
    if (order && !existing.order) {
      existing.order = order;
      existing.converted = true;
    }
  }

  const visits = [...byId.values()]
    .map((v) => ({ ...v, actions: [...v.actions].sort((a, b) => a.at.localeCompare(b.at)) }))
    .sort((a, b) => b.last.localeCompare(a.last))
    .slice(0, Math.max(1, limit));

  return { visits, untracked, converted: visits.filter((v) => v.converted).length };
}

/** Distinct visit ids in a set of events, for the "unique" counter. */
export function distinctVisits(rows: readonly Pick<VisitRow, "meta" | "type">[]): number {
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.type !== "VISIT" && row.type !== "FORM_SUBMIT") continue;
    const { visit } = visitIdsOf(row.meta);
    if (visit) seen.add(visit);
  }
  return seen.size;
}

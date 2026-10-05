// WebSetu — SMS delivery through httpSMS (https://httpsms.com).
//
// httpSMS turns one Android phone into the gateway: this app POSTs a message,
// httpSMS pushes it to the phone, and the phone sends it over its own SIM. That
// shapes every decision here:
//
//   * The whole platform shares one SIM and one monthly allowance (200 on the
//     free tier), so sending is budgeted centrally and counted in the database
//     rather than in memory — a process restart must not reset the count.
//   * Messages go to the business owner's own phone only, never to a visitor.
//     Sending to customers from a personal SIM is what gets a number blocked,
//     and in India it is what DLT registration exists to govern.
//   * Delivery is asynchronous and best-effort. The email alert and the in-app
//     notification remain the reliable channels; SMS is the one that reaches a
//     shopkeeper who is not looking at either.

import { db } from "@/lib/db";
import { toE164 } from "@/lib/phone-format";

// Re-exported so callers have one import for the whole SMS concern.
export { toE164 } from "@/lib/phone-format";

const ENDPOINT = "https://api.httpsms.com/v1/messages/send";
const USAGE_KEY = "sms.usage";

/** Monthly ceiling. The free httpSMS tier allows 200; stay under it by default. */
const MONTHLY_CAP: number = (() => {
  const raw = Number(process.env.HTTPSMS_MONTHLY_CAP ?? 180);
  if (!Number.isFinite(raw) || raw < 0) return 180;
  return Math.trunc(raw);
})();

const TIMEOUT_MS = 10_000;

export function smsConfigured(): boolean {
  return Boolean(process.env.HTTPSMS_API_KEY?.trim() && process.env.HTTPSMS_FROM?.trim());
}

interface Usage {
  month: string;
  count: number;
}

function currentMonth(now = new Date()): string {
  return now.toISOString().slice(0, 7); // YYYY-MM
}

async function readUsage(): Promise<Usage> {
  const month = currentMonth();
  try {
    const row = await db.setting.findUnique({ where: { key: USAGE_KEY } });
    if (!row) return { month, count: 0 };
    const parsed = JSON.parse(row.value || "{}") as Partial<Usage>;
    // A stale month means the allowance has rolled over.
    if (parsed.month !== month) return { month, count: 0 };
    return { month, count: Number(parsed.count) || 0 };
  } catch {
    return { month, count: 0 };
  }
}

/**
 * Claim one message from this month's allowance.
 *
 * Read-then-write is not atomic here, so two simultaneous leads could both
 * claim the last message. Overshooting the self-imposed cap by one is harmless
 * — it sits below the provider's real limit precisely so that it can absorb
 * that — and the alternative is a lock on the hot path of lead capture.
 */
async function claimQuota(): Promise<boolean> {
  const usage = await readUsage();
  if (usage.count >= MONTHLY_CAP) return false;
  const next: Usage = { month: usage.month, count: usage.count + 1 };
  try {
    await db.setting.upsert({
      where: { key: USAGE_KEY },
      update: { value: JSON.stringify(next) },
      create: { key: USAGE_KEY, value: JSON.stringify(next) },
    });
  } catch (e) {
    console.error("[sms] could not record usage:", e);
  }
  return true;
}

/** How much of this month's allowance is left — surfaced in the admin console. */
export async function smsQuota(): Promise<{ used: number; cap: number; remaining: number }> {
  const usage = await readUsage();
  return { used: usage.count, cap: MONTHLY_CAP, remaining: Math.max(0, MONTHLY_CAP - usage.count) };
}

export interface SmsMessage {
  to: string;
  /** Kept short on purpose: one SMS segment is 160 GSM-7 characters. */
  content: string;
}

/**
 * Send one SMS. Returns whether httpSMS accepted it — never throws, so callers
 * can fire it from `after()` without a guard. Acceptance is not delivery: the
 * phone reports that separately.
 */
export async function sendSms(msg: SmsMessage): Promise<boolean> {
  const apiKey = process.env.HTTPSMS_API_KEY?.trim();
  const from = process.env.HTTPSMS_FROM?.trim();
  if (!apiKey || !from) {
    console.warn("[sms] httpSMS is not configured — skipped");
    return false;
  }

  const to = toE164(msg.to);
  if (!to) {
    console.warn("[sms] recipient number could not be normalised — skipped");
    return false;
  }
  const content = msg.content.slice(0, 480); // at most three segments

  if (!(await claimQuota())) {
    console.error(`[sms] monthly cap of ${MONTHLY_CAP} reached — dropped message to ${to}`);
    return false;
  }

  // Without a deadline a stalled gateway would hold the request handler open
  // until the platform killed it.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, content }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[sms] httpSMS refused the message (${res.status}):`, detail.slice(0, 300));
      return false;
    }
    console.log(`[sms] queued to ${to}`);
    return true;
  } catch (e) {
    // Swallowed deliberately: a gateway outage must not fail the lead capture
    // that triggered the alert.
    console.error("[sms] could not reach httpSMS:", e);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The lead alert as a text message. Written to be useful on a lock screen: who,
 * their number, and what they asked about, in one segment where possible.
 */
export async function sendLeadSms(input: {
  to: string;
  businessName: string;
  leadName: string;
  leadPhone: string;
  serviceName: string;
}): Promise<boolean> {
  const interest = input.serviceName ? ` re: ${input.serviceName}` : "";
  const content =
    `New enquiry on ${input.businessName}: ${input.leadName}, ${input.leadPhone}${interest}. ` +
    `Call back soon. - WebSetu`;
  return sendSms({ to: input.to, content });
}

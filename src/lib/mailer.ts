// WebSetu — transactional email transport.
//
// Leads are the product: a shop owner who does not open the dashboard for three
// days must still hear about an enquiry the minute it arrives. Everything below
// is built so that a broken mailbox can never take an API route down with it —
// send failures are logged and swallowed, and every caller treats mail as
// best-effort.

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

interface MailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromEmail: string;
  fromName: string;
}

let cached: MailConfig | null | undefined;

/** Read + validate SMTP settings once. Returns null when mail is not set up. */
function config(): MailConfig | null {
  if (cached !== undefined) return cached;

  const host = (process.env.SMTP_HOST || "").trim();
  const user = (process.env.SMTP_USER || "").trim();
  const pass = (process.env.SMTP_PASS || "").trim();
  if (!host || !user || !pass) {
    cached = null;
    return cached;
  }

  const portRaw = Number(process.env.SMTP_PORT ?? 465);
  const port = Number.isFinite(portRaw) && portRaw > 0 && portRaw < 65536 ? Math.trunc(portRaw) : 465;
  // Implicit TLS on 465, STARTTLS on 587 — the usual pairing, overridable.
  const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465;

  cached = {
    host,
    port,
    secure,
    user,
    pass,
    fromEmail: (process.env.SMTP_FROM_EMAIL || user).trim(),
    fromName: (process.env.SMTP_FROM_NAME || "WebSetu").trim(),
  };
  return cached;
}

/** True when the deployment can actually send mail. */
export function mailConfigured(): boolean {
  return config() !== null;
}

let transporter: Transporter | null = null;

function transport(cfg: MailConfig): Transporter {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    // A pooled connection keeps Gmail from re-authenticating on every alert.
    pool: true,
    maxConnections: 2,
    maxMessages: 50,
    // Without these a black-holed SMTP port would hold a request handler open
    // until the platform killed it.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transporter;
}

/**
 * Shared-mailbox providers cut you off for the rest of the day once you cross
 * their quota — Gmail allows roughly 500 messages. Staying under a self-imposed
 * cap keeps one runaway loop from silencing every alert until midnight.
 */
const DAILY_CAP = (() => {
  const raw = Number(process.env.SMTP_DAILY_CAP ?? 400);
  if (!Number.isFinite(raw) || raw < 1) return 400;
  return Math.trunc(raw);
})();

let sentToday = 0;
let quotaDay = "";

function withinQuota(): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== quotaDay) {
    quotaDay = today;
    sentToday = 0;
  }
  if (sentToday >= DAILY_CAP) return false;
  sentToday += 1;
  return true;
}

/**
 * Domains that can never receive mail.
 *
 * RFC 2606 and RFC 6761 set these aside precisely so they cannot be delivered
 * to; every message to one is guaranteed to bounce. That matters more than it
 * sounds: the end-to-end suite registers accounts as pw-<tag>-<n>@example.com,
 * each of which triggers a real welcome email, and every one of them came back
 * as an "Address not found" bounce into the WebSetu mailbox — dozens per test
 * run, drowning the alerts the box exists for. Bouncing at that rate is also
 * how a sending reputation gets shredded.
 *
 * Checked here rather than in the tests: any code path that ever mails a made-up
 * address is making the same mistake, and this is the one place all of them
 * pass through.
 */
const UNDELIVERABLE = new Set([
  "example.com", "example.net", "example.org", "example.edu",
  "test", "example", "invalid", "localhost", "local",
]);

function isUndeliverableDomain(address: string): boolean {
  const domain = address.slice(address.lastIndexOf("@") + 1).toLowerCase();
  if (UNDELIVERABLE.has(domain)) return true;
  // Also the reserved suffixes: anything.test, anything.invalid, and so on.
  return [...UNDELIVERABLE].some((d) => domain.endsWith("." + d));
}

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

/**
 * Send one message. Returns whether it left the process — never throws, so a
 * caller can `await` it inside `after()` without guarding.
 */
export async function sendMail(msg: MailMessage): Promise<boolean> {
  const cfg = config();
  if (!cfg) {
    console.warn("[mail] SMTP is not configured — skipped:", msg.subject);
    return false;
  }
  const to = (msg.to || "").trim();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return false;

  if (isUndeliverableDomain(to)) {
    console.warn(`[mail] reserved test address — not sent: ${to} ("${msg.subject}")`);
    return false;
  }

  if (!withinQuota()) {
    console.error(`[mail] daily cap of ${DAILY_CAP} reached — dropped:`, msg.subject);
    return false;
  }

  try {
    await transport(cfg).sendMail({
      from: `"${cfg.fromName}" <${cfg.fromEmail}>`,
      to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
      ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
    });
    // One line per message: low volume, and it is the only record that an alert
    // actually left the box when a customer says they never got one.
    console.log(`[mail] sent "${msg.subject}" to ${to}`);
    return true;
  } catch (e) {
    // Deliberately swallowed: a bounced alert must not fail the lead capture
    // that triggered it. The in-app notification is the durable record.
    console.error(`[mail] could not send "${msg.subject}" to ${to}:`, e);
    return false;
  }
}

/** Verify the SMTP credentials — used by the health check and setup scripts. */
export async function verifyMailer(): Promise<{ ok: boolean; error?: string }> {
  const cfg = config();
  if (!cfg) return { ok: false, error: "SMTP_HOST / SMTP_USER / SMTP_PASS are not set" };
  try {
    await transport(cfg).verify();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || "verify failed" };
  }
}

/** Reset the cached config + transport. Tests only. */
export function __resetMailer() {
  cached = undefined;
  transporter = null;
  sentToday = 0;
  quotaDay = "";
}

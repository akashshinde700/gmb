// WebSetu — transactional email content.
//
// Templates live apart from the transport so they can be rendered and eyeballed
// without sending anything. Every value interpolated here is user-authored
// (lead names, enquiry text, business names), so it goes through escapeHtml on
// the way into the markup — an email client renders HTML exactly like a browser.

import { sendMail } from "@/lib/mailer";
import { siteOrigin } from "@/lib/site-utils";

const BRAND = "#059669";

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Digits only, so tel:/wa.me links work with whatever the owner typed. */
function phoneDigits(value: string): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  // Indian numbers are stored both with and without the country code.
  return digits.length === 10 ? `91${digits}` : digits;
}

interface LayoutOptions {
  title: string;
  intro?: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaHref?: string;
  footerNote?: string;
}

/**
 * One inline-styled shell for every message. Email clients strip <style> blocks
 * and know nothing about Tailwind, so the styling is inline and the layout is a
 * single centred table — the only structure that survives Outlook.
 */
function layout(o: LayoutOptions): string {
  const cta =
    o.ctaHref && o.ctaLabel
      ? `<tr><td style="padding:8px 32px 28px;">
           <a href="${escapeHtml(o.ctaHref)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:10px;">${escapeHtml(o.ctaLabel)}</a>
         </td></tr>`
      : "";
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e4e4e7;">
        <tr><td style="padding:24px 32px 8px;">
          <span style="display:inline-block;width:36px;height:36px;line-height:36px;text-align:center;background:${BRAND};color:#fff;border-radius:10px;font-weight:700;font-size:18px;">W</span>
          <span style="font-size:17px;font-weight:700;color:#18181b;vertical-align:middle;margin-left:8px;">WebSetu</span>
        </td></tr>
        <tr><td style="padding:12px 32px 0;">
          <h1 style="margin:0;font-size:20px;line-height:1.35;color:#18181b;">${escapeHtml(o.title)}</h1>
          ${o.intro ? `<p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#52525b;">${escapeHtml(o.intro)}</p>` : ""}
        </td></tr>
        <tr><td style="padding:20px 32px 0;">${o.bodyHtml}</td></tr>
        ${cta}
        <tr><td style="padding:0 32px 28px;">
          <p style="margin:0;font-size:12px;line-height:1.6;color:#a1a1aa;border-top:1px solid #f4f4f5;padding-top:16px;">
            ${o.footerNote ? `${escapeHtml(o.footerNote)}<br/>` : ""}
            Sent by WebSetu — your business, online.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/** Label/value rows used by the lead alert. */
function rows(pairs: [string, string][]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#18181b;">
    ${pairs
      .filter(([, v]) => v)
      .map(
        ([k, v]) =>
          `<tr>
             <td style="padding:6px 12px 6px 0;color:#71717a;white-space:nowrap;vertical-align:top;width:96px;">${escapeHtml(k)}</td>
             <td style="padding:6px 0;vertical-align:top;">${escapeHtml(v)}</td>
           </tr>`,
      )
      .join("")}
  </table>`;
}

/* ------------------------------- lead alert ------------------------------- */

export interface LeadAlertInput {
  to: string;
  businessName: string;
  lead: {
    name: string;
    phone: string;
    email: string;
    message: string;
    serviceName: string;
  };
}

/**
 * The message a business owner gets the moment an enquiry lands. Designed to be
 * actionable straight from the phone's notification shade: the number is
 * tappable, WhatsApp is one tap, and Reply goes to the customer, not to us.
 */
export async function sendLeadAlert(input: LeadAlertInput): Promise<boolean> {
  const { lead } = input;
  const wa = phoneDigits(lead.phone);
  const firstName = lead.name.split(" ")[0] || "now";
  const actions = [
    lead.phone
      ? `<a href="tel:${escapeHtml(lead.phone)}" style="display:inline-block;margin:0 8px 8px 0;background:${BRAND};color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:10px;">Call ${escapeHtml(firstName)}</a>`
      : "",
    wa
      ? `<a href="https://wa.me/${wa}" style="display:inline-block;margin:0 8px 8px 0;background:#25d366;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:10px;">WhatsApp</a>`
      : "",
  ].join("");

  const bodyHtml = `
    ${rows([
      ["Name", lead.name],
      ["Phone", lead.phone],
      ["Email", lead.email],
      ["Interest", lead.serviceName],
    ])}
    ${
      lead.message
        ? `<div style="margin:16px 0 0;padding:14px 16px;background:#f4f4f5;border-radius:12px;font-size:14px;line-height:1.6;color:#3f3f46;white-space:pre-wrap;">${escapeHtml(lead.message)}</div>`
        : ""
    }
    <div style="margin:20px 0 0;">${actions}</div>`;

  const text = [
    `New enquiry on ${input.businessName}`,
    "",
    `Name: ${lead.name}`,
    `Phone: ${lead.phone}`,
    lead.email ? `Email: ${lead.email}` : "",
    lead.serviceName ? `Interest: ${lead.serviceName}` : "",
    lead.message ? `\nMessage:\n${lead.message}` : "",
    "",
    `Open your leads: ${siteOrigin()}/dashboard/leads`,
  ]
    .filter((line) => line !== "")
    .join("\n");

  return sendMail({
    to: input.to,
    // Name and number in the subject make the phone notification enough to act
    // on without opening anything.
    subject: `New enquiry: ${lead.name} — ${lead.phone}`,
    html: layout({
      title: "You have a new enquiry",
      intro: `Someone just contacted you through ${input.businessName}. Enquiries answered within five minutes convert far more often.`,
      bodyHtml,
      ctaLabel: "Open all leads",
      ctaHref: `${siteOrigin()}/dashboard/leads`,
      footerNote: "Turn these alerts off any time in Dashboard → Settings.",
    }),
    text,
    // Hitting Reply should start a conversation with the customer.
    replyTo: lead.email || undefined,
  });
}

/* ----------------------------- lead auto-reply ---------------------------- */

/**
 * Acknowledgement to the visitor who filled the form. Local-business enquiries
 * usually go to several businesses at once and the one that answers first tends
 * to win; this answers instantly, in the tenant's name.
 */
export async function sendLeadAutoReply(input: {
  to: string;
  leadName: string;
  businessName: string;
  businessPhone: string;
  businessEmail: string;
}): Promise<boolean> {
  if (!input.to) return false;
  const contact = [
    input.businessPhone ? `Phone: ${input.businessPhone}` : "",
    input.businessEmail ? `Email: ${input.businessEmail}` : "",
  ].filter(Boolean);

  return sendMail({
    to: input.to,
    subject: `We received your enquiry — ${input.businessName}`,
    html: layout({
      title: `Thank you, ${input.leadName || "there"}`,
      intro: `${input.businessName} has received your enquiry and will get back to you shortly.`,
      bodyHtml: contact.length
        ? `<p style="margin:0;font-size:14px;line-height:1.7;color:#3f3f46;">Need to reach them sooner?<br/>${contact.map(escapeHtml).join("<br/>")}</p>`
        : `<p style="margin:0;font-size:14px;line-height:1.7;color:#3f3f46;">They will contact you on the number you provided.</p>`,
      footerNote: "You are receiving this because you submitted an enquiry form.",
    }),
    text: `Thank you, ${input.leadName || "there"}.\n\n${input.businessName} has received your enquiry and will contact you shortly.\n\n${contact.join("\n")}`,
    replyTo: input.businessEmail || undefined,
  });
}

/* -------------------------------- lifecycle ------------------------------- */

export async function sendWelcome(input: { to: string; name: string }): Promise<boolean> {
  return sendMail({
    to: input.to,
    subject: "Welcome to WebSetu — let us get your business online",
    html: layout({
      title: `Welcome, ${input.name || "there"}`,
      intro:
        "Your account is ready. Setup takes about 15 minutes and your website goes live the moment you finish.",
      bodyHtml: `<ol style="margin:0;padding-left:18px;font-size:14px;line-height:1.9;color:#3f3f46;">
        <li>Add your business details, logo and photos</li>
        <li>Pick a design and let AI write your content</li>
        <li>Publish — and start collecting enquiries</li>
      </ol>`,
      ctaLabel: "Finish setup",
      ctaHref: `${siteOrigin()}/onboarding`,
    }),
    text: `Welcome, ${input.name || "there"}.\n\nYour WebSetu account is ready. Finish the setup and publish your website: ${siteOrigin()}/onboarding`,
  });
}

/**
 * The password reset link.
 *
 * No marketing, no other links, and an explicit "if this wasn't you" line — a
 * reset mail that reads like a newsletter is one people click without thinking,
 * and one they ignore when it matters.
 */
export async function sendPasswordReset(input: {
  to: string;
  name: string;
  url: string;
  expiresInMinutes: number;
}): Promise<boolean> {
  return sendMail({
    to: input.to,
    subject: "Reset your WebSetu password",
    html: layout({
      title: "Reset your password",
      intro: `Use the button below to choose a new password. The link works once and expires in ${input.expiresInMinutes} minutes.`,
      bodyHtml: `<p style="margin:0;font-size:14px;line-height:1.7;color:#3f3f46;">If you did not ask for this, you can ignore this email — your password stays as it is, and nobody can use this link without your inbox.</p>`,
      ctaLabel: "Choose a new password",
      ctaHref: input.url,
      footerNote: "For your security, resetting signs you out of all other devices.",
    }),
    text: `Hi ${input.name || "there"},\n\nUse this link to choose a new WebSetu password. It works once and expires in ${input.expiresInMinutes} minutes:\n\n${input.url}\n\nIf you did not ask for this, ignore this email — your password will not change.`,
  });
}

export async function sendTrialEnded(input: { to: string; name: string }): Promise<boolean> {
  return sendMail({
    to: input.to,
    subject: "Your WebSetu trial has ended",
    html: layout({
      title: "Your free trial has ended",
      intro:
        "Your website is offline for now, but nothing has been deleted — every page, photo and lead is saved.",
      bodyHtml: `<p style="margin:0;font-size:14px;line-height:1.7;color:#3f3f46;">Choose a plan and your site goes back online instantly, on the same address.</p>`,
      ctaLabel: "Choose a plan",
      ctaHref: `${siteOrigin()}/dashboard/subscription`,
    }),
    text: `Hi ${input.name || "there"},\n\nYour WebSetu trial has ended and your website is offline. Everything is saved — choose a plan and it goes live again instantly: ${siteOrigin()}/dashboard/subscription`,
  });
}

export async function sendPastDue(input: {
  to: string;
  name: string;
  graceDays: number;
}): Promise<boolean> {
  return sendMail({
    to: input.to,
    subject: `Payment due — your website stays online for ${input.graceDays} more days`,
    html: layout({
      title: "Your renewal is pending",
      intro: `We could not confirm your renewal. Your website stays online for ${input.graceDays} more days.`,
      bodyHtml: `<p style="margin:0;font-size:14px;line-height:1.7;color:#3f3f46;">Renew now to avoid any interruption to your website and enquiry forms.</p>`,
      ctaLabel: "Renew now",
      ctaHref: `${siteOrigin()}/dashboard/subscription`,
    }),
    text: `Hi ${input.name || "there"},\n\nYour WebSetu renewal is pending. Your website stays online for ${input.graceDays} more days. Renew: ${siteOrigin()}/dashboard/subscription`,
  });
}

export async function sendSubscriptionExpired(input: { to: string; name: string }): Promise<boolean> {
  return sendMail({
    to: input.to,
    subject: "Your website is offline",
    html: layout({
      title: "Your website is offline",
      intro: "The grace period has ended, so your website is no longer public.",
      bodyHtml: `<p style="margin:0;font-size:14px;line-height:1.7;color:#3f3f46;">All of your content and leads are safe. Renew any time and your site comes straight back.</p>`,
      ctaLabel: "Renew and go live",
      ctaHref: `${siteOrigin()}/dashboard/subscription`,
    }),
    text: `Hi ${input.name || "there"},\n\nYour WebSetu website is offline after the renewal grace period. Your content and leads are safe — renew any time: ${siteOrigin()}/dashboard/subscription`,
  });
}

// WebSetu — "buy a domain for me" requests.
//
// The customer names the domain they want; an admin registers it, quotes the
// price (paid separately from the subscription), and connects it once paid.

import { db } from "@/lib/db";
import { sendMail } from "@/lib/mailer";
import { escapeHtml } from "@/lib/emails";
import { checkHostname } from "@/lib/domain-rules";

export const DOMAIN_REQUEST_STATUSES = ["REQUESTED", "QUOTED", "PAID", "CONNECTED", "CANCELLED"] as const;
export type DomainRequestStatus = (typeof DOMAIN_REQUEST_STATUSES)[number];

export type Availability = "AVAILABLE" | "TAKEN" | "UNKNOWN";

/**
 * The name a registrar sells: "www.shop.com" → "shop.com". Two-part public
 * suffixes common in India (co.in, org.in, …) keep three labels.
 */
export function registrableName(hostname: string): string {
  const labels = hostname.toLowerCase().replace(/^www\./, "").split(".");
  const twoPart = /^(co|org|net|gen|firm|ind|ac|edu|res|gov)\.(in|uk)$|^com\.(au|sg)$/;
  const keep = labels.length >= 3 && twoPart.test(labels.slice(-2).join(".")) ? 3 : 2;
  return labels.slice(-keep).join(".");
}

/** Normalise and validate what the customer typed; returns the registrable name. */
export function parseWantedDomain(raw: string): { ok: true; domain: string } | { ok: false; error: string } {
  const check = checkHostname(raw);
  if (!check.ok) return { ok: false, error: check.error || "That is not a valid domain name" };
  const domain = registrableName(check.hostname);
  if (!domain.includes(".")) return { ok: false, error: "Include the ending, like .com or .in" };
  return { ok: true, domain };
}

/**
 * Ask RDAP whether a domain is registered. A 404 from the RDAP bootstrap means
 * no registration record exists. This is a hint for the customer, not a
 * guarantee — the admin confirms with the registrar before quoting.
 */
export async function checkAvailability(domain: string): Promise<Availability> {
  try {
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      redirect: "follow",
      // rdap.org answers 403 to clients without a User-Agent of their own.
      headers: { Accept: "application/rdap+json", "User-Agent": "WebSetu/1.0 (domain availability check)" },
      signal: AbortSignal.timeout(6_000),
    });
    if (res.status === 404) return "AVAILABLE";
    if (res.ok) return "TAKEN";
    return "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}

/** Tell every platform admin (in-app, plus the support inbox when mail is set up). */
export async function notifyAdmins(title: string, body: string): Promise<void> {
  const admins = await db.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  if (admins.length) {
    await db.notification.createMany({ data: admins.map((a) => ({ userId: a.id, title, body })) });
  }
  const to = (process.env.SUPPORT_EMAIL || "").trim();
  if (to) {
    await sendMail({
      to,
      subject: title,
      text: body,
      html: `<p>${escapeHtml(body).replace(/\n/g, "<br>")}</p>`,
    });
  }
}

export function serializeDomainRequest(r: {
  id: string; domain: string; alternatives: string; note: string; availability: string;
  status: string; quotedPrice: number | null; adminNote: string; createdAt: Date; updatedAt: Date;
}) {
  return {
    id: r.id,
    domain: r.domain,
    alternatives: r.alternatives ? r.alternatives.split(",").filter(Boolean) : [],
    note: r.note,
    availability: r.availability,
    status: r.status,
    quotedPrice: r.quotedPrice,
    adminNote: r.adminNote,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

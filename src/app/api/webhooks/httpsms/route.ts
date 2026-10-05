import { createHmac, timingSafeEqual } from "node:crypto";
import { audit } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/httpsms
 *
 * Delivery outcomes for the SMS lead alerts. Sending is already best-effort —
 * the in-app notification and the email are the reliable channels — so nothing
 * here changes what a customer gets. What it changes is what we know: without
 * it, an alert that never reached the owner's handset looks identical to one
 * that did, and the first sign of a problem is a customer saying they missed a
 * lead.
 *
 * Only failures are recorded. A webhook for every delivered message would write
 * an audit row per alert and tell us nothing we did not already assume.
 *
 * Signature: httpSMS signs the raw body with the signing key, so the body is
 * read as text and hashed before any parsing — re-serialising parsed JSON would
 * change the bytes and fail every check.
 */

function verifySignature(rawBody: string, signature: string): boolean {
  const key = process.env.HTTPSMS_WEBHOOK_SIGNING_KEY?.trim();
  if (!key || !signature) return false;
  const expected = createHmac("sha256", key).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature.trim());
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The events worth reacting to: an alert that did not arrive. */
const FAILURE_EVENTS = new Set(["message.send.failed", "message.send.expired"]);

export async function POST(req: Request) {
  const raw = await req.text();
  // httpSMS has used more than one header name for this over time; accept the
  // ones it sends rather than failing on a rename.
  const signature =
    req.headers.get("x-signature") ||
    req.headers.get("x-httpsms-signature") ||
    req.headers.get("signature") ||
    "";

  if (!verifySignature(raw, signature)) {
    console.warn("[sms-webhook] rejected: signature did not verify");
    return new Response("invalid signature", { status: 401 });
  }

  let event: { type?: string; event?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }

  const name = String(event.type ?? event.event ?? "unknown");
  if (!FAILURE_EVENTS.has(name)) {
    // Delivered/sent/received are acknowledged and ignored. A 4xx would make
    // httpSMS retry an event we are never going to act on.
    return Response.json({ ok: true, ignored: name });
  }

  const data = event.data ?? {};
  const to = String(data.contact ?? data.to ?? "");
  const reason = String(data.failure_reason ?? data.reason ?? "");

  // Logged loudly: this is the line that explains a missing lead alert.
  console.error(`[sms-webhook] ${name} to ${to}${reason ? ` — ${reason}` : ""}`);

  await audit({
    actor: "httpsms-webhook",
    action: "SMS_DELIVERY_FAILED",
    entity: "sms",
    entityId: String(data.id ?? ""),
    meta: { event: name, to, reason },
  });

  return Response.json({ ok: true, recorded: true });
}

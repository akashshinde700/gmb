// WebSetu — shared API-route plumbing: guards, safe JSON parsing, error shaping.
//
// Every route handler goes through `route()`. Without it an unexpected throw
// (malformed JSON body, Prisma P2025, a null deref) escapes as Next's default
// 500 HTML page carrying a stack trace, which the frontend api-client cannot
// parse and which leaks internals to the caller.

import { db } from "@/lib/db";
import { fail, getSessionUser, ok } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import type { SessionUser } from "@/lib/types";

export { ok, fail };

const isProd = process.env.NODE_ENV === "production";

/** Thrown by guards/validators to abort a handler with a specific status. */
export class HttpError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

type PrismaKnownError = { code?: string; meta?: { target?: unknown } };

function mapKnownError(e: unknown): { message: string; status: number } | null {
  if (e instanceof HttpError) return { message: e.message, status: e.status };
  if (e instanceof SyntaxError) return { message: "Invalid request body", status: 400 };

  const code = (e as PrismaKnownError)?.code;
  if (typeof code === "string" && code.startsWith("P")) {
    // Prisma client errors — mapped to safe messages, never surfaced verbatim.
    if (code === "P2025") return { message: "Record not found", status: 404 };
    if (code === "P2002") return { message: "That value is already taken", status: 409 };
    if (code === "P2003") return { message: "Related record is missing", status: 400 };
    return { message: "Could not complete the database operation", status: 400 };
  }
  return null;
}

/**
 * Wrap a route handler: converts thrown errors into the app's `{ok:false,error}`
 * envelope with a sane status, and logs the real error server-side only.
 */
export function route<A extends unknown[]>(
  handler: (req: Request, ...args: A) => Promise<Response>,
) {
  return async (req: Request, ...args: A): Promise<Response> => {
    try {
      return await handler(req, ...args);
    } catch (e) {
      const known = mapKnownError(e);
      if (known) return fail(known.message, known.status);
      console.error(`[api] ${req.method} ${new URL(req.url).pathname} failed:`, e);
      return fail(
        isProd ? "Something went wrong. Please try again." : `Server error: ${(e as Error)?.message}`,
        500,
      );
    }
  };
}

/** Parse a JSON body, tolerating an empty one. Throws HttpError on malformed JSON. */
export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  const text = await req.text();
  if (!text.trim()) return {} as T;
  try {
    const parsed = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new HttpError("Invalid request body", 400);
    }
    return parsed as T;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError("Invalid request body", 400);
  }
}

/* --------------------------------- guards --------------------------------- */

export async function requireUser(req: Request): Promise<SessionUser> {
  const session = await getSessionUser(req);
  if (!session) throw new HttpError("Unauthorized", 401);
  return session;
}

export async function requireAdmin(req: Request): Promise<SessionUser> {
  const session = await requireUser(req);
  if (session.role !== "ADMIN") throw new HttpError("Admin access required", 403);
  return session;
}

/**
 * Resolve the session user's own business. Tenant isolation everywhere starts
 * here: the business id is derived from the session, never from the request.
 */
export async function requireBusiness(session: SessionUser) {
  const business = await db.business.findUnique({
    where: { userId: session.id },
    include: { website: true, subscription: { include: { plan: true } } },
  });
  if (!business) throw new HttpError("No business found. Complete onboarding first.", 404);
  return business;
}

function throwIfOver(result: { ok: boolean; retryAfter: number }) {
  if (!result.ok) {
    throw new HttpError(
      `Too many requests. Please wait ${result.retryAfter}s and try again.`,
      429,
    );
  }
}

/**
 * Throw a 429 when `key` exceeds `limit` hits per `windowMs`, counted PER IP.
 *
 * For the budgets that are genuinely about one caller hammering the app:
 * "login:ip", "register", "lead:ip".
 */
export function limitOrThrow(req: Request, key: string, limit: number, windowMs: number) {
  throwIfOver(rateLimit(`${key}:${clientIp(req)}`, limit, windowMs));
}

/**
 * Throw a 429 when `key` exceeds `limit` hits per `windowMs`, counted for the
 * subject named in the key and NOT split by IP.
 *
 * This exists because `limitOrThrow` appended the client IP to every key, which
 * silently defeated the keys whose whole purpose was to survive a rotating IP
 * pool. `login:acct:<email>`, meant as "eight attempts against this account per
 * ten minutes", was really "eight attempts per account per IP" — one botnet,
 * and the account limit did nothing that the per-IP limit was not already
 * doing. The same held for the forgot-password, lead-per-site, subscribe and
 * order budgets.
 *
 * The key must already identify the subject (an account, a business, a session,
 * a site), or this becomes a single global counter shared by every caller.
 */
export function limitSubjectOrThrow(key: string, limit: number, windowMs: number) {
  throwIfOver(rateLimit(key, limit, windowMs));
}

/* ------------------------------- validators -------------------------------- */

export function str(value: unknown, max: number): string {
  return String(value ?? "").slice(0, max).trim();
}

/** Reject values that would become an executable/scripted URL when rendered. */
export function safeUrl(value: unknown, max = 2000): string {
  const raw = String(value ?? "").trim().slice(0, max);
  if (!raw) return "";
  if (/^(https?:|mailto:|tel:|\/)/i.test(raw)) return raw;
  // data: images are still accepted for legacy rows, but only real image types
  if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(raw)) return raw;
  return "";
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Paging params shared by list endpoints. */
export function pageParams(req: Request, defaultTake = 50, maxTake = 200) {
  const { searchParams } = new URL(req.url);
  const takeRaw = Number(searchParams.get("take") ?? defaultTake);
  const skipRaw = Number(searchParams.get("skip") ?? 0);
  const take = Number.isFinite(takeRaw) ? Math.min(maxTake, Math.max(1, Math.trunc(takeRaw))) : defaultTake;
  const skip = Number.isFinite(skipRaw) ? Math.max(0, Math.trunc(skipRaw)) : 0;
  return { take, skip, searchParams };
}

/** Append an audit row. Never throws into the caller's happy path. */
export async function audit(entry: {
  actor: string;
  action: string;
  entity?: string;
  entityId?: string;
  meta?: Record<string, unknown>;
}) {
  try {
    await db.auditLog.create({
      data: {
        actor: entry.actor,
        action: entry.action,
        entity: entry.entity ?? "",
        entityId: entry.entityId ?? "",
        meta: JSON.stringify(entry.meta ?? {}),
      },
    });
  } catch (e) {
    console.error("[audit] could not write audit log:", e);
  }
}

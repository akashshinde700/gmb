import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/types";

// A predictable signing key means anyone can mint a session for any user id, so
// production refuses to sign or verify anything without a real one. The check is
// lazy on purpose: `next build` runs with NODE_ENV=production and must not need
// runtime secrets to compile.
const DEV_SECRET = "websetu-dev-secret-change-in-production";
let cachedSecret: string | null = null;

function secret(): string {
  if (cachedSecret) return cachedSecret;
  const configured = process.env.APP_SECRET?.trim();
  if (configured && configured.length >= 16) {
    cachedSecret = configured;
    return cachedSecret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "APP_SECRET is missing or too short (min 16 chars). Set it in the environment before starting the server.",
    );
  }
  cachedSecret = configured || DEV_SECRET;
  return cachedSecret;
}
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = (stored || "").split(":");
  if (!salt || !hash) {
    // Burn comparable time so a missing/!malformed hash is not distinguishable
    // from a wrong password by response timing (user enumeration).
    scryptSync(password, "websetu-dummy-salt", 64);
    return false;
  }
  const candidate = scryptSync(password, salt, 64);
  const original = Buffer.from(hash, "hex");
  return candidate.length === original.length && timingSafeEqual(candidate, original);
}

function b64url(input: string): string {
  return Buffer.from(input).toString("base64url");
}

/**
 * Mint a session token.
 *
 * `v` is the user's tokenVersion at the moment of issue. Verification compares
 * it with the value in the database, which is what makes revocation possible at
 * all: these tokens are stateless HMACs, so before this there was no way to
 * invalidate one short of rotating APP_SECRET and signing everybody out.
 */
export function createToken(userId: string, tokenVersion = 0): string {
  const payload = b64url(
    JSON.stringify({ uid: userId, v: tokenVersion, exp: Date.now() + TOKEN_TTL_MS }),
  );
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyTokenPayload(token: string): { uid: string; v: number } | null {
  const [payload, sig] = (token || "").split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      uid: string; v?: number; exp: number;
    };
    if (!data.uid || data.exp < Date.now()) return null;
    // Tokens minted before versioning existed carry no `v`; they read as 0,
    // which matches the default on every existing user.
    return { uid: data.uid, v: Number(data.v) || 0 };
  } catch {
    return null;
  }
}

/** Name of the session cookie. */
export const SESSION_COOKIE = "websetu_session";

/**
 * `Set-Cookie` value for a fresh session.
 *
 * httpOnly is the point of the exercise: the token used to live in
 * localStorage, where any script running on the page — an injected one
 * included — could read it and keep it for the full thirty days. A cookie the
 * page cannot read removes that whole class of account takeover.
 *
 * SameSite=Lax is what stops another site from silently using the cookie: the
 * browser will not attach it to a cross-site POST. Secure is set only outside
 * development, since local dev is plain HTTP.
 */
export function sessionCookie(token: string): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(TOKEN_TTL_MS / 1000)}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

/** `Set-Cookie` value that removes the session. */
export function clearSessionCookie(): string {
  const parts = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

/**
 * Where an admin's own session is parked while they are inside a customer's
 * account.
 *
 * A browser has one cookie jar, so "open this customer's dashboard" can only
 * ever mean "this browser is now that customer" — in every tab, not just the
 * new one. Keeping the admin's token here makes that swap reversible with a
 * click instead of a fresh login.
 *
 * httpOnly, like the session itself: it IS a session token, and a readable one
 * would hand any script on the page a working admin credential.
 */
export const ADMIN_BACKUP_COOKIE = "websetu_admin_return";

/** Park an admin session for the length of a support visit. */
export function adminBackupCookie(token: string): string {
  const parts = [
    `${ADMIN_BACKUP_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    // Hours, not the token's full thirty days: this is one support session, and
    // a forgotten backup should expire on its own.
    `Max-Age=${8 * 60 * 60}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

/** Remove the parked admin session. */
export function clearAdminBackupCookie(): string {
  const parts = [`${ADMIN_BACKUP_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

/** Read one cookie's raw value from a request. */
function readCookie(req: Request, name: string): string {
  const header = req.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return "";
}

/** Read the raw token from the session cookie, if present. */
function cookieToken(req: Request): string {
  return readCookie(req, SESSION_COOKIE);
}

/** The parked admin token, if this browser is inside a support visit. */
export function adminBackupToken(req: Request): string {
  return readCookie(req, ADMIN_BACKUP_COOKIE);
}

/**
 * Resolve the authenticated user for a request. Returns null when invalid.
 *
 * The cookie is checked first; the Authorization header remains supported for
 * scripts and the test suites, which have no cookie jar. Both go through the
 * same verification, so neither is a weaker way in.
 */
export async function getSessionUser(req: Request): Promise<SessionUser | null> {
  const header = req.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const token = cookieToken(req) || bearer;
  if (!token) return null;

  const parsed = verifyTokenPayload(token);
  if (!parsed) return null;

  const user = await db.user.findUnique({ where: { id: parsed.uid } });
  if (!user) return null;
  // The revocation check. A password change or an explicit "sign out
  // everywhere" bumps tokenVersion, and every token issued before that stops
  // resolving here — including one already stolen.
  if (user.tokenVersion !== parsed.v) return null;

  return { id: user.id, email: user.email, name: user.name, role: user.role as SessionUser["role"] };
}

/** Get the tenant business owned by the session user (tenant isolation — never trust client-sent ids). */
export async function getSessionBusiness(userId: string) {
  return db.business.findUnique({
    where: { userId },
    include: { website: true, subscription: { include: { plan: true } } },
  });
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "business";
}

export async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base);
  let candidate = root;
  let i = 1;
  while (await db.business.findUnique({ where: { slug: candidate } })) {
    i += 1;
    candidate = `${root}-${i}`;
  }
  return candidate;
}

/** Standard JSON responses */
export function ok<T>(data: T, init?: number, meta?: Record<string, unknown>) {
  // `meta` carries paging counts alongside the payload without changing the
  // shape of `data`, which clients read directly.
  return Response.json(meta ? { ok: true, data, meta } : { ok: true, data }, { status: init ?? 200 });
}
export function fail(message: string, status = 400) {
  return Response.json({ ok: false, error: message }, { status });
}

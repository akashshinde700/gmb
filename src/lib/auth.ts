import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/types";

const SECRET = process.env.APP_SECRET || "websetu-dev-secret-change-in-production";
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const original = Buffer.from(hash, "hex");
  return candidate.length === original.length && timingSafeEqual(candidate, original);
}

function b64url(input: string): string {
  return Buffer.from(input).toString("base64url");
}

export function createToken(userId: string): string {
  const payload = b64url(JSON.stringify({ uid: userId, exp: Date.now() + TOKEN_TTL_MS }));
  const sig = createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyTokenPayload(token: string): { uid: string } | null {
  const [payload, sig] = (token || "").split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", SECRET).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { uid: string; exp: number };
    if (!data.uid || data.exp < Date.now()) return null;
    return { uid: data.uid };
  } catch {
    return null;
  }
}

/** Resolve the authenticated user from the Authorization header. Returns null when invalid. */
export async function getSessionUser(req: Request): Promise<SessionUser | null> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const parsed = verifyTokenPayload(token);
  if (!parsed) return null;
  const user = await db.user.findUnique({ where: { id: parsed.uid } });
  if (!user) return null;
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
export function ok<T>(data: T, init?: number) {
  return Response.json({ ok: true, data }, { status: init ?? 200 });
}
export function fail(message: string, status = 400) {
  return Response.json({ ok: false, error: message }, { status });
}

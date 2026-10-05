// WebSetu — server-side route guards for the console.
//
// Authentication used to be decided in the browser: every protected view first
// rendered a spinner, waited for /api/auth/me, and only then redirected. A
// signed-out visitor saw a loading screen before being sent to login, and a
// signed-in one saw it before their own dashboard.
//
// The session is an httpOnly cookie, so the server can answer that question
// before a single byte of the page is sent. The redirect happens instead of the
// render, not after it.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/types";

/** Read the session from the incoming request's cookies. */
export async function currentUser(): Promise<SessionUser | null> {
  const headerList = await headers();
  // getSessionUser reads a Request; the URL is irrelevant, only the headers are.
  return getSessionUser(new Request("http://internal/", { headers: headerList }));
}

/**
 * Require a signed-in user, sending them to login otherwise.
 *
 * `next` carries where they were heading so login can return them there rather
 * than dumping everyone on the dashboard.
 */
export async function requirePageUser(next: string): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

/** Require an admin. A signed-in non-admin goes to their own dashboard. */
export async function requirePageAdmin(next: string): Promise<SessionUser> {
  const user = await requirePageUser(next);
  // Not a 403 page: a customer who lands on /admin has almost always followed a
  // stale link, and the useful thing is their own dashboard, not an error.
  if (user.role !== "ADMIN") redirect("/dashboard");
  return user;
}

/**
 * Require a completed onboarding.
 *
 * The dashboard is meaningless without a business, and the old flow rendered it
 * anyway and then swapped in the wizard.
 */
export async function requirePageBusiness(next: string): Promise<SessionUser> {
  const user = await requirePageUser(next);
  const business = await db.business.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!business) redirect("/onboarding");
  return user;
}

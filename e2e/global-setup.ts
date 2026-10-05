import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Sign in once per role and save the session as a Playwright storage state.
 *
 * The login route rate-limits an IP to 20 attempts per 10 minutes, which is
 * correct behaviour and must not be weakened for tests. Logging in once here
 * keeps the whole suite well under that budget; the auth spec still drives the
 * real form for the flows that are actually about logging in.
 *
 * The session lives in an httpOnly cookie. This file used to write the token
 * into `localStorage` instead, which is where it lived before the move off
 * client-readable storage — so the state files it produced restored nothing,
 * and every spec that opened with `test.use({ storageState })` ran signed out
 * and failed on the first assertion that needed an account.
 */

const BASE = process.env.PW_BASE_URL || `http://127.0.0.1:${process.env.PW_PORT || 3100}`;
const COOKIE = "websetu_session";

export const STATE = {
  customer: "e2e/.auth/customer.json",
  admin: "e2e/.auth/admin.json",
};

/** Read the session cookie out of a saved state file, if there is one. */
function storedCookie(file: string): string {
  if (!existsSync(file)) return "";
  try {
    const state = JSON.parse(readFileSync(file, "utf8")) as {
      cookies?: { name: string; value: string }[];
    };
    return state.cookies?.find((c) => c.name === COOKIE)?.value ?? "";
  } catch {
    /* a corrupt file just means we log in again */
  }
  return "";
}

async function stillValid(token: string): Promise<boolean> {
  if (!token) return false;
  const res = await fetch(`${BASE}/api/auth/me`, { headers: { Cookie: `${COOKIE}=${token}` } });
  return res.ok;
}

/** The session token out of a login response's Set-Cookie header. */
function tokenFromSetCookie(res: Response): string {
  // Node's fetch merges repeated headers; getSetCookie keeps them apart.
  const headers = typeof res.headers.getSetCookie === "function"
    ? res.headers.getSetCookie()
    : [res.headers.get("set-cookie") ?? ""];
  for (const header of headers) {
    const match = new RegExp(`(?:^|,\s*)${COOKIE}=([^;]*)`).exec(header);
    if (match?.[1]) return match[1];
  }
  return "";
}

async function saveSession(email: string, password: string, file: string) {
  // Reuse a session that is still good. Repeated local runs would otherwise
  // spend the account's 8-logins-per-10-minutes budget and start failing.
  if (await stillValid(storedCookie(file))) return;

  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.clone().json()) as { error?: string };
  const token = tokenFromSetCookie(res);
  if (!res.ok || !token) {
    throw new Error(`global setup could not sign in ${email}: ${res.status} ${body?.error ?? ""}`);
  }

  const { hostname } = new URL(BASE);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    JSON.stringify(
      {
        cookies: [
          {
            name: COOKIE,
            value: token,
            domain: hostname,
            path: "/",
            // The server marks the cookie Secure because it runs with
            // NODE_ENV=production. The suite talks to it over plain HTTP on
            // loopback, so the copy handed to the browser drops that flag —
            // the server never sees cookie attributes on the way back in.
            secure: false,
            httpOnly: true,
            sameSite: "Lax" as const,
            expires: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
          },
        ],
        origins: [],
      },
      null,
      2,
    ),
  );
}

export default async function globalSetup() {
  await saveSession("demo@websetu.in", "demo1234", STATE.customer);
  await saveSession("admin@websetu.in", "admin1234", STATE.admin);
}

import { db } from "@/lib/db";
import { createToken, sessionCookie, verifyPassword } from "@/lib/auth";
import { HttpError, limitOrThrow, limitSubjectOrThrow, ok, readJson, route } from "@/lib/api";

export const POST = route(async (req: Request) => {
  const body = await readJson<{ email?: string; password?: string }>(req);
  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";
  if (!email || !password) throw new HttpError("Email and password are required");

  // Brute-force protection: per-IP overall, plus a tighter per-account budget so
  // one attacker cannot spray a single account from a rotating IP pool.
  limitOrThrow(req, "login:ip", 20, 10 * 60 * 1000);
  limitSubjectOrThrow(`login:acct:${email}`, 8, 10 * 60 * 1000);

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new HttpError("Invalid email or password", 401);
  }

  const token = createToken(user.id, user.tokenVersion);

  // The token is returned in the body as well as set as a cookie: the browser
  // uses the cookie and never touches the body value, while the test suites and
  // any script client still have something to send as a bearer token.
  const response = ok({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
  response.headers.append("Set-Cookie", sessionCookie(token));
  return response;
});

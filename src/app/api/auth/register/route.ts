import { db } from "@/lib/db";
import { createToken, hashPassword, sessionCookie } from "@/lib/auth";
import { HttpError, isEmail, limitOrThrow, ok, readJson, route, str } from "@/lib/api";
import { after } from "next/server";
import { sendWelcome } from "@/lib/emails";

export const POST = route(async (req: Request) => {
  // Generous enough for an office or agency behind one NAT address, tight
  // enough that scripted signup floods stop.
  limitOrThrow(req, "register", 30, 60 * 60 * 1000);

  const body = await readJson<{ name?: string; email?: string; password?: string }>(req);
  const name = str(body.name, 120);
  const email = str(body.email, 200).toLowerCase();
  const password = body.password || "";

  if (!name || name.length < 2) throw new HttpError("Please enter your full name");
  if (!isEmail(email)) throw new HttpError("Please enter a valid email address");
  if (password.length < 8) throw new HttpError("Password must be at least 8 characters");
  if (password.length > 200) throw new HttpError("Password is too long");
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    throw new HttpError("Password must contain at least one letter and one number");
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) throw new HttpError("An account with this email already exists. Please login.", 409);

  // The role is fixed server-side — a client-supplied "role" is ignored, so a
  // registration can never mint an ADMIN.
  const user = await db.user.create({
    data: { name, email, passwordHash: hashPassword(password), role: "CUSTOMER" },
  });

  await db.notification.create({
    data: {
      userId: user.id,
      title: "Welcome to WebSetu 🎉",
      body: "Complete the 7-step setup and launch your business website in minutes.",
    },
  });

  // Sent after the response so a slow mailbox never delays signup.
  after(async () => {
    await sendWelcome({ to: user.email, name: user.name });
  });

  const token = createToken(user.id, user.tokenVersion);
  const response = ok({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
  response.headers.append("Set-Cookie", sessionCookie(token));
  return response;
});

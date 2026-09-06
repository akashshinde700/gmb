import { db } from "@/lib/db";
import { createToken, fail, ok, verifyPassword } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { email?: string; password?: string };
    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || "";
    if (!email || !password) return fail("Email and password are required");

    const user = await db.user.findUnique({ where: { email } });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return fail("Invalid email or password", 401);
    }

    return ok({ token: createToken(user.id), user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch {
    return fail("Login failed. Please try again.", 500);
  }
}

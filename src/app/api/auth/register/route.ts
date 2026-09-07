import { db } from "@/lib/db";
import { createToken, fail, hashPassword, ok } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { name?: string; email?: string; password?: string };
    const name = (body.name || "").trim();
    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || "";

    if (!name || name.length < 2) return fail("Please enter your full name");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Please enter a valid email address");
    if (password.length < 6) return fail("Password must be at least 6 characters");

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) return fail("An account with this email already exists. Please login.", 409);

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

    return ok({ token: createToken(user.id), user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch {
    return fail("Registration failed. Please try again.", 500);
  }
}

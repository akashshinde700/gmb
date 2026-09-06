import { db } from "@/lib/db";
import { fail, getSessionUser, ok } from "@/lib/auth";
import { serializeBusiness, serializeSub } from "@/lib/serialize";

async function requireAdmin(req: Request) {
  const session = await getSessionUser(req);
  if (!session) return { error: fail("Unauthorized", 401) as Response };
  if (session.role !== "ADMIN") return { error: fail("Admin access required", 403) as Response };
  return { session };
}

/** GET /api/admin/customers — all customers with business + subscription */
export async function GET(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").toLowerCase();

  const users = await db.user.findMany({
    where: { role: "CUSTOMER" },
    include: {
      business: { include: { subscription: { include: { plan: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const rows = users
    .filter((u) =>
      !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) ||
      (u.business?.name || "").toLowerCase().includes(q))
    .map((u) => ({
      id: u.id, name: u.name, email: u.email, createdAt: u.createdAt.toISOString(),
      business: u.business ? serializeBusiness(u.business) : null,
      subscription: u.business?.subscription ? serializeSub(u.business.subscription) : null,
    }));

  return ok(rows);
}

import { db } from "@/lib/db";
import { fail, getSessionUser, ok } from "@/lib/auth";

async function requireAdmin(req: Request) {
  const session = await getSessionUser(req);
  if (!session) return { error: fail("Unauthorized", 401) as Response };
  if (session.role !== "ADMIN") return { error: fail("Admin access required", 403) as Response };
  return { session };
}

/** GET /api/admin/coupons */
export async function GET(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  const coupons = await db.coupon.findMany({ orderBy: { createdAt: "desc" } });
  return ok(coupons);
}

/** POST /api/admin/coupons — create coupon */
export async function POST(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const body = (await req.json()) as {
    code?: string; type?: string; value?: number; description?: string;
    maxUses?: number; expiresAt?: string;
  };
  const code = (body.code || "").trim().toUpperCase();
  if (!code) return fail("Coupon code is required");
  if (!body.value || body.value <= 0) return fail("Discount value must be positive");
  if (body.type === "PERCENT" && body.value > 90) return fail("Percentage discount cannot exceed 90%");

  const exists = await db.coupon.findUnique({ where: { code } });
  if (exists) return fail("A coupon with this code already exists");

  const coupon = await db.coupon.create({
    data: {
      code, type: body.type === "FIXED" ? "FIXED" : "PERCENT",
      value: Number(body.value),
      description: body.description || "",
      maxUses: Number(body.maxUses || 100),
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    },
  });
  return ok(coupon, 201);
}

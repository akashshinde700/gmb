import { db } from "@/lib/db";
import { fail, getSessionUser, ok } from "@/lib/auth";

async function requireAdmin(req: Request) {
  const session = await getSessionUser(req);
  if (!session) return { error: fail("Unauthorized", 401) as Response };
  if (session.role !== "ADMIN") return { error: fail("Admin access required", 403) as Response };
  return { session };
}

/** GET /api/admin/platform-leads — leads captured by the SaaS's own website */
export async function GET(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  const leads = await db.platformLead.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  return ok(leads);
}

/** PATCH — update status */
export async function PATCH(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  const body = (await req.json()) as { id?: string; status?: string };
  if (!body.id) return fail("Lead id required");
  const status = ["NEW", "CONTACTED", "CONVERTED", "CLOSED"].includes(body.status || "") ? body.status! : "NEW";
  const lead = await db.platformLead.update({ where: { id: body.id }, data: { status } });
  return ok(lead);
}

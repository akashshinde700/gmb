import { db } from "@/lib/db";
import { fail, getSessionUser, ok } from "@/lib/auth";
import { serializeTemplate } from "@/lib/serialize";

async function requireAdmin(req: Request) {
  const session = await getSessionUser(req);
  if (!session) return { error: fail("Unauthorized", 401) as Response };
  if (session.role !== "ADMIN") return { error: fail("Admin access required", 403) as Response };
  return { session };
}

/** PUT /api/admin/templates/[id] — edit template fields */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  const { id } = await params;

  const template = await db.template.findUnique({ where: { id } });
  if (!template) return fail("Template not found", 404);

  const body = (await req.json()) as {
    name?: string; category?: string; description?: string; premium?: boolean;
    gradient?: string; active?: boolean; sortOrder?: number;
  };

  if (body.name !== undefined && (typeof body.name !== "string" || body.name.trim().length < 2)) {
    return fail("Template name must be at least 2 characters");
  }
  if (body.gradient !== undefined && (typeof body.gradient !== "string" || !body.gradient.trim())) {
    return fail("Gradient must be a non-empty string");
  }

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name.trim();
  if (body.category !== undefined) data.category = body.category;
  if (body.description !== undefined) data.description = body.description;
  if (body.premium !== undefined) data.premium = Boolean(body.premium);
  if (body.gradient !== undefined) data.gradient = body.gradient;
  if (body.active !== undefined) data.active = Boolean(body.active);
  if (body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder);

  const updated = await db.template.update({ where: { id }, data });
  return ok(serializeTemplate(updated));
}

/** DELETE /api/admin/templates/[id] — blocked while businesses still reference it */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  const { id } = await params;

  const template = await db.template.findUnique({ where: { id } });
  if (!template) return fail("Template not found", 404);

  const inUseCount = await db.business.count({ where: { templateId: id } });
  if (inUseCount > 0) {
    return fail(`${inUseCount} businesses are using this template — set another one first`);
  }

  await db.template.delete({ where: { id } });
  return ok({ deleted: true });
}

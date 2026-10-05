import { db } from "@/lib/db";
import { serializeTemplate } from "@/lib/serialize";
import { audit, HttpError, ok, readJson, requireAdmin, route, str } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

/** PUT /api/admin/templates/[id] — edit template fields */
export const PUT = route(async (req: Request, { params }: Params) => {
  const admin = await requireAdmin(req);
  const { id } = await params;

  const template = await db.template.findUnique({ where: { id } });
  if (!template) throw new HttpError("Template not found", 404);

  const body = await readJson<{
    name?: string; category?: string; description?: string; premium?: boolean;
    gradient?: string; active?: boolean; sortOrder?: number;
  }>(req);

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = str(body.name, 80);
    if (name.length < 2) throw new HttpError("Template name must be at least 2 characters");
    data.name = name;
  }
  if (body.gradient !== undefined) {
    const gradient = str(body.gradient, 120);
    if (!gradient) throw new HttpError("Gradient must be a non-empty string");
    data.gradient = gradient;
  }
  if (body.category !== undefined) data.category = str(body.category, 60);
  if (body.description !== undefined) data.description = str(body.description, 300);
  if (body.premium !== undefined) data.premium = Boolean(body.premium);
  if (body.active !== undefined) data.active = Boolean(body.active);
  if (body.sortOrder !== undefined) {
    const value = Number(body.sortOrder);
    if (!Number.isFinite(value)) throw new HttpError("sortOrder must be a number");
    data.sortOrder = Math.trunc(value);
  }
  if (!Object.keys(data).length) throw new HttpError("Nothing to update");

  const updated = await db.template.update({ where: { id }, data });
  await audit({ actor: admin.id, action: "TEMPLATE_UPDATE", entity: "template", entityId: id, meta: { fields: Object.keys(data) } });
  return ok(serializeTemplate(updated));
});

/** DELETE /api/admin/templates/[id] — blocked while businesses still reference it */
export const DELETE = route(async (req: Request, { params }: Params) => {
  const admin = await requireAdmin(req);
  const { id } = await params;

  const template = await db.template.findUnique({ where: { id } });
  if (!template) throw new HttpError("Template not found", 404);

  const inUseCount = await db.business.count({ where: { templateId: id } });
  if (inUseCount > 0) {
    throw new HttpError(`${inUseCount} businesses are using this template — set another one first`, 409);
  }

  await db.template.delete({ where: { id } });
  await audit({ actor: admin.id, action: "TEMPLATE_DELETE", entity: "template", entityId: id, meta: { slug: template.slug } });
  return ok({ deleted: true });
});

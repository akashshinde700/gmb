import { delegate, isContentType, sanitize } from "@/lib/content";
import { HttpError, ok, readJson, requireBusiness, requireUser, route } from "@/lib/api";

type Params = { params: Promise<{ type: string; id: string }> };

/** Resolve a row that belongs to the session's own business, or 404. */
async function ownedRow(req: Request, params: Params["params"]) {
  const { type, id } = await params;
  if (!isContentType(type)) throw new HttpError("Invalid content type", 404);
  const session = await requireUser(req);
  const business = await requireBusiness(session);

  // Tenant isolation: the lookup is scoped by businessId, so an id belonging to
  // another tenant reads as "not found" rather than being editable.
  const existing = await delegate(type).findFirst({ where: { id, businessId: business.id } });
  if (!existing) throw new HttpError("Item not found", 404);
  return { type, id, existing };
}

export const PUT = route(async (req: Request, { params }: Params) => {
  const { type, id, existing } = await ownedRow(req, params);

  const body = await readJson<Record<string, unknown>>(req);
  const data = sanitize(type, body) as Record<string, unknown>;

  if (type === "blog") {
    const previous = existing as { publishedAt: Date | null };
    if (data.published === true) data.publishedAt = previous.publishedAt ?? new Date();
    if (data.published === false) data.publishedAt = null;
  }

  const row = await delegate(type).update({ where: { id }, data: data });
  return ok(row);
});

export const DELETE = route(async (req: Request, { params }: Params) => {
  const { type, id } = await ownedRow(req, params);
  await delegate(type).delete({ where: { id } });
  return ok({ deleted: id });
});

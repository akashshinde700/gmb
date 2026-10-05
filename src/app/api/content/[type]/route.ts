import { db } from "@/lib/db";
import {
  assertCreatable, delegate, isContentType, MAX_ROWS_PER_TYPE, orderFor, sanitize,
} from "@/lib/content";
import { HttpError, ok, pageParams, readJson, requireBusiness, requireUser, route } from "@/lib/api";

export const GET = route(async (req: Request, { params }: { params: Promise<{ type: string }> }) => {
  const { type } = await params;
  if (!isContentType(type)) throw new HttpError("Invalid content type", 404);
  const session = await requireUser(req);
  const business = await requireBusiness(session);
  const { take, skip } = pageParams(req, MAX_ROWS_PER_TYPE, MAX_ROWS_PER_TYPE);

  const rows = await delegate(type).findMany({
    where: { businessId: business.id },
    orderBy: orderFor(type),
    take,
    skip,
  });
  return ok(rows);
});

export const POST = route(async (req: Request, { params }: { params: Promise<{ type: string }> }) => {
  const { type } = await params;
  if (!isContentType(type)) throw new HttpError("Invalid content type", 404);
  const session = await requireUser(req);
  const business = await requireBusiness(session);

  const existingCount = await delegate(type).count({ where: { businessId: business.id } });
  if (existingCount >= MAX_ROWS_PER_TYPE) {
    throw new HttpError(`You have reached the limit of ${MAX_ROWS_PER_TYPE} items for this section`, 409);
  }

  const body = await readJson<Record<string, unknown>>(req);
  const data = sanitize(type, body) as Record<string, unknown>;
  assertCreatable(type, data);

  const createData: Record<string, unknown> = { ...data, businessId: business.id };

  if (type === "blog") {
    createData.publishedAt = data.published ? new Date() : null;
    // Unique slug per business — the DB enforces @@unique([businessId, slug]),
    // this only makes the suffix predictable instead of erroring at the user.
    const base = (data.slug as string) || "post";
    let slug = base;
    let i = 1;
    while (await db.blogPost.findFirst({ where: { businessId: business.id, slug }, select: { id: true } })) {
      i += 1;
      slug = `${base}-${i}`;
      if (i > 50) throw new HttpError("Could not generate a unique post URL — change the title");
    }
    createData.slug = slug;
  }

  const row = await delegate(type).create({ data: createData });
  return ok(row, 201);
});

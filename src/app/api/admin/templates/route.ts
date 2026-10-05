import { db } from "@/lib/db";
import { serializeTemplate } from "@/lib/serialize";
import { audit, HttpError, ok, readJson, requireAdmin, route, str } from "@/lib/api";

export const GET = route(async (req: Request) => {
  await requireAdmin(req);
  const templates = await db.template.findMany({ orderBy: { sortOrder: "asc" } });
  return ok(templates.map(serializeTemplate));
});

export const POST = route(async (req: Request) => {
  const admin = await requireAdmin(req);

  const body = await readJson<{
    name?: string; category?: string; description?: string; premium?: boolean; gradient?: string;
  }>(req);

  const name = str(body.name, 80);
  if (name.length < 2) throw new HttpError("Template name must be at least 2 characters");

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!slug) throw new HttpError("Template name must contain letters or numbers");
  const exists = await db.template.findUnique({ where: { slug } });
  if (exists) throw new HttpError("A template with this name already exists", 409);

  const template = await db.template.create({
    data: {
      name,
      slug,
      category: str(body.category, 60) || "local",
      description: str(body.description, 300),
      premium: Boolean(body.premium),
      gradient: str(body.gradient, 120) || "from-emerald-500 to-teal-600",
      themeJson: JSON.stringify({ primary: "#059669", secondary: "#0f766e", accent: "#f59e0b" }),
      sortOrder: (await db.template.count()) + 1,
    },
  });
  await audit({ actor: admin.id, action: "TEMPLATE_CREATE", entity: "template", entityId: template.id, meta: { slug } });
  return ok(serializeTemplate(template), 201);
});

import { db } from "@/lib/db";
import { fail, getSessionUser, ok } from "@/lib/auth";
import { serializeTemplate } from "@/lib/serialize";

async function requireAdmin(req: Request) {
  const session = await getSessionUser(req);
  if (!session) return { error: fail("Unauthorized", 401) as Response };
  if (session.role !== "ADMIN") return { error: fail("Admin access required", 403) as Response };
  return { session };
}

export async function GET(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  const templates = await db.template.findMany({ orderBy: { sortOrder: "asc" } });
  return ok(templates.map(serializeTemplate));
}

export async function POST(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const body = (await req.json()) as {
    name?: string; category?: string; description?: string; premium?: boolean; gradient?: string;
  };
  if (!body.name) return fail("Template name is required");

  const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const exists = await db.template.findUnique({ where: { slug } });
  if (exists) return fail("A template with this name already exists");

  const template = await db.template.create({
    data: {
      name: body.name, slug, category: body.category || "local",
      description: body.description || "",
      premium: Boolean(body.premium),
      gradient: body.gradient || "from-emerald-500 to-teal-600",
      themeJson: JSON.stringify({ primary: "#059669", secondary: "#0f766e", accent: "#f59e0b" }),
      sortOrder: (await db.template.count()) + 1,
    },
  });
  return ok(serializeTemplate(template), 201);
}

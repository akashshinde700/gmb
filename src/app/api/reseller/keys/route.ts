import { db } from "@/lib/db";
import { HttpError, limitOrThrow, ok, readJson, requireUser, route, str } from "@/lib/api";
import { createApiKey } from "@/lib/reseller";

/**
 * API keys for the reseller's own product.
 *
 * GET  /api/reseller/keys — the keys that exist (never the keys themselves)
 * POST /api/reseller/keys — mint one; the plaintext is in this response only
 *
 * Deliberately not a full key-management API: an agency needs a handful of
 * keys, one per environment, and needs to be able to kill a leaked one. That is
 * the whole surface.
 */

async function ownReseller(req: Request) {
  const session = await requireUser(req);
  const reseller = await db.reseller.findUnique({ where: { userId: session.id } });
  if (!reseller) throw new HttpError("This account is not set up as a reseller", 403);
  return reseller;
}

export const GET = route(async (req: Request) => {
  const reseller = await ownReseller(req);
  const keys = await db.apiKey.findMany({
    where: { resellerId: reseller.id },
    select: { id: true, label: true, prefix: true, lastUsedAt: true, revokedAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return ok({
    keys: keys.map((k) => ({
      id: k.id, label: k.label, prefix: k.prefix, createdAt: k.createdAt.toISOString(),
      lastUsedAt: k.lastUsedAt?.toISOString() ?? null, revoked: Boolean(k.revokedAt),
    })),
  });
});

export const POST = route(async (req: Request) => {
  const reseller = await ownReseller(req);
  limitOrThrow(req, `reseller:keys:${reseller.id}`, 20, 60 * 60 * 1000);

  const body = await readJson<{ label?: string }>(req);
  const label = str(body.label, 60).trim() || "API key";
  const { key, hash, prefix } = createApiKey();

  const row = await db.apiKey.create({
    data: { resellerId: reseller.id, label, hash, prefix },
    select: { id: true, label: true, prefix: true, createdAt: true },
  });

  return ok(
    {
      key,
      apiKey: { id: row.id, label: row.label, prefix: row.prefix, createdAt: row.createdAt.toISOString() },
      note: "Copy this key now — it is not shown again. Send it as `Authorization: Bearer <key>`.",
    },
    201,
  );
});

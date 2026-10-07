import { db } from "@/lib/db";
import { requireBusiness, requireUser, route, str } from "@/lib/api";
import { ordersCsv } from "@/lib/commerce";

/**
 * GET /api/orders/export — the order book as a CSV.
 *
 * Sent as a download rather than rendered, because the shop's accountant wants
 * the file, not a page. Capped at 5,000 rows per download: a shop with more than
 * that exports by month, and the cap is what keeps one request from loading a
 * year of history into memory.
 */
export const GET = route(async (req: Request) => {
  const session = await requireUser(req);
  const business = await requireBusiness(session);
  const { searchParams } = new URL(req.url);
  const status = str(searchParams.get("status"), 20);

  const rows = await db.order.findMany({
    where: {
      businessId: business.id,
      ...(status && status !== "ALL" && status !== "OPEN" ? { status } : {}),
      ...(status === "OPEN" ? { status: { notIn: ["DELIVERED", "CANCELLED"] } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  const csv = ordersCsv(
    rows.map((row) => ({
      id: row.id,
      number: row.number,
      customerName: row.customerName,
      phone: row.phone,
      status: row.status,
      payment: row.payment,
      paymentStatus: row.paymentStatus,
      total: row.total,
      createdAt: row.createdAt,
      itemsJson: row.itemsJson,
    })),
  );

  const slug = business.slug.replace(/[^a-z0-9-]/gi, "");
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="orders-${slug}-${stamp}.csv"`,
      // A stale shop's order book must never be served from a cache.
      "cache-control": "no-store",
    },
  });
});

export const dynamic = "force-dynamic";

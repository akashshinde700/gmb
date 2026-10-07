import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import OrderTracker from "@/components/site/order-tracker";
import { loadPublishedSite } from "@/lib/site-payload";

/**
 * The shop's own "track your order" page, at /s/<slug>/order.
 *
 * On the tenant's domain this is /order — the address the shop puts on the
 * receipt and in the WhatsApp confirmation. It is deliberately tiny: no header
 * navigation, no marketing, because somebody arriving here is worried about
 * something they paid for and wants one answer.
 */

export const revalidate = 60;

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const payload = await loadPublishedSite(slug);
  if (!payload) return { title: "Order not found", robots: { index: false, follow: false } };
  return {
    title: `Track your order — ${payload.business.name}`,
    robots: { index: false, follow: false },
  };
}

export default async function TrackOrderPage({ params }: Params) {
  const { slug } = await params;
  const payload = await loadPublishedSite(slug);
  if (!payload) notFound();
  const { business } = payload;

  return (
    <main className="flex min-h-screen flex-col items-center bg-[var(--brand-surface,#f8f7f4)] px-4 py-12">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
        <Link href={`/s/${business.slug}`} className="text-sm font-medium text-[var(--brand-primary)] underline underline-offset-2">
          ← {business.name}
        </Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-[var(--brand-heading,var(--brand-secondary))]">
          Track your order
        </h1>
        <p className="mt-1 text-sm text-[var(--brand-subheading,var(--brand-muted))]">
          Enter the order number from your confirmation to see where it is.
        </p>
        <div className="mt-6">
          <OrderTracker slug={business.slug} shopPhone={business.phone || business.whatsapp || ""} />
        </div>
      </div>
    </main>
  );
}

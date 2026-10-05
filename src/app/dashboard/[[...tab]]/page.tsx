import type { Metadata } from "next";
import { notFound } from "next/navigation";
import DashboardView from "@/components/views/dashboard-view";
import RouteSync from "@/components/route-sync";
import { requirePageBusiness } from "@/lib/guard";
import { DASHBOARD_TABS, isDashboardTab, tabTitle } from "@/lib/console-tabs";

/**
 * The business owner's console.
 *
 * One optional catch-all segment rather than fourteen page files: the tab slug
 * is the only thing that varies, the view is the same, and fourteen near-copies
 * would drift apart the first time one of them was edited.
 *
 * The tab is validated here so /dashboard/nonsense is a 404 rather than a page
 * that silently shows Overview — a wrong URL should say so.
 */

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ tab?: string[] }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { tab } = await params;
  const slug = tab?.[0] ?? "overview";
  return {
    title: isDashboardTab(slug) ? `${tabTitle(slug)} — WebSetu` : "WebSetu",
    robots: { index: false, follow: false },
  };
}

export default async function DashboardPage({ params }: Params) {
  const { tab } = await params;

  // A deeper path than one segment is not a tab, it is a typo.
  if (tab && tab.length > 1) notFound();

  const slug = tab?.[0] ?? "overview";
  if (!isDashboardTab(slug)) notFound();

  // Decided on the server: a signed-out visitor is redirected before any HTML
  // is produced, so there is no loading screen on the way to login.
  await requirePageBusiness(slug === "overview" ? "/dashboard" : `/dashboard/${slug}`);

  return (
    <>
      <RouteSync view="dashboard" dashboardTab={slug} />
      <DashboardView />
    </>
  );
}

/** Pre-render the tab list so the router knows every valid path. */
export function generateStaticParams() {
  return DASHBOARD_TABS.map((t) => ({ tab: t === "overview" ? [] : [t] }));
}

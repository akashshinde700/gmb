import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AdminView from "@/components/views/admin-view";
import RouteSync from "@/components/route-sync";
import { requirePageAdmin } from "@/lib/guard";
import { ADMIN_TABS, isAdminTab, tabTitle } from "@/lib/console-tabs";

/** The platform admin console. Same shape as the dashboard route. */

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ tab?: string[] }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { tab } = await params;
  const slug = tab?.[0] ?? "overview";
  return {
    title: isAdminTab(slug) ? `${tabTitle(slug)} — WebSetu Admin` : "WebSetu Admin",
    robots: { index: false, follow: false },
  };
}

export default async function AdminPage({ params }: Params) {
  const { tab } = await params;
  if (tab && tab.length > 1) notFound();

  const slug = tab?.[0] ?? "overview";
  if (!isAdminTab(slug)) notFound();

  // A customer who follows a stale /admin link is sent to their own dashboard
  // rather than shown an error they can do nothing about.
  await requirePageAdmin(slug === "overview" ? "/admin" : `/admin/${slug}`);

  return (
    <>
      <RouteSync view="admin" adminTab={slug} />
      <AdminView />
    </>
  );
}

export function generateStaticParams() {
  return ADMIN_TABS.map((t) => ({ tab: t === "overview" ? [] : [t] }));
}

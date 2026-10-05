import type { Metadata } from "next";
import SiteView from "@/components/views/site-view";
import RouteSync from "@/components/route-sync";
import { requirePageUser } from "@/lib/guard";

/**
 * Owner preview of a tenant website.
 *
 * Deliberately a different path from the public /s/[slug]: this one serves
 * sites that are not published yet, so it requires a session and is never
 * indexed. Two URLs for two genuinely different things, rather than one URL
 * that behaves differently depending on who is asking.
 *
 * The API behind SiteView does its own ownership check — a signed-in customer
 * cannot preview somebody else's unpublished site just by knowing the slug.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Preview — WebSetu",
  robots: { index: false, follow: false },
};

type Params = { params: Promise<{ slug: string }> };

export default async function PreviewPage({ params }: Params) {
  const { slug } = await params;
  await requirePageUser(`/preview/${slug}`);

  return (
    <>
      <RouteSync view="site" />
      <SiteView slug={slug} />
    </>
  );
}

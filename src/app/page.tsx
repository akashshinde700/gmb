import { headers } from "next/headers";
import LandingClient from "@/components/views/landing-client";
import { currentUser } from "@/lib/guard";
import { readPlatformTheme } from "@/lib/platform-theme-server";
import { brandForHost } from "@/lib/reseller";
import { db } from "@/lib/db";

/**
 * The marketing page.
 *
 * This route used to be the whole application: six views behind a hash, none of
 * them bookmarkable, and a spinner in front of all of them until the session
 * resolved. The console now lives at /dashboard, /admin, /login and /onboarding
 * as real pages, so this is the landing page again.
 *
 * A server component so the session is resolved here rather than fetched from
 * the browser. The page needs it only to choose between "Start free" and "Go to
 * dashboard", and asking over the network meant every anonymous visitor — most
 * of this page's traffic — triggered a 401 on the busiest URL in the product.
 */

export const dynamic = "force-dynamic";

export default async function Page() {
  // Which host the visitor arrived on decides whose brand the page wears: the
  // platform's, or — when an agency's domain points here — the agency's.
  const host = (await headers()).get("host");
  const [user, platformTheme, brand, publishedPosts] = await Promise.all([
    currentUser(),
    readPlatformTheme(host),
    brandForHost(host),
    // Only to decide whether the header shows a Blog link. Counting is cheaper
    // than loading the posts, and this page does not render them.
    db.platformPost.count({ where: { published: true } }).catch(() => 0),
  ]);
  return (
    <LandingClient
      user={user}
      platformTheme={platformTheme}
      brand={brand}
      hasBlogPosts={publishedPosts > 0}
    />
  );
}

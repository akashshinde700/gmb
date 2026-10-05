import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveHost } from "@/lib/domains";

/**
 * Customer-domain routing.
 *
 * A tenant site lives at /s/<slug>. When a request arrives on a customer's own
 * domain, this rewrites it onto that path so `www.example.com/` serves the same
 * page as `/s/example`, without a redirect and without the visitor ever seeing
 * the internal path.
 *
 * Proxy runs on the Node.js runtime in Next 16, so the lookup can go straight
 * to the database; `resolveHost` caches it because this runs on every request.
 *
 * Requests on the platform's own hostnames fall through untouched, which keeps
 * the dashboard, the marketing site and the API exactly as they were.
 */

/**
 * Paths that must never be rewritten onto a tenant, whichever host they arrive
 * on: the API (including the hostname check a TLS front-end can ask before
 * issuing a certificate) and Next's own assets.
 *
 * robots.txt and sitemap.xml are deliberately absent. Both exist as platform
 * files, and on a customer's domain both must be the tenant's own — a crawler
 * on example.com being handed the platform's robots.txt, pointing at the
 * platform sitemap, is how a customer's pages stay unindexed.
 */
const PASSTHROUGH = /^\/(api|_next|favicon\.ico|logo\.svg)(\/|$)/;

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PASSTHROUGH.test(pathname)) return NextResponse.next();

  const route = await resolveHost(request.headers.get("host"));
  if (!route) return NextResponse.next();

  // A business may hold several domains. One is primary; the others send the
  // visitor there permanently, so the site is never indexed twice under two
  // names and link equity lands in one place. 308 preserves the method.
  if (route.primaryHost) {
    const url = request.nextUrl.clone();
    url.host = route.primaryHost;
    url.port = "";
    url.protocol = "https:";
    return NextResponse.redirect(url, 308);
  }

  const url = request.nextUrl.clone();

  // The tenant's own sitemap and robots, served at the root of their domain
  // rather than the platform's.
  if (pathname === "/robots.txt") {
    url.pathname = `/s/${route.slug}/robots.txt`;
    return NextResponse.rewrite(url);
  }
  if (pathname === "/sitemap.xml") {
    url.pathname = `/s/${route.slug}/sitemap.xml`;
    return NextResponse.rewrite(url);
  }

  // Everything else hangs off the tenant's site root: "/" -> /s/<slug>,
  // "/blog/post" -> /s/<slug>/blog/post.
  url.pathname = `/s/${route.slug}${pathname === "/" ? "" : pathname}`;
  url.search = search;

  const response = NextResponse.rewrite(url);
  // Pages read this to build canonical URLs and absolute links on the domain
  // the visitor is actually using, not the internal path.
  response.headers.set("x-websetu-host", route.primaryHost ?? "");
  return response;
}

export const config = {
  // Static assets and the API are excluded here as well as in the handler, so
  // the common case never runs the lookup at all.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};

import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AuthView from "@/components/views/auth-view";
import RouteSync from "@/components/route-sync";
import { currentUser } from "@/lib/guard";
import { readPlatformTheme } from "@/lib/platform-theme-server";
import { brandForHost } from "@/lib/reseller";

/**
 * Sign in / register.
 *
 * An already-signed-in visitor is sent straight to where they belong instead of
 * being shown a login form they do not need — following a stale /login link
 * while signed in used to leave people staring at an empty form.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

type Params = { searchParams: Promise<{ next?: string; reset?: string }> };

export default async function LoginPage({ searchParams }: Params) {
  const { next, reset } = await searchParams;

  // A reset link must always reach the form, even for a signed-in browser:
  // that is precisely the case where someone is trying to change a password
  // they no longer trust.
  if (!reset) {
    const user = await currentUser();
    if (user) {
      // Only same-origin paths are honoured, so ?next= cannot be used to bounce
      // a signed-in user to another site.
      const target = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
      redirect(target ?? (user.role === "ADMIN" ? "/admin" : "/dashboard"));
    }
  }

  const host = (await headers()).get("host");
  const [platformTheme, brand] = await Promise.all([readPlatformTheme(host), brandForHost(host)]);

  return (
    <>
      <RouteSync view="auth" />
      <AuthView platformTheme={platformTheme} brand={brand} />
    </>
  );
}

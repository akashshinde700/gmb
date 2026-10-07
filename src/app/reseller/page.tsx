import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import ResellerConsole from "@/components/views/reseller-console";
import { currentUser } from "@/lib/guard";
import { brandForHost } from "@/lib/reseller";

/**
 * The reseller console.
 *
 * A reseller is an ordinary account with the reseller flag on it, so the guard
 * is the same one every signed-in page uses plus a role check. The page is
 * deliberately outside /dashboard: an agency's day-to-day is their own clients
 * and keys, not their own business listing.
 */

export async function generateMetadata(): Promise<Metadata> {
  const brand = await brandForHost((await headers()).get("host"));
  return {
    title: `Reseller console — ${brand.whiteLabel ? brand.name : "WebSetu"}`,
    robots: { index: false, follow: false },
  };
}

export default async function ResellerPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/reseller");

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Reseller</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Build websites for your clients</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Create a site for any client with one API call — the website, its Google presence and its lead inbox are
          yours to hand over. Your brand is on every page they see, and the platform&apos;s name is nowhere.
        </p>
      </div>

      {user.role === "RESELLER" ? (
        <ResellerConsole />
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-sm font-semibold text-amber-900">This account is not set up as a reseller yet</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-amber-800">
            Reseller access is enabled by the platform team on an existing account — there is no separate signup.
            Ask us to turn it on for this email address and it appears here.
          </p>
          <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium text-amber-900 underline underline-offset-2">
            Back to your dashboard
          </Link>
        </div>
      )}
    </main>
  );
}

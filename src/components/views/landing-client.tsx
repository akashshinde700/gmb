"use client";
// WebSetu — the client half of the marketing page.
//
// Split out so `/` can be a server component. The landing page needs to know
// whether the visitor is signed in (the header CTA reads "Go to dashboard"
// rather than "Start free"), and it used to answer that by calling
// /api/auth/me from the browser — which, for the anonymous visitor that most
// of this page's traffic is, meant a guaranteed 401 on the busiest page in the
// product. The server already knows, so it says so instead of being asked.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import LandingView from "@/components/views/landing-view";
import { installNavigator, pathForLegacyHash, useApp } from "@/store/app-store";
import type { SessionUser } from "@/lib/types";
import type { PlatformTheme } from "@/lib/platform-theme";
import type { Brand } from "@/lib/reseller";

export default function LandingClient({
  user,
  platformTheme,
  brand,
  hasBlogPosts = false,
}: {
  user: SessionUser | null;
  platformTheme: PlatformTheme;
  /** Whose brand this page wears — the platform's, or a reseller's on their domain. */
  brand?: Brand;
  hasBlogPosts?: boolean;
}) {
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    installNavigator((path) => router.push(path));
  }, [router]);

  useEffect(() => {
    // Seed the store from what the server already resolved, so the header
    // renders the right call to action on first paint.
    if (user) useApp.setState({ user, hydrated: true });
    else useApp.setState({ hydrated: true });
  }, [user]);

  useEffect(() => {
    // Links of the form /#/dashboard went out in lead alerts, welcome mail and
    // subscription notices before the console had real URLs. Those messages are
    // in people's inboxes for good, so this translation is permanent, not a
    // migration step.
    const legacy = pathForLegacyHash(window.location.hash);
    if (!legacy) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRedirecting(true);
    // replace, not push: the hash URL should not sit in history waiting for the
    // Back button to bounce the visitor around.
    router.replace(legacy);
  }, [router]);

  if (redirecting) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#fafaf9]">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-xl font-bold text-white">
          W
        </div>
        <p className="text-sm text-zinc-500">Taking you to your dashboard…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-white text-zinc-900">
      <LandingView platformTheme={platformTheme} brand={brand} hasBlogPosts={hasBlogPosts} />
    </div>
  );
}

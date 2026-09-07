"use client";
// WebSetu — App shell. Single visible route (/) with hash-based view routing.
// Views: home (SaaS landing) | auth | onboarding | dashboard | admin | site (tenant website)
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useApp } from "@/store/app-store";
import LandingView from "@/components/views/landing-view";
import AuthView from "@/components/views/auth-view";
import OnboardingView from "@/components/views/onboarding-view";
import DashboardView from "@/components/views/dashboard-view";
import AdminView from "@/components/views/admin-view";
import SiteView from "@/components/views/site-view";

export default function Page() {
  const view = useApp((s) => s.view);
  const hydrated = useApp((s) => s.hydrated);
  const user = useApp((s) => s.user);
  const business = useApp((s) => s.business);
  const hydrate = useApp((s) => s.hydrate);
  const setView = useApp((s) => s.setView);
  const setSiteSlug = useApp((s) => s.siteSlug);

  // hydrate session on first load + listen to hash changes
  useEffect(() => {
    hydrate();
    const onHash = () => {
      const h = window.location.hash.replace(/^#\/?/, "");
      if (h.startsWith("site/")) {
        setView("site");
        useApp.setState({ siteSlug: h.slice(5) });
      } else if (h.startsWith("dashboard")) setView("dashboard");
      else if (h.startsWith("admin")) setView("admin");
      else if (h.startsWith("onboarding")) setView("onboarding");
      else if (h.startsWith("login")) setView("auth");
      else setView("home");
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [hydrate, setView]);

  if (!hydrated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#fafaf9]">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 font-bold text-white text-xl">W</div>
        <p className="font-semibold text-zinc-800">WebSetu</p>
        <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
      </div>
    );
  }

  // Route guards
  let content: React.ReactNode;
  if (view === "dashboard") {
    if (!user) content = <AuthView />;
    else if (!business) content = <OnboardingView />;
    else content = <DashboardView />;
  } else if (view === "admin") {
    if (!user || user.role !== "ADMIN") content = <AuthView />;
    else content = <AdminView />;
  } else if (view === "onboarding") {
    if (!user) content = <AuthView />;
    else content = <OnboardingView />;
  } else if (view === "site") {
    content = <SiteView slug={setSiteSlug || ""} />;
  } else if (view === "auth") {
    content = <AuthView />;
  } else {
    content = <LandingView />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-white text-zinc-900">
      {content}
    </div>
  );
}

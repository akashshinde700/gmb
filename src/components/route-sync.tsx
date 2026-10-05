"use client";
// WebSetu — keeps the zustand store in step with the URL, and makes sure the
// session is loaded before the console tries to render.
//
// The console used to live at "/" with its section held in hash + component
// state, so nothing was bookmarkable, refresh lost your place and Back did not
// return to the previous tab. Now the URL owns that state.
//
// The flow is deliberately one-directional:
//
//     URL  ──(this component)──▶  store  ──▶  views
//     nav item ──▶ store.setDashboardTab ──▶ router.push ──▶ URL
//
// The store never writes to the URL in response to the URL changing, which is
// what would otherwise turn Back into a fight between the two.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { installNavigator, useApp, type AdminTab, type DashboardTab, type View } from "@/store/app-store";

export default function RouteSync({
  view,
  dashboardTab,
  adminTab,
}: {
  view: View;
  dashboardTab?: DashboardTab;
  adminTab?: AdminTab;
}) {
  const router = useRouter();
  const user = useApp((s) => s.user);
  const hydrated = useApp((s) => s.hydrated);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    // Hand the router to the store, which cannot call hooks of its own.
    installNavigator((path) => router.push(path));
  }, [router]);

  useEffect(() => {
    // `syncTabs` rather than `setDashboardTab`: this is reacting to a URL that
    // already exists, so pushing another history entry would double it up and
    // make Back need two presses.
    useApp.getState().syncTabs({
      view,
      ...(dashboardTab ? { dashboardTab } : {}),
      ...(adminTab ? { adminTab } : {}),
    });
  }, [view, dashboardTab, adminTab]);

  useEffect(() => {
    // Load the session if this is a cold arrival.
    //
    // Signing in populates the store and then navigates, so the store is warm
    // on that path. Opening a bookmark, refreshing, or following a link from
    // email is a cold start — and the console views return null without a
    // business, so without this a bookmarked /dashboard/leads rendered a blank
    // page. The server guard has already established that the visitor is
    // signed in by the time this runs.
    // Not on the login page: a visitor there is signed out by definition, so
    // asking who they are is a guaranteed 401 on every view of it. The server
    // guard has already sent anyone with a session elsewhere.
    //
    // Decided ONCE per mount, and deliberately not re-run when `user` changes.
    // Logging out sets user to null while this component is still mounted, and
    // an effect that watched `user` treated that as a cold start and asked the
    // server who was signed in — with a cookie the browser had not finished
    // clearing yet. /api/auth/me answered 200, the session went straight back
    // into the store, and the landing page the visitor was being sent to
    // greeted them with a "Dashboard" button they had just logged out of.
    if (view === "auth" || started) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStarted(true);
    // A warm store means signing in populated it a moment ago; nothing to load.
    if (useApp.getState().user) return;
    void useApp.getState().hydrate();
  }, [started, view]);

  // Cold start: hold a spinner rather than letting the view flash its own empty
  // state before the session arrives.
  if (view !== "auth" && !user && !hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/70">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    );
  }

  return null;
}

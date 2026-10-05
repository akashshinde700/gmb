"use client";
// WebSetu — "you are inside a customer's account" banner.
//
// It lives in the console shells rather than in the Customers tab that starts a
// support visit, because that tab unmounts the moment the admin clicks anything
// else in the sidebar — taking the only warning with it. That is exactly what
// happened the first time this shipped: an admin opened a customer, came back
// to the admin console, switched to Appearance, and every click was refused
// with "Admin access required" by a screen that still said Super Admin.
//
// A browser has one cookie jar, so opening a customer changes who the whole
// browser is, in every tab. Any admin console still on screen is a picture of a
// session that no longer exists. This says so, and offers the way back.

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useApp } from "@/store/app-store";
import { toast } from "@/hooks/use-toast";
import { errMsg } from "@/components/views/console-ui";

export default function SupportVisitBanner() {
  const impersonating = useApp((s) => s.impersonating);
  const user = useApp((s) => s.user);
  const [busy, setBusy] = useState(false);

  if (!impersonating) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-amber-300 bg-amber-100 px-4 py-2 text-sm text-amber-900"
    >
      <span>
        Support visit — this browser is signed in as{" "}
        <strong>{user?.name || user?.email || "a customer"}</strong>, in every tab.
      </span>
      <Button
        size="sm"
        className="h-7"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void useApp
            .getState()
            .returnToAdmin()
            .catch((e: unknown) => {
              toast({ title: "Could not return to admin", description: errMsg(e), variant: "destructive" });
              setBusy(false);
            });
        }}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
        Return to admin
      </Button>
    </div>
  );
}

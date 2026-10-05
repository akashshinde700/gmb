"use client";

import { useEffect } from "react";

/**
 * Warn before losing work in progress.
 *
 * The website builder, the content editors and the seven-step onboarding wizard
 * all held unsaved edits with nothing standing between them and a closed tab.
 * Dragging sections into place and then hitting Back lost the lot, silently.
 *
 * Deliberately only the browser-level guard. An in-app confirmation on every
 * navigation is the version everybody disables: it fires on the "Save" click
 * itself, on toasts that navigate, on anything that touches the router. The
 * unload prompt fires exactly when work is actually about to be discarded.
 *
 * Pass `false` and nothing is registered at all — no listener, no prompt — so a
 * clean form never nags.
 */
export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      // The modern signal. Browsers show their own wording; a custom message
      // has been ignored for a decade, so none is attempted.
      e.preventDefault();
      // Some older engines still need a returnValue set to trigger the prompt.
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
}

"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary for a render error anywhere under the app router.
 *
 * The message stays generic on purpose — `error.message` from a production
 * build is a minified fragment that helps nobody and can leak internals. The
 * digest is shown instead: it is the id that ties this screen to the server log
 * line, which is what support actually needs from a caller.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] unhandled render error:", error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#fafaf9] px-6 py-16 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-xl font-bold text-white">
        W
      </span>
      <h1 className="mt-6 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
        Something went wrong
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-zinc-600">
        This page could not be displayed. Your data is safe — please try again.
      </p>
      {error.digest && (
        <p className="mt-4 font-mono text-xs text-zinc-400">Reference: {error.digest}</p>
      )}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          Try again
        </button>
        <a
          href="/"
          className="rounded-xl border border-zinc-300 px-5 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-white"
        >
          Back to home
        </a>
      </div>
    </main>
  );
}

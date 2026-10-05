import type { Metadata } from "next";

/**
 * Shown for an unpublished or misspelled tenant address (/s/<slug>), a missing
 * blog post, or any unknown path. The default Next.js 404 is an unstyled black
 * page — a poor look on a product whose whole promise is a presentable website.
 */
export const metadata: Metadata = {
  title: "Page not found — WebSetu",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#fafaf9] px-6 py-16 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-xl font-bold text-white">
        W
      </span>
      <p className="mt-3 text-sm font-semibold tracking-wide text-zinc-500">WEBSETU</p>
      <h1 className="mt-6 text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
        This page is not here
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-zinc-600">
        The address may be mistyped, or the website you are looking for has not been published yet.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <a
          href="/"
          className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          Go to WebSetu
        </a>
        <a
          href="/blog"
          className="rounded-xl border border-zinc-300 px-5 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-white"
        >
          Read the blog
        </a>
      </div>
    </main>
  );
}

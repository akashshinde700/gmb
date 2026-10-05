import type { Metadata } from "next";
import { db } from "@/lib/db";
import { siteOrigin } from "@/lib/site-payload";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "WebSetu Blog — guides for Indian local businesses",
  description:
    "Practical guides on getting your business online: websites, Google Business Profile, local SEO, leads and WhatsApp.",
  alternates: { canonical: `${siteOrigin()}/blog` },
};

function formatDate(value: Date | null): string {
  if (!value) return "";
  return value.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

type PostCard = {
  id: string; title: string; slug: string; excerpt: string;
  cover: string; author: string; publishedAt: Date | null;
};

/**
 * The build prerenders this page, so it must not require a reachable database:
 * a failure here degrades to an empty list and the next revalidation fills it
 * in, rather than taking the whole build (or the page) down.
 */
async function loadPosts(): Promise<PostCard[]> {
  try {
    return await db.platformPost.findMany({
      where: { published: true },
      orderBy: { publishedAt: "desc" },
      select: { id: true, title: true, slug: true, excerpt: true, cover: true, author: true, publishedAt: true },
      take: 50,
    });
  } catch (e) {
    console.error("[blog] could not load posts:", e);
    return [];
  }
}

export default async function BlogIndex() {
  const posts = await loadPosts();

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-zinc-200">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-5 sm:px-6">
          <a href="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 text-lg font-bold text-white">
              W
            </span>
            <span className="text-lg font-bold tracking-tight text-zinc-900">WebSetu</span>
          </a>
          <a href="/#pricing" className="text-sm font-medium text-emerald-700 hover:underline">
            See pricing
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">Blog</h1>
        <p className="mt-3 max-w-2xl text-zinc-600">
          Guides on getting a local business online — websites, Google, SEO, leads and WhatsApp.
        </p>

        {posts.length === 0 ? (
          <p className="mt-12 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-10 text-center text-sm text-zinc-500">
            No posts published yet. Check back soon.
          </p>
        ) : (
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {posts.map((post) => (
              <article
                key={post.id}
                className="flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition hover:shadow-md"
              >
                {post.cover ? (
                  <img src={post.cover} alt="" className="aspect-[16/9] w-full object-cover" loading="lazy" />
                ) : null}
                <div className="flex flex-1 flex-col p-5">
                  <h2 className="text-lg font-semibold text-zinc-900">
                    <a href={`/blog/${post.slug}`} className="hover:text-emerald-700">
                      {post.title}
                    </a>
                  </h2>
                  {post.excerpt ? (
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-zinc-600">{post.excerpt}</p>
                  ) : null}
                  <p className="mt-4 text-xs text-zinc-400">
                    {post.author ? `${post.author} · ` : ""}
                    {formatDate(post.publishedAt)}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { siteOrigin } from "@/lib/site-payload";
import { jsonLdScript } from "@/lib/site-utils";

export const revalidate = 600;

type Params = { params: Promise<{ slug: string }> };

async function loadPost(slug: string) {
  const clean = (slug || "").trim().slice(0, 150);
  if (!clean) return null;
  const post = await db.platformPost.findUnique({ where: { slug: clean } });
  // Drafts are invisible to the public, including by direct URL.
  return post && post.published ? post : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const post = await loadPost(slug);
  if (!post) return { title: "Post not found", robots: { index: false, follow: false } };

  const url = `${siteOrigin()}/blog/${post.slug}`;
  return {
    title: `${post.title} — WebSetu`,
    description: post.excerpt || post.title,
    alternates: { canonical: url },
    openGraph: {
      title: post.title,
      description: post.excerpt || post.title,
      url,
      type: "article",
      publishedTime: post.publishedAt?.toISOString(),
      ...(post.cover ? { images: [{ url: post.cover }] } : {}),
    },
  };
}

export default async function BlogPostPage({ params }: Params) {
  const { slug } = await params;
  const post = await loadPost(slug);
  if (!post) notFound();

  // Post title/excerpt/author are author-supplied text, so the payload is
  // escaped rather than stringified straight into the tag.
  const jsonLd = jsonLdScript({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt || undefined,
    image: post.cover || undefined,
    datePublished: post.publishedAt?.toISOString(),
    dateModified: post.updatedAt.toISOString(),
    author: post.author ? { "@type": "Person", name: post.author } : undefined,
    publisher: { "@type": "Organization", name: "WebSetu" },
    mainEntityOfPage: `${siteOrigin()}/blog/${post.slug}`,
  });

  return (
    <div className="min-h-screen bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <header className="border-b border-zinc-200">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5 sm:px-6">
          <a href="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 text-lg font-bold text-white">
              W
            </span>
            <span className="text-lg font-bold tracking-tight text-zinc-900">WebSetu</span>
          </a>
          <a href="/blog" className="text-sm font-medium text-emerald-700 hover:underline">
            All posts
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <article>
          <h1 className="text-3xl font-bold leading-tight tracking-tight text-zinc-900 sm:text-4xl">{post.title}</h1>
          <p className="mt-3 text-sm text-zinc-500">
            {post.author ? `${post.author} · ` : ""}
            {post.publishedAt?.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
          </p>
          {post.cover ? (
            <img src={post.cover} alt="" className="mt-8 aspect-[16/9] w-full rounded-2xl object-cover" />
          ) : null}
          {/* Stored as plain text and rendered with preserved line breaks rather
              than as HTML, so a post can never inject markup into the page. */}
          <div className="mt-8 whitespace-pre-line text-base leading-relaxed text-zinc-700">{post.content}</div>
        </article>

        <div className="mt-14 rounded-2xl bg-zinc-50 p-6 text-center ring-1 ring-zinc-200">
          <p className="text-lg font-semibold text-zinc-900">Bring your business online in 15 minutes</p>
          <p className="mt-1 text-sm text-zinc-600">Website, Google presence, SEO, leads and WhatsApp in one place.</p>
          <a
            href="/#pricing"
            className="mt-4 inline-flex rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            See pricing
          </a>
        </div>
      </main>
    </div>
  );
}

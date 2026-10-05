import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadTenantPosts } from "@/lib/site-payload";
import { tenantBaseUrl } from "@/lib/site-utils";
import SiteImage from "@/components/site/site-image";

/**
 * A tenant's blog index at /s/[slug]/blog — the hub page that links every post
 * and gives crawlers one place to discover them, alongside the sitemap.
 */

export const revalidate = 300;

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const payload = await loadTenantPosts(slug, 1);
  if (!payload) return { title: "Blog not found", robots: { index: false, follow: false } };

  const { business } = payload;
  return {
    title: `Blog — ${business.name}`,
    description: `Articles, tips and updates from ${business.name}.`,
    alternates: { canonical: `${tenantBaseUrl(business.slug, business.primaryDomain)}/blog` },
    openGraph: {
      title: `Blog — ${business.name}`,
      description: `Articles, tips and updates from ${business.name}.`,
      url: `${tenantBaseUrl(business.slug, business.primaryDomain)}/blog`,
      siteName: business.name,
      type: "website",
      locale: "en_IN",
    },
  };
}

export default async function TenantBlogIndex({ params }: Params) {
  const { slug } = await params;
  const payload = await loadTenantPosts(slug);
  if (!payload) notFound();

  const { business, posts } = payload;

  return (
    <div
      className="min-h-screen bg-white"
      style={
        {
          "--brand-primary": business.brandPrimary,
          "--brand-secondary": business.brandSecondary,
        } as React.CSSProperties
      }
    >
      <header className="border-b border-zinc-200">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <a href={`/s/${business.slug}`} className="flex items-center gap-2.5">
            {business.logoUrl ? (
              <img src={business.logoUrl} alt="" className="h-9 w-9 rounded-xl object-cover" />
            ) : (
              <span
                className="flex h-9 w-9 items-center justify-center rounded-xl text-lg font-bold text-white"
                style={{ background: "var(--brand-primary)" }}
              >
                {business.name.charAt(0)}
              </span>
            )}
            <span className="text-lg font-bold tracking-tight text-zinc-900">{business.name}</span>
          </a>
          <a
            href={`/s/${business.slug}`}
            className="shrink-0 text-sm font-medium hover:underline"
            style={{ color: "var(--brand-primary)" }}
          >
            Back to website
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">Blog</h1>
        <p className="mt-2 text-sm text-zinc-600">Articles, tips and updates from {business.name}.</p>

        {posts.length === 0 ? (
          <p className="mt-12 text-sm text-zinc-500">No articles have been published yet.</p>
        ) : (
          <ul className="mt-10 grid gap-6 sm:grid-cols-2">
            {posts.map((post) => (
              <li key={post.id}>
                <a
                  href={`/s/${business.slug}/blog/${post.slug}`}
                  className="group flex h-full flex-col overflow-hidden rounded-2xl ring-1 ring-zinc-200 transition hover:shadow-lg"
                >
                  {post.cover && (
                    <SiteImage
                      src={post.cover}
                      alt=""
                      wrapperClassName="h-44 w-full"
                      className="object-cover"
                      sizes="(max-width: 640px) 100vw, 50vw"
                    />
                  )}
                  <div className="flex flex-1 flex-col p-5">
                    <span className="text-xs font-medium text-zinc-500">
                      {post.author ? `${post.author} · ` : ""}
                      {post.publishedAt?.toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                    <h2 className="mt-1 text-lg font-semibold leading-snug text-zinc-900">
                      {post.title}
                    </h2>
                    {post.excerpt && (
                      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-zinc-600">
                        {post.excerpt}
                      </p>
                    )}
                    <span
                      className="mt-4 text-sm font-semibold"
                      style={{ color: "var(--brand-primary)" }}
                    >
                      Read more &rarr;
                    </span>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

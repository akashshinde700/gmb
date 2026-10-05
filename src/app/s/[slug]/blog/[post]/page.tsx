import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadTenantPost } from "@/lib/site-payload";
import { jsonLdScript, tenantBaseUrl } from "@/lib/site-utils";
import SiteImage from "@/components/site/site-image";

/**
 * A tenant's blog post, server-rendered at /s/[slug]/blog/[post].
 *
 * The dashboard has always had a blog editor, and published posts have always
 * been loaded into the site payload — but nothing rendered them and no URL
 * existed, so every article a customer wrote was invisible to the search
 * engines they were sold on. This page is the missing half: real HTML, a
 * canonical URL, per-post metadata and BlogPosting structured data.
 */

export const revalidate = 300;

type Params = { params: Promise<{ slug: string; post: string }> };

function postUrl(businessSlug: string, postSlug: string, primaryHost: string | null): string {
  return `${tenantBaseUrl(businessSlug, primaryHost)}/blog/${postSlug}`;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug, post: postSlug } = await params;
  const payload = await loadTenantPost(slug, postSlug);
  if (!payload) return { title: "Article not found", robots: { index: false, follow: false } };

  const { business, post } = payload;
  const description = (post.excerpt || post.content).slice(0, 300);
  const url = postUrl(business.slug, post.slug, business.primaryDomain);

  return {
    title: `${post.title} — ${business.name}`,
    description,
    keywords: post.tags.length ? post.tags.join(", ") : undefined,
    alternates: { canonical: url },
    openGraph: {
      title: post.title,
      description,
      url,
      siteName: business.name,
      type: "article",
      locale: "en_IN",
      publishedTime: post.publishedAt?.toISOString(),
      modifiedTime: post.updatedAt.toISOString(),
      ...(post.author ? { authors: [post.author] } : {}),
      ...(post.cover ? { images: [{ url: post.cover }] } : {}),
    },
    twitter: {
      card: post.cover ? "summary_large_image" : "summary",
      title: post.title,
      description: description.slice(0, 200),
      ...(post.cover ? { images: [post.cover] } : {}),
    },
  };
}

export default async function TenantBlogPost({ params }: Params) {
  const { slug, post: postSlug } = await params;
  const payload = await loadTenantPost(slug, postSlug);
  // Unpublished posts, unpublished tenants and lapsed subscriptions all read as
  // "not found", so the URL cannot be used to probe an account's state.
  if (!payload) notFound();

  const { business, post } = payload;
  const published = post.publishedAt?.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const jsonLd = jsonLdScript({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt || undefined,
    image: post.cover || undefined,
    datePublished: post.publishedAt?.toISOString(),
    dateModified: post.updatedAt.toISOString(),
    author: post.author ? { "@type": "Person", name: post.author } : undefined,
    publisher: { "@type": "Organization", name: business.name },
    mainEntityOfPage: postUrl(business.slug, post.slug, business.primaryDomain),
  });

  // Breadcrumbs. Google renders these in place of the raw URL in a result, and
  // they are how a crawler learns that this post belongs to a business rather
  // than floating on its own.
  const base = tenantBaseUrl(business.slug, business.primaryDomain);
  const breadcrumbJsonLd = jsonLdScript({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: business.name, item: base },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${base}/blog` },
      {
        "@type": "ListItem",
        position: 3,
        name: post.title,
        item: postUrl(business.slug, post.slug, business.primaryDomain),
      },
    ],
  });

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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumbJsonLd }} />

      <header className="border-b border-zinc-200">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
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
            href={`/s/${business.slug}/blog`}
            className="shrink-0 text-sm font-medium hover:underline"
            style={{ color: "var(--brand-primary)" }}
          >
            All articles
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <article>
          {post.category && (
            <span
              className="inline-block rounded-full px-3 py-1 text-xs font-semibold text-white"
              style={{ background: "var(--brand-primary)" }}
            >
              {post.category}
            </span>
          )}
          <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-zinc-900 sm:text-4xl">
            {post.title}
          </h1>
          <p className="mt-3 text-sm text-zinc-500">
            {post.author ? `${post.author} · ` : ""}
            {published}
          </p>
          {post.cover ? (
            <SiteImage
              src={post.cover}
              alt=""
              wrapperClassName="mt-8 aspect-[16/9] w-full rounded-2xl"
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 768px"
              priority
            />
          ) : null}
          {/* Rendered as text with preserved line breaks, never as HTML: post
              bodies are tenant-authored and must not be able to inject markup. */}
          <div className="mt-8 whitespace-pre-line text-base leading-relaxed text-zinc-700">
            {post.content}
          </div>
          {post.tags.length > 0 && (
            <ul className="mt-10 flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <li
                  key={tag}
                  className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600"
                >
                  #{tag}
                </li>
              ))}
            </ul>
          )}
        </article>

        <div className="mt-14 rounded-2xl bg-zinc-50 p-6 text-center ring-1 ring-zinc-200">
          <p className="text-lg font-semibold text-zinc-900">Need help from {business.name}?</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            {business.phone && (
              <a
                href={`tel:${business.phone}`}
                className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white"
                style={{ background: "var(--brand-primary)" }}
              >
                Call {business.phone}
              </a>
            )}
            <a
              href={`/s/${business.slug}#contact`}
              className="rounded-lg border border-zinc-300 px-5 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-white"
            >
              Send an enquiry
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}

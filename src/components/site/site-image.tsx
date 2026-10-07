"use client";
// WebSetu — image element for tenant sites.
//
// Every picture on a tenant site was a plain <img> pointing at the original
// upload, so a visitor on a phone downloaded the same four-megabyte photo the
// shop owner took. `sharp` was already a dependency and unused; routing our own
// uploads through next/image is what finally puts it to work — resized, in
// WebP or AVIF, cached, and served at the size the layout actually needs.
//
// Only same-origin images are optimised. Tenants can paste an image URL from
// anywhere, and allowing arbitrary remote hosts would turn this deployment into
// an open image proxy: anyone could hand it a URL and have it fetch and re-encode
// whatever they liked, at our bandwidth and CPU. Those keep a plain <img>, which
// is exactly what they had before — nothing is lost, the win is simply limited
// to the images we host.

import Image from "next/image";

export interface SiteImageProps {
  src: string;
  alt: string;
  /** Classes for the box: aspect ratio, rounding, sizing. */
  wrapperClassName?: string;
  /** Classes for the picture itself: object-cover, transitions, ring. */
  className?: string;
  /** Layout hint for the browser's srcset choice. */
  sizes?: string;
  /** Above the fold — skips lazy loading and raises fetch priority. */
  priority?: boolean;
  /**
   * Inline style for the picture itself. Used by the Design DNA's image
   * treatment (a slight desaturation, say) — a filter cannot be expressed as a
   * class here because the value comes from the site's own theme at runtime.
   */
  imgStyle?: React.CSSProperties;
}

/** Same-origin paths are the ones the optimiser is allowed to touch. */
function isLocal(src: string): boolean {
  return src.startsWith("/") && !src.startsWith("//");
}

export default function SiteImage({
  src,
  alt,
  wrapperClassName = "",
  className = "",
  sizes = "100vw",
  priority = false,
  imgStyle,
}: SiteImageProps) {
  if (!src) return null;

  // The wrapper is always positioned, so callers do not have to remember to make
  // their own container relative for `fill` to work.
  const wrapper = `relative overflow-hidden ${wrapperClassName}`.trim();

  if (!isLocal(src)) {
    return (
      <div className={wrapper}>
        {/* A tenant-supplied remote URL: deliberately not optimised, see above. */}
        <img
          src={src}
          alt={alt}
          className={`absolute inset-0 h-full w-full ${className}`.trim()}
          style={imgStyle}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          {...(priority ? { fetchPriority: "high" as const } : {})}
        />
      </div>
    );
  }

  return (
    <div className={wrapper}>
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        className={className}
        style={imgStyle}
        priority={priority}
        // Uploads are content-addressed by a generated name and never rewritten,
        // so a cached derivative can never go stale.
        unoptimized={false}
      />
    </div>
  );
}

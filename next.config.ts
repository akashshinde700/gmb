import type { NextConfig } from "next";

/**
 * Content Security Policy.
 *
 * Defence in depth behind the escaping the app already does: if any injection
 * ever gets through, this stops the injected code from loading a remote script
 * or posting stolen data to another origin.
 *
 * `'unsafe-inline'` on scripts is not optional here — Next.js inlines its own
 * bootstrap and streaming payloads, and the App Router provides no nonce
 * without a proxy that rewrites every response. Tightening this to a nonce is
 * the next step once the app runs behind its own proxy layer.
 *
 * Frames are allowed only for the two embeds tenant sites actually render: the
 * YouTube product video and the Google Maps location.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  // Razorpay Checkout is loaded from their CDN and cannot be self-hosted.
  //
  // No 'unsafe-eval': nothing in the production bundle calls eval or builds a
  // Function from a string (checked against .next/static — zero hits), and the
  // directive was carried over from a template. Leaving it in means an injected
  // string can become executable code, which is most of what a CSP is for.
  "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com",
  "style-src 'self' 'unsafe-inline'",
  // Tenants paste image URLs from anywhere, and legacy rows still hold data: URIs.
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com",
  "media-src 'self' https:",
  // Checkout renders in an iframe, and card/UPI flows hand off to bank pages.
  "frame-src https://www.youtube-nocookie.com https://www.youtube.com https://maps.google.com https://www.google.com https://api.razorpay.com https://checkout.razorpay.com",
  "upgrade-insecure-requests",
].join("; ");

/**
 * Baseline response headers. The app renders tenant-authored content (section
 * copy, image URLs), so framing and MIME sniffing are locked down and the
 * referrer is trimmed on cross-origin navigations.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  // No interest-cohort: FLoC was withdrawn and the token is not recognised by
  // any current browser, so it only earns a console warning on every response.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  // Only meaningful over HTTPS; the CloudPanel vhost terminates TLS in front.
  //
  // No includeSubDomains. This header goes out on customer domains too — a
  // shop on example.com is served by this app — and includeSubDomains there
  // tells the browser that mail.example.com, shop.example.com and every other
  // subdomain the customer runs must be HTTPS for the next year. WebSetu does
  // not serve those and has no business making that promise on their behalf;
  // an HTTP subdomain of theirs would simply stop loading, for a year, with no
  // way for them to undo it. The platform's own hostnames are still protected:
  // each of them sends this header on its own responses.
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
];

/**
 * Files the upload routes drag into `.next/standalone/`.
 *
 * `uploadsDir()` is `process.env.UPLOADS_DIR || <cwd>/public/uploads`. The file
 * tracer cannot know an environment variable's value, so the directory is
 * unknown, so `path.resolve(dir, file)` is unknown — and its fallback for an
 * unknown read is "copy everything under the project root". That put a full
 * copy of `.git`, `src/`, the deploy credentials and, worst of all, the live
 * SQLite database into the build output on every build.
 *
 * These two routes need nothing from the repository at runtime: they read one
 * image out of a directory that is not in the repository at all. Everything
 * listed here is either regenerated (`public` is copied by the build script),
 * shipped another way (`prisma` by the deploy script), or has no business
 * leaving the developer's machine.
 */
const REPO_FILES_NOT_NEEDED_AT_RUNTIME = [
  "./.git/**/*",
  "./.env.example",
  "./db/**/*",
  "./e2e/**/*",
  "./marketing_content/**/*",
  "./public/**/*",
  "./scripts/**/*",
  "./src/**/*",
  "./test-results/**/*",
  "./tests/**/*",
  "./tools/**/*",
  "./*.md",
  "./*.patch",
  "./*.py",
  "./*.json",
  "./*.ts",
  "./*.mjs",
  "./*.lock",
  "./*.log",
  "./*.example",
  "./*.tsbuildinfo",
];

const nextConfig: NextConfig = {
  output: "standalone",
  /**
   * One key, `"*"`, which matches every route.
   *
   * The keys are matched against the route name with
   * `picomatch(key, { dot: true, contains: true })`, so a bare `*` matches all
   * of them — deliberately. The previous version listed only `"/api/upload"`,
   * because the problem was believed to live only in the upload route. It did
   * not: a `.next/standalone` built from this repository contained the whole
   * project root — `db/custom.db` (the live database), `.env`, `e2e/`,
   * `marketing_content/` and a 1.4 MB rejected patch — because ANY route whose
   * trace hit an unresolvable file read widened to the project root, and
   * Turbopack additionally traces the TypeScript sources of every module it
   * compiles.
   *
   * Excluding here is the belt; the `turbopackIgnore` comments in
   * src/lib/uploads.ts and src/app/api/admin/backup/route.ts are the braces
   * that stop the widening at its source. scripts/check-standalone.mjs fails
   * the build if either stops working.
   *
   * `prisma/` is absent from this list on purpose: scripts/deploy-swap.py
   * copies `prisma/` and the generated client into the standalone output as an
   * explicit deploy step, so the server has them without the trace.
   */
  outputFileTracingExcludes: {
    "*": REPO_FILES_NOT_NEEDED_AT_RUNTIME,
  },
  images: {
    // Modern formats first; sharp (already a dependency) does the encoding.
    formats: ["image/avif", "image/webp"],
    // The widths tenant layouts actually ask for — cards, half-width blocks and
    // full-bleed heroes. Every extra entry is another derivative to generate and
    // store, so the list stays short.
    deviceSizes: [400, 640, 828, 1080, 1400, 1920],
    imageSizes: [96, 160, 256, 384],
    // Thirty days. Uploads are stored under a generated name and never
    // rewritten, so a cached derivative cannot go stale.
    minimumCacheTTL: 60 * 60 * 24 * 30,
    // No remotePatterns on purpose: only same-origin images are optimised.
    // Allowing arbitrary hosts would make this an open image proxy for anyone
    // who can construct a URL. Tenant-pasted external images render as plain
    // <img>, which is what they did before.
    remotePatterns: [],
    // Uploads are sniffed as raster images and SVG is refused at upload time;
    // this makes the refusal explicit at the optimiser too.
    dangerouslyAllowSVG: false,
  },
  reactStrictMode: true,
  poweredByHeader: false,
  typescript: {
    // Type errors fail the build again: they were being ignored, which is how
    // three real ones reached the deployed bundle.
    ignoreBuildErrors: false,
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // API responses are per-request and must never be cached by a proxy —
      // except /api/uploads/*, which serves immutable content-addressed images
      // and sets its own long-lived caching headers.
      {
        source: "/api/:path((?!uploads/).*)",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
    ];
  },
};

export default nextConfig;

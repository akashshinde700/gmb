// WebSetu — Shared helpers for UPI payments + YouTube embeds on tenant sites.

/** Build a UPI deep link that any Indian payments app (GPay/PhonePe/Paytm) understands. */
export function upiDeepLink(upiId: string, payeeName: string, note = "Payment"): string {
  const params = new URLSearchParams({
    pa: upiId,
    pn: payeeName || "Merchant",
    cu: "INR",
    tn: note || "Payment",
  });
  return `upi://pay?${params.toString()}`;
}

/** Loose UPI VPA validation — name@bank (allows dots, dashes, underscores). */
/**
 * A tagline that carries no letters — "2025", "2001-2002" — is a year somebody
 * typed into the wrong box. It reaches the meta description, the link preview
 * and the LocalBusiness data, so treating it as absent is better for the
 * business than publishing it.
 */
export function usableTagline(tagline: string | null | undefined): string {
  const value = String(tagline ?? "").trim();
  return /\p{L}/u.test(value) ? value : "";
}

export function isValidUpiId(vpa: string): boolean {
  return /^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(vpa.trim());
}

/** Extract a YouTube video id from watch / youtu.be / shorts / embed URLs. Returns null if not YouTube. */
export function youtubeId(url: string): string | null {
  const u = url.trim();
  if (!u) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=)([\w-]{6,20})/i,
    /(?:youtu\.be\/)([\w-]{6,20})/i,
    /(?:youtube\.com\/shorts\/)([\w-]{6,20})/i,
    /(?:youtube\.com\/embed\/)([\w-]{6,20})/i,
    /(?:youtube\.com\/live\/)([\w-]{6,20})/i,
  ];
  for (const re of patterns) {
    const m = u.match(re);
    if (m) return m[1];
  }
  return null;
}

/** Thumbnail for a YouTube video id (0 = full size). */
export function youtubeThumb(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/**
 * Serialise a JSON-LD object for injection into a <script> tag.
 *
 * `JSON.stringify` alone is not safe here: the object carries tenant-authored
 * text (business name, description, FAQ answers, post titles), and a literal
 * `</script>` inside any of those closes the tag early, turning the rest of
 * the value into markup the browser executes on a published site. Rewriting the
 * characters as JSON unicode escapes leaves the parsed value identical while
 * making the sequence impossible to write. U+2028/U+2029 go the same way: they
 * are legal in JSON strings but terminate a line in JavaScript.
 */
export function jsonLdScript(value: unknown): string {
  return JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (char) => "\\u" + char.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}

/**
 * Absolute origin for canonical URLs, OG tags and structured data. Lives here
 * rather than in site-payload so client components can use it too — importing
 * it from there would pull Prisma into the browser bundle.
 */
export function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://www.websetu.instantqr.tech").replace(/\/$/, "");
}

/**
 * Base URL for one tenant's public pages.
 *
 * A business on a custom domain lives at the root of that domain; everyone else
 * lives under /s/<slug> on the platform. Every canonical link, Open Graph URL,
 * sitemap entry and structured-data URL goes through here, so a site is never
 * advertised under two addresses at once — which is the fastest way to split
 * its own search ranking in half.
 */
export function tenantBaseUrl(slug: string, primaryHost?: string | null): string {
  const host = (primaryHost || "").trim().toLowerCase();
  return host ? `https://${host}` : `${siteOrigin()}/s/${slug}`;
}

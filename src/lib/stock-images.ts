// WebSetu — stock photos for new websites.
//
// A new site gets a real cover photo and gallery for its trade instead of an
// empty frame. Providers, first configured one wins:
//   PEXELS_API_KEY   — Pexels (free licence)
//   PIXABAY_API_KEY  — Pixabay (free licence)
//   (none)           — Openverse, public-domain photos only (CC0 / PDM), no key
// Every photo is downloaded from an allow-listed CDN, re-encoded with sharp to
// a web-sized JPEG (which also strips metadata) and stored in our own uploads
// directory, so tenant sites never hotlink a third party. Set STOCK_PHOTOS=off
// to disable entirely.

import sharp from "sharp";
import { storeImage } from "@/lib/uploads";

export interface StockPhoto {
  url: string;
  alt: string;
}

interface Candidate {
  src: string;
  alt: string;
  /** Title plus tags, lower-cased — used to drop off-topic results. */
  text: string;
}

interface SearchResult {
  items: Candidate[];
  /** How many results the provider says exist for this query. */
  total: number;
}

/** CDNs a provider is allowed to send us to — nothing else is ever fetched. */
const ALLOWED_HOSTS = new Set([
  "images.pexels.com",
  "pixabay.com",
  "cdn.pixabay.com",
  "api.openverse.org",
]);
const MAX_DOWNLOAD = 12 * 1024 * 1024;
const UA = "WebSetu/1.0 (website builder; stock photos)";

export function stockImagesConfigured(): boolean {
  return process.env.STOCK_PHOTOS !== "off";
}

async function pexels(query: string, n: number, page: number): Promise<SearchResult> {
  const url = new URL("https://api.pexels.com/v1/search");
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", String(n));
  url.searchParams.set("orientation", "landscape");
  url.searchParams.set("page", String(page));
  const res = await fetch(url, { headers: { Authorization: process.env.PEXELS_API_KEY! }, signal: AbortSignal.timeout(8_000) });
  if (!res.ok) return { items: [], total: 0 };
  const data = (await res.json()) as {
    total_results?: number;
    photos?: { alt?: string; src?: { large2x?: string; large?: string } }[];
  };
  const items = (data.photos ?? []).map((p) => ({
    src: p.src?.large2x || p.src?.large || "",
    alt: p.alt || query,
    text: (p.alt || query).toLowerCase(),
  }));
  return { items, total: data.total_results ?? items.length };
}

async function pixabay(query: string, n: number, page: number): Promise<SearchResult> {
  const url = new URL("https://pixabay.com/api/");
  url.searchParams.set("key", process.env.PIXABAY_API_KEY!);
  url.searchParams.set("q", query);
  url.searchParams.set("image_type", "photo");
  url.searchParams.set("orientation", "horizontal");
  url.searchParams.set("safesearch", "true");
  url.searchParams.set("per_page", String(Math.max(3, n)));
  url.searchParams.set("page", String(page));
  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) return { items: [], total: 0 };
  const data = (await res.json()) as { totalHits?: number; hits?: { tags?: string; largeImageURL?: string }[] };
  const items = (data.hits ?? []).map((h) => ({
    src: h.largeImageURL || "",
    alt: h.tags || query,
    text: (h.tags || query).toLowerCase(),
  }));
  return { items, total: data.totalHits ?? items.length };
}

async function openverse(query: string, n: number, page: number): Promise<SearchResult> {
  const url = new URL("https://api.openverse.org/v1/images/");
  url.searchParams.set("q", query);
  url.searchParams.set("license", "cc0,pdm");
  // Curated stock sources only; the wider index includes snapshots and scans.
  url.searchParams.set("source", "stocksnap,rawpixel");
  url.searchParams.set("category", "photograph");
  url.searchParams.set("aspect_ratio", "wide");
  url.searchParams.set("mature", "false");
  // 20 is the most this endpoint serves without a key; asking for more
  // returns nothing at all rather than a smaller page.
  url.searchParams.set("page_size", "20");
  url.searchParams.set("page", String(page));
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return { items: [], total: 0 };
  const data = (await res.json()) as {
    result_count?: number;
    results?: { thumbnail?: string; title?: string; tags?: { name?: string }[] }[];
  };
  // Downloaded through Openverse's own image proxy: some source CDNs refuse
  // server-side requests, and full_size=true returns the original dimensions.
  const items = (data.results ?? []).map((r) => {
    let src = "";
    try {
      const t = new URL(r.thumbnail || "");
      t.searchParams.set("full_size", "true");
      src = t.toString();
    } catch {
      src = "";
    }
    const tags = (r.tags ?? []).map((t) => t.name ?? "").join(" ");
    return { src, alt: r.title || query, text: `${r.title ?? ""} ${tags}`.toLowerCase() };
  });
  return { items, total: data.result_count ?? items.length };
}

async function search(query: string, n: number, page: number): Promise<SearchResult> {
  try {
    if (process.env.PEXELS_API_KEY) return await pexels(query, n, page);
    if (process.env.PIXABAY_API_KEY) return await pixabay(query, n, page);
    return await openverse(query, n, page);
  } catch {
    return { items: [], total: 0 };
  }
}

/** Words too common to prove a photo is about the query. */
const STOPWORDS = new Set(["the", "and", "for", "with", "a", "of", "in", "on"]);

/**
 * Keep photos whose title or tags actually mention the search.
 *
 * Without this the gallery fills with whatever the provider returned when it
 * ran out of real matches — a gym that asked for "fitness" ended up with six
 * copies of "Modern Building".
 */
function relevant(items: Candidate[], query: string): Candidate[] {
  const terms = query.split(/\s+/).filter((w) => w.length > 2 && !STOPWORDS.has(w));
  if (!terms.length) return items;
  return items.filter((c) => terms.some((t) => c.text.includes(t)));
}

/** Download, re-encode and store one photo; null on any problem. */
async function storeCandidate(c: Candidate, width: number): Promise<StockPhoto | null> {
  try {
    const u = new URL(c.src);
    if (u.protocol !== "https:" || !ALLOWED_HOSTS.has(u.hostname)) return null;
    const res = await fetch(u, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return null;
    const declared = Number(res.headers.get("content-length") || 0);
    if (declared > MAX_DOWNLOAD) return null;
    const raw = Buffer.from(await res.arrayBuffer());
    if (!raw.length || raw.length > MAX_DOWNLOAD) return null;
    const jpeg = await sharp(raw, { limitInputPixels: 60_000_000 })
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
    const name = await storeImage(jpeg, "jpg");
    return { url: `/api/uploads/${name}`, alt: c.alt.replace(/\s+/g, " ").trim().slice(0, 200) };
  } catch {
    return null;
  }
}

/**
 * Store up to `count` landscape photos for `query`; the first is cover-sized.
 *
 * `page` is what makes two businesses in the same trade get different photos.
 * It is clamped to the pages that actually exist, and every result is checked
 * against the search words, so a thin query returns fewer photos rather than
 * unrelated ones. Never throws: a slow or failing provider just means fewer.
 */
export async function fetchStockPhotos(query: string, count: number, page = 1): Promise<StockPhoto[]> {
  const words = query.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter(Boolean).slice(0, 5);
  if (!stockImagesConfigured() || !words.length || count <= 0) return [];

  const want = count + 6; // spare candidates for failed downloads and duplicates
  const term = words.join(" ");

  // Page 1 first: it reports how many results exist, which is the only way to
  // know whether the seeded page is real. Asking for page 5 of a query with 30
  // results returns nothing, and the old code then kept whatever junk it had.
  const first = await search(term, want, 1);
  let pool = relevant(first.items, term);

  const maxPage = Math.max(1, Math.min(6, Math.ceil(first.total / 20)));
  const wanted = Math.max(1, Math.min(maxPage, Math.floor(page)));
  if (wanted > 1) {
    const deep = await search(term, want, wanted);
    // Both pages go in the pool and the seeded shuffle below picks from the
    // whole of it: a bigger pool is what stops two businesses in one trade
    // landing on the same few pictures.
    pool = [...relevant(deep.items, term), ...pool];
  }

  const candidates = pool.filter((c) => c.src);

  // The same shot often appears in several crops under one title: distinct
  // titles first, repeats only to top up a short list.
  const seen = new Set<string>();
  const distinct: Candidate[] = [];
  const repeats: Candidate[] = [];
  for (const c of candidates) {
    const k = c.alt.toLowerCase().trim();
    (seen.has(k) ? repeats : distinct).push(c);
    seen.add(k);
  }
  const queue = [...distinct, ...repeats];

  // Download in batches until enough have been stored, but never hold the
  // customer's "Create my website" request open chasing the last picture — a
  // site with four photos beats a wizard that times out.
  const deadline = Date.now() + 20_000;
  const out: StockPhoto[] = [];
  while (out.length < count && queue.length && Date.now() < deadline) {
    const batch = queue.splice(0, count - out.length);
    const first = out.length === 0;
    const stored = await Promise.all(batch.map((c, i) => storeCandidate(c, first && i === 0 ? 1600 : 1200)));
    out.push(...stored.filter((x): x is StockPhoto => !!x));
  }
  return out.slice(0, count);
}

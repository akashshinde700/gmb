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

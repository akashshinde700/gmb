// WebSetu — phone-number formatting for SMS, kept free of database imports so
// it can be unit-tested without a Prisma client.

/**
 * Normalise a phone number to E.164.
 *
 * Numbers reach us as the owner typed them: "98765 43210", "+91-98765-43210",
 * "098765 43210". httpSMS accepts only E.164 and rejects everything else, so
 * the guesswork happens here, once. Anything ambiguous returns an empty string
 * rather than being sent to a number nobody intended.
 */
export function toE164(raw: string, defaultCountry = "91"): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";

  const hadPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";

  // An explicit + means the caller already stated the country code; trust it
  // and only sanity-check the length E.164 allows.
  if (hadPlus) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : "";

  // A single leading zero is the Indian trunk prefix, not part of the number.
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) return `+${defaultCountry}${digits}`;
  // Already carries the country code, e.g. 919876543210.
  if (digits.length === 12 && digits.startsWith(defaultCountry)) return `+${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return "";
}

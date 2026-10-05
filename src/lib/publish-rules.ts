// WebSetu — what a website needs before it can go public.
//
// These rules lived only inside POST /api/website/publish, and the onboarding
// wizard did not know them. So the wizard finished, wrote the business as a
// DRAFT, showed a success screen, and left the customer believing they had a
// website. They did not: nothing was public until they found the Publish button
// in the builder on their own.
//
// Three of the three trial customers on the live system were stuck at exactly
// that point — full details entered, every publish rule already satisfied, site
// never published, trial running out underneath them.
//
// Kept free of database imports so both callers and the tests can use it.

export interface PublishCandidate {
  name: string;
  phone: string;
  address: string;
  city: string;
}

export interface PublishWebsite {
  seoTitle: string;
  /** Sections that are switched on; only visible ones count towards the site. */
  visibleSections: number;
}

/** Minimum sections a page needs before it is worth showing to a customer. */
export const MIN_VISIBLE_SECTIONS = 3;

/**
 * Everything standing between this business and a public website, in the order
 * a person would fix them. An empty array means it is ready to publish.
 *
 * Written as things to do rather than as errors, because these strings are
 * shown to the business owner.
 */
export function publishBlockers(
  business: PublishCandidate,
  website: PublishWebsite,
): string[] {
  const blockers: string[] = [];
  if (!business.name?.trim()) blockers.push("Business name is required");
  if (!business.phone?.trim()) {
    blockers.push("Phone number is required for customers to contact you");
  }
  if (!business.address?.trim() || !business.city?.trim()) {
    blockers.push("Business address & city are required");
  }
  if ((website.visibleSections ?? 0) < MIN_VISIBLE_SECTIONS) {
    blockers.push(`At least ${MIN_VISIBLE_SECTIONS} visible sections are required`);
  }
  if (!website.seoTitle?.trim()) blockers.push("SEO title is required");
  return blockers;
}

/** Whether this business can go public right now. */
export function canPublish(business: PublishCandidate, website: PublishWebsite): boolean {
  return publishBlockers(business, website).length === 0;
}

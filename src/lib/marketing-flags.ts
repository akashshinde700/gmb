/**
 * What the marketing surfaces are allowed to advertise.
 *
 * No imports, so a server component (the metadata in layout.tsx) and a client
 * component (the landing page) can share one source of truth. Two copies of a
 * flag like this drift the first time only one of them is flipped.
 */

/**
 * Whether WebSetu promotes the leads / CRM feature.
 *
 * Off at the owner's request — the feature works, it is simply not being
 * advertised yet. Nothing is deleted: every mention is written out beside its
 * alternative, so setting this to `true` restores the previous copy exactly,
 * across the hero, the feature grid, the steps, the FAQ, the closing CTA, the
 * footer and the page description Google shows in search results.
 *
 * This does not touch the contact form on the landing page — that collects
 * WebSetu's own enquiries and is unrelated to the customer-facing feature.
 */
export const SHOW_LEADS = false;

/** The site description, which changes with the flag above. */
export const SITE_DESCRIPTION = SHOW_LEADS
  ? "WebSetu is India's complete Website-as-a-Service platform for local businesses. Website + Google presence + SEO + Leads + WhatsApp + Analytics — without any coding."
  : "WebSetu is India's complete Website-as-a-Service platform for local businesses. Website + Google presence + SEO + WhatsApp + Analytics — without any coding.";

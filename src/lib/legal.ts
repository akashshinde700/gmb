// WebSetu — the plain-language legal copy shown on the marketing site and
// on the login/register screen. Kept in one place so the two cannot drift.

import { TRIAL_LABEL } from "@/lib/trial";

/** Company contact details — used by the footer and the policy dialogs. */
export const CONTACT = {
  email: "info@aetherdevsolutions.com",
  /** Who callers reach. One number, so nobody is bounced between people. */
  people: [
    { name: "Akash Shinde", display: "86000 98315", href: "+918600098315" },
  ],
};

export interface LegalSection {
  heading: string;
  body: string;
}

export const PRIVACY: LegalSection[] = [
  {
    heading: "What we collect",
    body:
      "Your account details (name, email), the business information you enter for your website, and the enquiries " +
      "your visitors submit. We also record page views and button clicks on your website so your dashboard can show " +
      "you what is working.",
  },
  {
    heading: "How it is used",
    body:
      "Only to run the service: build and host your website, deliver your leads to you, and show your analytics. " +
      "We do not sell your data or your customers' data, and we do not share it with advertisers.",
  },
  {
    heading: "Who can see it",
    body:
      "You, and the WebSetu staff who need access to support your account. Every visitor-facing page shows only the " +
      "content you publish.",
  },
  {
    heading: "Your control",
    body:
      "You can edit or delete your content at any time from the dashboard. Write to " + CONTACT.email + " to export or " +
      "close your account, and we will action it within 7 working days.",
  },
];

export const TERMS: LegalSection[] = [
  {
    heading: "Your account",
    body:
      "Keep your password to yourself; you are responsible for what happens under your login. One business per " +
      "account unless we agree otherwise in writing.",
  },
  {
    heading: "Your content",
    body:
      "The text, images and offers you publish stay yours. You confirm you have the right to use them, and that they " +
      "are lawful and not misleading to your customers.",
  },
  {
    heading: "Trial and billing",
    body:
      `New accounts get a ${TRIAL_LABEL} with no card required. Paid plans are billed for the cycle you choose and can ` +
      "be cancelled anytime — your website stays online until the end of the paid period.",
  },
  {
    heading: "Fair use and suspension",
    body:
      "We may suspend a website that breaks the law, impersonates someone else, or is used to send spam. Where we can, " +
      "we will tell you first and give you a chance to fix it.",
  },
  {
    heading: "Service availability",
    body:
      "We work to keep every website online, but we do not promise uninterrupted service. Planned maintenance is " +
      "announced in advance in your dashboard.",
  },
];

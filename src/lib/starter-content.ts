// WebSetu — starter content created with a new website.
//
// The onboarding wizard used to write FAQs into the hero/FAQ section JSON only,
// which meant they could not be edited from the FAQs tab and never reached the
// FAQPage structured data. These build real rows the customer owns and edits.

import type { AiSiteContent } from "@/lib/sections";

export interface StarterFaq {
  question: string;
  answer: string;
  sortOrder: number;
}

export interface StarterPost {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  tags: string;
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 120) || "post"
  );
}

interface StarterInput {
  name: string;
  category: string;
  city: string;
  phone: string;
  services: string[];
  ai?: AiSiteContent | null;
  /** Trade-specific questions (already filled in) from the industry preset. */
  industryFaqs?: { question: string; answer: string }[];
}

/**
 * FAQs for the FAQs tab. Uses the AI answers when generation ran; otherwise the
 * same questions every local business gets asked, filled in from their details.
 */
export function starterFaqs(input: StarterInput): StarterFaq[] {
  const { name, category, city, phone, services } = input;
  const lower = category.toLowerCase();
  const where = city || "your area";

  const fromAi = (input.ai?.faqs ?? [])
    .filter((f) => (f.question || "").trim() && (f.answer || "").trim())
    .slice(0, 8);
  if (fromAi.length >= 3) {
    return fromAi.map((f, i) => ({
      question: f.question.trim().slice(0, 300),
      answer: f.answer.trim().slice(0, 2000),
      sortOrder: i + 1,
    }));
  }

  const list = services.filter(Boolean);
  const base = [
    {
      question: `What services does ${name} offer?`,
      answer: list.length
        ? `We offer ${list.join(", ")}. Tell us what you need and we will guide you to the right option.`
        : `We provide complete ${lower} services in ${where}. Call us with your requirement and we will guide you.`,
    },
    {
      question: `Where is ${name} located?`,
      answer: `We are based in ${where} and serve customers across the surrounding areas. Use the map on this page for directions.`,
    },
  ];
  // Trade questions sit between the basics and the generic closers; any that
  // repeat a basic topic (services, location) are dropped.
  const trade = (input.industryFaqs ?? [])
    .filter((f) => f.question.trim() && f.answer.trim())
    .filter((f) => !/\b(located|which services|what services|provide\?)/i.test(f.question))
    .slice(0, 3);
  return [
    ...base,
    ...trade,
    {
      question: "What are your opening hours?",
      answer: "Our hours are listed on this page. Outside those hours, send us a message and we will reply the next working day.",
    },
    {
      question: "How do I get a price?",
      answer: phone
        ? `Call or WhatsApp us on ${phone} with your requirement and we will share a clear, no-obligation quote.`
        : "Send us an enquiry with your requirement and we will share a clear, no-obligation quote.",
    },
    {
      question: "How quickly can you start?",
      answer: "Get in touch and we will confirm the earliest slot we have. Urgent jobs are usually accommodated the same week.",
    },
  ].map((f, i) => ({ ...f, sortOrder: i + 1 }));
}

/**
 * Two starter blog posts, saved as DRAFTS. They are a template to edit and
 * publish, never published automatically — nobody wants placeholder copy going
 * live under their own name.
 */
export function starterPosts(input: StarterInput): StarterPost[] {
  const { name, category, city, services } = input;
  const lower = category.toLowerCase();
  const where = city || "your city";
  const first = services[0] || `${lower} work`;

  const posts = [
    {
      title: `How to choose a ${lower} in ${where}`,
      excerpt: `What to check before you hire — and the questions worth asking.`,
      tags: `${lower}, ${where}, guide`,
      content:
        `Choosing the right ${lower} in ${where} is mostly about asking the right questions before the work starts.\n\n` +
        `1. Ask what the quote covers\nA good quote lists materials, labour and anything that could add to the cost later. If something is unclear, ask before agreeing.\n\n` +
        `2. Check the work they have done\nPhotos of finished jobs tell you more than a description. Ask to see work similar to yours.\n\n` +
        `3. Agree the timeline in writing\nEven a short message confirming the start date and how long it should take avoids most disagreements.\n\n` +
        `4. Understand what happens if something goes wrong\nAsk what is covered after the job is finished, and for how long.\n\n` +
        `At ${name} we are happy to answer all of these before you commit. Call us and we will talk it through.`,
    },
    {
      title: `${first}: what to expect when you book with ${name}`,
      excerpt: `A walk through our process, from first call to finished job.`,
      tags: `${lower}, process`,
      content:
        `Here is exactly what happens when you book ${first.toLowerCase()} with us.\n\n` +
        `Step 1 — The first call\nTell us what you need. We will ask a few questions to understand the job and, where useful, arrange a visit.\n\n` +
        `Step 2 — A clear quote\nYou get a written quote covering the work and materials. No surprises added later.\n\n` +
        `Step 3 — The work itself\nWe agree a time that suits you, arrive when we say we will, and keep the site tidy.\n\n` +
        `Step 4 — After we finish\nWe walk you through what was done and answer any questions. If something needs attention afterwards, tell us and we will sort it.\n\n` +
        `Ready to start? Send us an enquiry from this page and we will get back to you.`,
    },
  ];

  return posts.map((p) => ({ ...p, slug: slugify(p.title) }));
}

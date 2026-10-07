// WebSetu — the website director.
//
// A site is not generated from one prompt. It is directed: the business is
// understood, the audience and the positioning are named, the one action the
// site exists to earn is chosen, and only then are the design, the page
// structure, the components, the content and the animation decided. This file
// is that first half of the pipeline, and it is deliberately deterministic —
// the same business always gets the same brief, the site cannot fail on a bad
// network, and the LLM is left to do the one thing it is genuinely better at,
// which is writing the copy.
//
// The brief is stored with the site (theme.dna.director), so the dashboard can
// explain *why* a page looks the way it does and a later "make it more premium"
// has something explicit to argue with.

import type { SectionType } from "@/lib/types";
import type { BusinessDna, DesignDna, MotionDna, SectionChoice } from "@/lib/design-dna";

/**
 * The one action a site is built to earn. Everything else — which button is
 * biggest, which section sits above the fold on a phone, what the sticky bar
 * offers — follows from it.
 */
export type GoalAction = "form" | "call" | "whatsapp" | "directions" | "menu" | "quote" | "booking";

export interface GoalCta {
  action: GoalAction;
  label: string;
}

export interface GoalPlan {
  /** Stable key, e.g. "appointments". */
  key: string;
  /** What the site is for, in the owner's language ("Appointments"). */
  label: string;
  /** Why this is the goal — shown in the dashboard. */
  why: string;
  primary: GoalCta;
  secondary: GoalCta | null;
  /**
   * Sections this trade's visitors look for first. They are moved up the page
   * (never added or removed), so a clinic's hours and a manufacturer's products
   * are both near the top without inventing anything.
   */
  emphasis: SectionType[];
}

/**
 * Goal per trade family. These are the actual buying paths of these businesses
 * in India: a cab is booked on the phone, a manufacturer is asked for a rate,
 * a restaurant takes the order on WhatsApp, a clinic takes appointments.
 */
const GOALS: Record<string, GoalPlan> = {
  appointments: {
    key: "appointments",
    label: "Appointments",
    why: "Patients choose a clinic they can get into quickly, so the page asks for the appointment rather than for a phone call.",
    primary: { action: "form", label: "Book an Appointment" },
    secondary: { action: "call", label: "Call the Clinic" },
    emphasis: ["services", "hours", "contact", "testimonials", "faq"],
  },
  bookings: {
    key: "bookings",
    label: "Bookings",
    why: "Rooms, tables and slots are sold while the visitor is looking, so the booking action is never more than a tap away.",
    primary: { action: "form", label: "Check Availability" },
    secondary: { action: "whatsapp", label: "WhatsApp Us" },
    emphasis: ["gallery", "services", "contact", "testimonials", "faq"],
  },
  orders: {
    key: "orders",
    label: "Orders & delivery",
    why: "This trade lives on repeat orders, so the page leads to an order on WhatsApp and shows what is available.",
    primary: { action: "whatsapp", label: "Order on WhatsApp" },
    secondary: { action: "call", label: "Call to Order" },
    emphasis: ["products", "services", "contact", "hours"],
  },
  menu: {
    key: "menu",
    label: "Menu & table",
    why: "Hungry visitors decide in seconds: the menu first, then the table, then the directions.",
    primary: { action: "menu", label: "See the Menu" },
    secondary: { action: "call", label: "Call for a Table" },
    emphasis: ["gallery", "hours", "contact", "testimonials"],
  },
  quotes: {
    key: "quotes",
    label: "Quotations",
    why: "Nobody buys a truck or a shed online — they ask for a rate, so the whole page funnels into one clear quotation request.",
    primary: { action: "quote", label: "Get a Quotation" },
    secondary: { action: "call", label: "Call Now" },
    emphasis: ["services", "products", "whyUs", "gallery"],
  },
  consults: {
    key: "consults",
    label: "Consultations",
    why: "The buyer here is shopping for judgement, not for a product, so the page offers a first conversation.",
    primary: { action: "form", label: "Book a Consultation" },
    secondary: { action: "call", label: "Talk to Us" },
    emphasis: ["services", "whyUs", "testimonials", "faq"],
  },
  admissions: {
    key: "admissions",
    label: "Admissions",
    why: "Parents compare two or three institutes and then ring; the page answers what they compare on and asks for the enquiry.",
    primary: { action: "form", label: "Enquire About Admission" },
    secondary: { action: "call", label: "Call the Office" },
    emphasis: ["services", "whyUs", "testimonials", "gallery", "faq"],
  },
  visits: {
    key: "visits",
    label: "Site visits",
    why: "Property is decided on sight, so the page pushes a visit or a WhatsApp message, and shows the work.",
    primary: { action: "form", label: "Schedule a Visit" },
    secondary: { action: "whatsapp", label: "WhatsApp Us" },
    emphasis: ["products", "gallery", "whyUs", "contact"],
  },
  bookingsService: {
    key: "bookingsService",
    label: "Service bookings",
    why: "Home and vehicle services are booked by slot, so the page asks for the job and the location first.",
    primary: { action: "form", label: "Book a Service" },
    secondary: { action: "whatsapp", label: "WhatsApp Us" },
    emphasis: ["services", "whyUs", "testimonials", "contact"],
  },
  ordersRetail: {
    key: "ordersRetail",
    label: "Store visits & orders",
    why: "A shop is judged on stock and location: the page shows what is stocked and how to reach it.",
    primary: { action: "directions", label: "Get Directions" },
    secondary: { action: "whatsapp", label: "Ask on WhatsApp" },
    emphasis: ["products", "gallery", "hours", "contact"],
  },
  supply: {
    key: "supply",
    label: "Supply enquiries",
    why: "Buyers want rates, minimum quantity and delivery area — the page answers those and takes the enquiry.",
    primary: { action: "quote", label: "Get a Quote" },
    secondary: { action: "whatsapp", label: "WhatsApp Us" },
    emphasis: ["products", "services", "whyUs", "hours"],
  },
};

/** Trade → default goal. Keys are the industry presets in industries.ts. */
const GOAL_BY_INDUSTRY: Record<string, string> = {
  transport: "quotes",
  travel: "bookings",
  "building-materials": "supply",
  construction: "quotes",
  "real-estate": "visits",
  manufacturing: "quotes",
  beverage: "orders",
  food: "menu",
  hotel: "bookings",
  healthcare: "appointments",
  dental: "appointments",
  beauty: "appointments",
  fitness: "bookingsService",
  professional: "consults",
  education: "admissions",
  tech: "consults",
  automotive: "bookingsService",
  events: "quotes",
  interior: "quotes",
  "home-services": "bookingsService",
  agriculture: "supply",
  retail: "ordersRetail",
};

/**
 * Words in the owner's own description that mean a different goal. A bakery
 * that says "order online" wants orders even though bakeries default to a menu;
 * a clinic that says "walk-in" wants directions. Only an explicit signal wins.
 */
const GOAL_SIGNALS: { goal: string; words: string[] }[] = [
  { goal: "orders", words: ["order online", "home delivery", "delivery", "wholesale order", "bulk order", "subscribe"] },
  { goal: "menu", words: ["menu", "dine", "restaurant", "cafe", "café", "bakery", "sweets", "catering"] },
  { goal: "appointments", words: ["appointment", "clinic", "patients", "check-up", "consultation room"] },
  { goal: "visits", words: ["site visit", "property", "flats", "plots", "apartments", "site seeing"] },
  { goal: "bookingsService", words: ["service call", "plumber", "electrician", "repair", "amc", "installation"] },
  { goal: "bookings", words: ["booking", "reservation", "rooms", "tariff", "check-in", "hall booking"] },
  { goal: "quotes", words: ["quotation", "estimate", "tender", "bulk supply", "contract", "b2b"] },
  { goal: "admissions", words: ["admission", "students", "courses", "batch", "classes", "coaching"] },
  { goal: "consults", words: ["consultation", "advisory", "audit", "retainer", "clients", "b2b services"] },
  { goal: "ordersRetail", words: ["showroom", "store", "shop", "stock", "walk-in"] },
  { goal: "directions", words: ["walk-in", "visit us", "near me"] },
];

/**
 * The goal of one business.
 *
 * Trade first (a dentist is asked for an appointment even if the description is
 * silent), then the owner's own words, so a clinic that sells online health
 * packages is not pushed into a booking form it does not want.
 */
export function goalFor(input: {
  industryKey?: string | null;
  category?: string | null;
  description?: string | null;
  services?: string[];
}): GoalPlan {
  const text = `${input.description ?? ""} ${(input.services ?? []).join(" ")}`.toLowerCase();
  for (const signal of GOAL_SIGNALS) {
    if (signal.words.some((w) => text.includes(w))) {
      const plan = GOALS[signal.goal];
      if (plan) return plan;
    }
  }
  return GOALS[GOAL_BY_INDUSTRY[input.industryKey ?? ""] ?? ""] ?? GOALS.consults;
}

/**
 * The director's brief: what the site is, who it is for, what it must achieve,
 * and the plan for getting there.
 *
 * Every stage is one line the owner could read, because the point of writing
 * them down is that a person can disagree with one of them. `stages` is what the
 * dashboard renders; the rest is read by the generators.
 */
export interface DirectorBrief {
  goal: GoalPlan;
  understanding: string;
  audience: string;
  positioning: string;
  designDirection: string;
  contentStrategy: string;
  animationStrategy: string;
  stages: { name: string; detail: string }[];
}

export function directorBrief(input: {
  name: string;
  city?: string | null;
  business: BusinessDna;
  design: DesignDna["design"];
  motion: MotionDna;
  goal: GoalPlan;
  plan: SectionChoice[];
  description?: string | null;
}): DirectorBrief {
  const { name, city, business, design, motion, goal } = input;
  const where = city ? ` in ${city}` : "";
  const sections = input.plan.map((c) => c.type);

  const understanding = input.description?.trim()
    ? `${name}${where}: ${input.description.trim().slice(0, 220)}`
    : `${name}${where} — a ${business.subType.toLowerCase()} for ${business.audience}.`;

  const audience = `${business.audience}, ${business.positioning === "premium" ? "who are comparing specialists and expect the price to be justified" : business.positioning === "budget" ? "who are comparing prices first" : "who want a clear answer and a quick reply"}.`;

  const positioning = `${business.positioning} — ${design.styleName}. ${business.personality} in tone, ${business.tone}.`;

  const designDirection = `${design.styleName}: ${design.font} type, ${design.radius} corners, ${design.shadow} shadows, ${design.button} buttons, ${design.spacing} spacing, ${design.header} header, ${design.footer} footer, ${design.imageTreatment} images.`;

  const contentStrategy = `Written for ${business.audience} in a ${business.tone} voice. The page opens with what ${name} does and where, then proves it, then asks for ${goal.label.toLowerCase()}. Nothing is stated that the owner did not provide — no invented years, counts, awards or prices.`;

  const animationStrategy =
    motion.level <= 1
      ? `${motion.pack} at intensity ${motion.level} of 4: reveals only, no moving bands or floating shapes — a quiet page that still feels finished.`
      : `${motion.pack} at intensity ${motion.level} of 4: a moving band of ${name}'s own service names, count-up figures and reveals; reduced again on phones and switched off entirely for anyone who has asked for less motion.`;

  const stages = [
    { name: "Business understood", detail: understanding },
    { name: "Audience", detail: audience },
    { name: "Positioning", detail: positioning },
    {
      name: "Goal",
      detail: `${goal.label} — ${goal.primary.label}${goal.secondary ? `, then ${goal.secondary.label}` : ""}. ${goal.why}`,
    },
    { name: "Design direction", detail: designDirection },
    { name: "Page structure", detail: sections.join(" → ") },
    {
      name: "Components",
      detail: input.plan.map((c) => `${c.type}: ${c.variant}`).join(" · "),
    },
    { name: "Content", detail: contentStrategy },
    { name: "Animation", detail: animationStrategy },
  ];

  return {
    goal,
    understanding,
    audience,
    positioning,
    designDirection,
    contentStrategy,
    animationStrategy,
    stages,
  };
}

/**
 * The page order for a goal.
 *
 * The drawn order is kept — it is what makes two businesses in a trade read
 * differently — but the sections this trade's visitors look for first are pulled
 * up, and the contact section is always last: the page ends by asking.
 */
export function directPageOrder(drawn: readonly SectionType[], goal: GoalPlan): SectionType[] {
  const wanted = goal.emphasis;
  const rank = (type: SectionType) => {
    const i = wanted.indexOf(type);
    return i === -1 ? wanted.length : i;
  };
  const head = drawn.filter((t) => t !== "hero" && t !== "contact");
  // Stable sort: sections the goal cares about come first in the goal's own
  // order of importance, everything else keeps the order it was drawn in.
  const sorted = [...head].sort((a, b) => rank(a) - rank(b));
  return ["hero", ...sorted, "contact"].filter((t, i, all) => all.indexOf(t) === i) as SectionType[];
}

/** The CTA the hero and the band should carry, in the shape the copy takes. */
export function goalCtas(goal: GoalPlan): { primary: string; secondary: string | null } {
  return { primary: goal.primary.label, secondary: goal.secondary?.label ?? null };
}

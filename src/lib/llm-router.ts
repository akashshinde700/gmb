// WebSetu — the AI manager.
//
// Nine providers, one of them free and slow, one paid and fast, several that
// fail at any given moment. The generator has one rule about them: the customer
// never finds out which one answered. This file is the part that decides who
// gets asked, in what order, and what that costs.
//
// The decisions, in the order they are made for each call:
//
//   1. availability — a provider without a key is not a provider.
//   2. quota        — a provider past its configured daily ceiling is skipped,
//                     silently, exactly like one that failed (llm-usage.ts).
//   3. the task     — SEO copy for a whole site is not the same job as
//                     rewriting one headline, and they do not get the same list.
//   4. cost/latency — with everything else equal, cheap and quick first, which
//                     is what keeps a free-tier product free.
//   5. health       — a provider that has been failing all day drops down the
//                     list instead of costing every customer a timeout.
//
// And whichever one answers, the attempt is recorded (including the failures),
// so the admin view can show what actually happened rather than what was
// configured.

import { PROVIDER_ORDER, providerChain, type LlmProvider } from "@/lib/llm-chain";
import { providerBudget, usageToday } from "@/lib/llm-usage";

export type LlmTask = "content" | "copy" | "seo" | "faq" | "chat";

export interface TaskProfile {
  /** What the task is, for the admin view. */
  label: string;
  /**
   * Which providers suit it, best first. Providers not listed keep their
   * default order after these.
   */
  prefer: LlmProvider[];
  /** Long jobs need a big context and a provider that will not truncate. */
  maxTokens: number;
  /** Rough character count of a typical prompt, for the docs. */
  size: "small" | "large";
}

/**
 * One profile per kind of writing the product does.
 *
 * The ordering inside `prefer` is the interesting part, and it was decided by
 * weighing what each provider is actually good at against what it costs:
 *
 *  - `content` is the whole site's copy in one JSON object: long output, strict
 *    shape, so it leads with the providers measured to return complete JSON
 *    (Groq at 2.9s, Gemini, then the paid ones which are reliable but billed).
 *  - `copy` is one section: short, and it has to sound like a person wrote it.
 *    Gemini and Claude lead here; a small model's rewrite is usually worse than
 *    the deterministic fallback.
 *  - `seo` is metadata: it must be accurate and boring, and a small fast model
 *    is genuinely enough.
 *  - `faq` is a handful of question/answer pairs — cheap and structured.
 *  - `chat` is the dashboard assistant: latency is what the user feels, so the
 *    fastest provider wins even if it is not the best writer.
 */
export const TASK_PROFILES: Record<LlmTask, TaskProfile> = {
  content: {
    label: "Website copy",
    prefer: ["groq", "gemini", "openai", "anthropic", "custom", "openrouter", "nvidia", "zai", "ollama"],
    maxTokens: 2000,
    size: "large",
  },
  copy: {
    label: "One section's words",
    prefer: ["gemini", "anthropic", "openai", "groq", "custom", "openrouter", "zai", "nvidia", "ollama"],
    maxTokens: 700,
    size: "small",
  },
  seo: {
    label: "Page title and description",
    prefer: ["groq", "gemini", "zai", "openrouter", "openai", "anthropic", "custom", "nvidia", "ollama"],
    maxTokens: 400,
    size: "small",
  },
  faq: {
    label: "Questions and answers",
    prefer: ["groq", "zai", "gemini", "openrouter", "openai", "anthropic", "custom", "nvidia", "ollama"],
    maxTokens: 900,
    size: "small",
  },
  chat: {
    label: "Dashboard assistant",
    prefer: ["groq", "gemini", "openai", "anthropic", "zai", "openrouter", "nvidia", "custom", "ollama"],
    maxTokens: 800,
    size: "small",
  },
};

/** Cost per million tokens, in USD. Published list prices, for an estimate only. */
export const PRICES: Partial<Record<LlmProvider, { in: number; out: number }>> = {
  // Free tiers. Ollama is free because it is our own box.
  groq: { in: 0, out: 0 },
  gemini: { in: 0, out: 0 },
  zai: { in: 0, out: 0 },
  nvidia: { in: 0, out: 0 },
  ollama: { in: 0, out: 0 },
  openrouter: { in: 0, out: 0 },
  openai: { in: 0.15, out: 0.6 },
  anthropic: { in: 0.8, out: 4 },
  custom: { in: 0, out: 0 },
};

/** Rough character count → tokens, for providers that do not report usage. */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.round((text || "").length / 4));
}

/** What one call cost, in USD. Zero for the free providers. */
export function estimateCost(provider: LlmProvider, tokensIn: number, tokensOut: number): number {
  const price = PRICES[provider];
  if (!price) return 0;
  return (tokensIn / 1_000_000) * price.in + (tokensOut / 1_000_000) * price.out;
}

export interface RouteDecision {
  provider: LlmProvider;
  /** Where it sits in the list that will be tried. */
  rank: number;
  /** Why it is here, for the admin view. */
  because: string;
}

/**
 * The chain for one task: configured providers, ordered for the job, with the
 * unavailable and the over-quota ones already removed.
 *
 * `LLM_PROVIDER` still wins over all of this — an operator pinning a provider is
 * a decision, not a preference.
 */
export async function chainForTask(task: LlmTask): Promise<LlmProvider[]> {
  const configured = providerChain();
  if (!configured.length) return [];

  const profile = TASK_PROFILES[task] ?? TASK_PROFILES.content;
  const preferred = profile.prefer.filter((p) => configured.includes(p));
  // Anything configured but not named in the profile follows, in the chain's
  // own order (cheapest first), so a newly added provider still gets a turn.
  const rest = configured.filter((p) => !preferred.includes(p));
  const ordered = [...preferred, ...rest];

  const { usedCount } = await usageToday();
  const kept: LlmProvider[] = [];
  for (const provider of ordered) {
    const budget = providerBudget(provider);
    if (budget && (usedCount[provider] ?? 0) >= budget) {
      // Over its ceiling for today: skipped without a sound, like a failure.
      console.warn(`[llm] ${provider} is at its daily ceiling (${budget}) — routing around it`);
      continue;
    }
    kept.push(provider);
  }
  return kept;
}

/** How the decision was reached, for the admin view. */
export function routingTable(): { provider: LlmProvider; env: string; configured: boolean; budget: number | null; price: string }[] {
  return PROVIDER_ORDER.map(({ provider, env }) => {
    const price = PRICES[provider];
    return {
      provider,
      env,
      configured: Boolean(process.env[env]),
      budget: providerBudget(provider),
      price: !price || (price.in === 0 && price.out === 0) ? "free" : `$${price.in}/$${price.out} per M`,
    };
  });
}

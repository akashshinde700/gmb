// WebSetu — what the AI has been doing, and how much of each provider is left.
//
// Every attempt against every provider is recorded here, successes and failures
// alike. Two reasons:
//
//   - the provider chain is silent by design, which means a provider that has
//     been rate-limiting all day looks exactly like a provider that is working
//     until somebody counts;
//   - daily ceilings (LLM_DAILY_CAP_<PROVIDER>, else a sane default for the free
//     tiers) need a count to enforce, and running out of a free tier in the
//     middle of a customer's signup is the failure this whole design exists to
//     prevent.

import { db } from "@/lib/db";
import type { LlmProvider } from "@/lib/llm-chain";

/**
 * Daily ceilings per provider.
 *
 * The free tiers all have published limits; these sit comfortably under them, so
 * a burst of signups degrades to the next provider instead of burning the quota
 * the whole platform depends on. Override per installation with
 * LLM_DAILY_CAP_GROQ=5000 and so on. Zero or negative means no ceiling.
 */
const DEFAULT_BUDGETS: Partial<Record<LlmProvider, number>> = {
  groq: 6_000,
  gemini: 4_000,
  zai: 2_000,
  openrouter: 1_500,
  nvidia: 1_000,
  // Paid providers are limited by the operator's wallet, not by a free tier.
  openai: 0,
  anthropic: 0,
  ollama: 0,
  custom: 0,
};

export function providerBudget(provider: LlmProvider): number | null {
  const fromEnv = Number(process.env[`LLM_DAILY_CAP_${provider.toUpperCase()}`] ?? "");
  const value = Number.isFinite(fromEnv) && process.env[`LLM_DAILY_CAP_${provider.toUpperCase()}`] !== undefined
    ? fromEnv
    : DEFAULT_BUDGETS[provider] ?? 0;
  return value > 0 ? value : null;
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export interface UsageToday {
  /** Attempts per provider since midnight UTC. */
  usedCount: Record<string, number>;
  /** Failures per provider since midnight UTC. */
  failedCount: Record<string, number>;
}

/** Today's counts, in one query. */
export async function usageToday(): Promise<UsageToday> {
  const since = startOfToday();
  try {
    const rows = await db.llmUsage.groupBy({
      by: ["provider", "ok"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    });
    const usedCount: Record<string, number> = {};
    const failedCount: Record<string, number> = {};
    for (const row of rows) {
      const count = row._count._all;
      usedCount[row.provider] = (usedCount[row.provider] ?? 0) + count;
      if (!row.ok) failedCount[row.provider] = (failedCount[row.provider] ?? 0) + count;
    }
    return { usedCount, failedCount };
  } catch (e) {
    // A bookkeeping failure must never stop a customer's copy being written.
    console.error("[llm-usage] could not read today's usage:", e instanceof Error ? e.message : e);
    return { usedCount: {}, failedCount: {} };
  }
}

export interface UsageRecord {
  task: string;
  provider: LlmProvider;
  model?: string;
  ok: boolean;
  latencyMs: number;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  error?: string;
  businessId?: string;
}

/** Record one attempt. Never throws — this is bookkeeping. */
export async function recordUsage(entry: UsageRecord): Promise<void> {
  try {
    await db.llmUsage.create({
      data: {
        task: entry.task.slice(0, 40),
        provider: entry.provider,
        model: (entry.model ?? "").slice(0, 80),
        ok: entry.ok,
        latencyMs: Math.max(0, Math.round(entry.latencyMs)),
        tokensIn: Math.max(0, Math.round(entry.tokensIn ?? 0)),
        tokensOut: Math.max(0, Math.round(entry.tokensOut ?? 0)),
        costUsd: entry.costUsd ?? 0,
        error: (entry.error ?? "").slice(0, 300),
        businessId: entry.businessId ?? "",
      },
    });
  } catch (e) {
    console.error("[llm-usage] could not record an attempt:", e instanceof Error ? e.message : e);
  }
}

export interface ProviderHealth {
  provider: string;
  calls: number;
  failures: number;
  /** Average latency of successful calls, ms. */
  avgMs: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  /** The most recent failure, for the admin view. */
  lastError: string;
  lastAt: string | null;
}

/**
 * Per-provider health over the last `days`.
 *
 * Deliberately reading the recorded attempts rather than trusting the config:
 * the question being answered is "is this provider actually working", and the
 * only honest source for that is what happened.
 */
export async function providerHealth(days = 7): Promise<ProviderHealth[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await db.llmUsage.findMany({
    where: { createdAt: { gte: since } },
    select: { provider: true, ok: true, latencyMs: true, tokensIn: true, tokensOut: true, costUsd: true, error: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 5_000,
  });

  const map = new Map<string, ProviderHealth & { msSum: number; okCount: number }>();
  for (const row of rows) {
    const entry = map.get(row.provider) ?? {
      provider: row.provider, calls: 0, failures: 0, avgMs: 0, tokensIn: 0, tokensOut: 0,
      costUsd: 0, lastError: "", lastAt: null, msSum: 0, okCount: 0,
    };
    entry.calls++;
    entry.tokensIn += row.tokensIn;
    entry.tokensOut += row.tokensOut;
    entry.costUsd += row.costUsd;
    if (!row.ok) {
      entry.failures++;
      if (!entry.lastError) entry.lastError = row.error;
    } else {
      entry.msSum += row.latencyMs;
      entry.okCount++;
    }
    if (!entry.lastAt) entry.lastAt = row.createdAt.toISOString();
    map.set(row.provider, entry);
  }

  return [...map.values()]
    .map(({ msSum, okCount, ...entry }) => ({ ...entry, avgMs: okCount ? Math.round(msSum / okCount) : 0 }))
    .sort((a, b) => b.calls - a.calls);
}

export interface TaskUsage {
  task: string;
  calls: number;
  failures: number;
  costUsd: number;
  /** Which provider answered most often. */
  topProvider: string;
}

/** Per-task numbers, so "what is costing money" has an answer. */
export async function taskUsage(days = 7): Promise<TaskUsage[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await db.llmUsage.findMany({
    where: { createdAt: { gte: since } },
    select: { task: true, provider: true, ok: true, costUsd: true },
    take: 5_000,
  });
  const map = new Map<string, { calls: number; failures: number; costUsd: number; byProvider: Map<string, number> }>();
  for (const row of rows) {
    const entry = map.get(row.task) ?? { calls: 0, failures: 0, costUsd: 0, byProvider: new Map() };
    entry.calls++;
    entry.costUsd += row.costUsd;
    if (!row.ok) entry.failures++;
    entry.byProvider.set(row.provider, (entry.byProvider.get(row.provider) ?? 0) + 1);
    map.set(row.task, entry);
  }
  return [...map.entries()]
    .map(([task, entry]) => ({
      task,
      calls: entry.calls,
      failures: entry.failures,
      costUsd: entry.costUsd,
      topProvider: [...entry.byProvider.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "",
    }))
    .sort((a, b) => b.calls - a.calls);
}

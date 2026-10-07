import { providerHealth, taskUsage, usageToday, providerBudget } from "@/lib/llm-usage";
import { TASK_PROFILES, PRICES, routingTable, type LlmTask } from "@/lib/llm-router";
import { providerChain } from "@/lib/llm-chain";
import { activeProvider as firstProvider } from "@/lib/llm-chain";
import { ok, requireAdmin, route } from "@/lib/api";

/**
 * GET /api/admin/ai-usage — the AI manager, as it actually behaved.
 *
 * Three things an operator needs and cannot get from the config: which providers
 * are configured and in what order, how much of each free tier is left today,
 * and what has been failing. Everything here is read back from the recorded
 * attempts — a provider that is rate-limiting all day looks identical to a
 * healthy one in the environment variables.
 */
export const GET = route(async (req: Request) => {
  await requireAdmin(req);

  const [health, tasks, today] = await Promise.all([providerHealth(7), taskUsage(7), usageToday()]);
  const chain = providerChain();

  const services = routingTable().map((row) => {
    const stat = health.find((h) => h.provider === row.provider);
    const budget = providerBudget(row.provider);
    const used = today.usedCount[row.provider] ?? 0;
    return {
      ...row,
      usedToday: used,
      leftToday: budget === null ? null : Math.max(0, budget - used),
      calls7d: stat?.calls ?? 0,
      failures7d: stat?.failures ?? 0,
      avgMs: stat?.avgMs ?? 0,
      costUsd7d: Number((stat?.costUsd ?? 0).toFixed(4)),
      lastError: stat?.lastError ?? "",
      inChain: chain.includes(row.provider),
    };
  });

  // What each kind of work is routed to, and what it has been costing.
  const taskRows = (Object.keys(TASK_PROFILES) as LlmTask[]).map((task) => {
    const profile = TASK_PROFILES[task];
    const stat = tasks.find((t) => t.task === task);
    return {
      task,
      label: profile.label,
      order: profile.prefer.filter((p) => chain.includes(p)),
      calls7d: stat?.calls ?? 0,
      failures7d: stat?.failures ?? 0,
      costUsd7d: Number((stat?.costUsd ?? 0).toFixed(4)),
      servedBy: stat?.topProvider ?? "",
    };
  });

  const totalCost = services.reduce((sum, s) => sum + s.costUsd7d, 0);
  const totalCalls = services.reduce((sum, s) => sum + s.calls7d, 0);
  const totalFailures = services.reduce((sum, s) => sum + s.failures7d, 0);

  return ok({
    configured: chain,
    firstChoice: firstProvider(),
    // The local, deterministic half of the pipeline costs nothing and cannot
    // fail — worth stating next to the model spend so the number is in context.
    local: [
      { task: "design planning", note: "deterministic genome — no model call" },
      { task: "validation", note: "the quality checker runs locally" },
      { task: "artwork", note: "SVG drawn on this server" },
    ],
    totals: {
      calls7d: totalCalls,
      failures7d: totalFailures,
      costUsd7d: Number(totalCost.toFixed(4)),
      costInr7d: Number((totalCost * 83).toFixed(2)),
      // A rough customer-facing number: what a typical generation costs.
      perGenerationUsd: totalCalls ? Number((totalCost / Math.max(1, taskRows.find((t) => t.task === "content")?.calls7d ?? 1)).toFixed(5)) : 0,
    },
    services,
    tasks: taskRows,
    prices: PRICES,
  });
});

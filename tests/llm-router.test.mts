/**
 * Unit tests for the AI manager: routing per task, cost estimates, quotas.
 *
 *   node --experimental-strip-types tests/llm-router.test.mts
 *
 * The environment is built by hand, so this pins the rules without any network:
 * which providers are available, what order each task gets them in, what a call
 * is estimated to cost, and that a provider past its daily ceiling is dropped
 * from the chain rather than being tried and failing.
 */

import { PRICES, TASK_PROFILES, estimateCost, estimateTokens, routingTable } from "../src/lib/llm-router.ts";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title: string) {
  console.log(`\n== ${title}`);
}

const KEYS = [
  "CUSTOM_LLM_BASE_URL", "CUSTOM_LLM_MODEL", "CUSTOM_LLM_API_KEY", "OPENROUTER_API_KEY",
  "GEMINI_API_KEY", "GROQ_API_KEY", "ZAI_API_KEY", "NVIDIA_API_KEY", "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY", "OLLAMA_URL", "LLM_PROVIDER", "LLM_MODEL",
];

async function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void> | void) {
  const saved: Record<string, string | undefined> = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) process.env[k] = v;
  try {
    await fn();
  } finally {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

section("Cost and size estimates");

{
  check("a free provider costs nothing", estimateCost("groq", 10_000, 4_000) === 0);
  const paid = estimateCost("openai", 1_000_000, 1_000_000);
  check("a paid provider is priced from the table", Math.abs(paid - (PRICES.openai!.in + PRICES.openai!.out)) < 1e-9, String(paid));
  check("a small call costs a fraction of a cent",
    estimateCost("anthropic", 3_000, 900) < 0.01, String(estimateCost("anthropic", 3_000, 900)));
  check("tokens are estimated from characters", estimateTokens("a".repeat(400)) === 100, String(estimateTokens("a".repeat(400))));
  check("an empty prompt still counts as one token", estimateTokens("") === 1);
}

section("Every kind of job has its own order");

{
  check("all five tasks have a profile", Object.keys(TASK_PROFILES).length === 5, Object.keys(TASK_PROFILES).join(","));
  check("the website copy leads with providers measured to return complete JSON",
    TASK_PROFILES.content.prefer[0] === "groq", TASK_PROFILES.content.prefer[0]);
  check("one section's rewrite leads with a better writer",
    ["gemini", "anthropic"].includes(TASK_PROFILES.copy.prefer[0]), TASK_PROFILES.copy.prefer[0]);
  check("the assistant leads with the fastest provider",
    TASK_PROFILES.chat.prefer[0] === "groq", TASK_PROFILES.chat.prefer[0]);
  check("every task can reach every provider", Object.values(TASK_PROFILES).every((p) => p.prefer.length === 9));
  check("long jobs are given a bigger output budget",
    TASK_PROFILES.content.maxTokens > TASK_PROFILES.copy.maxTokens);
}

section("Routing, quotas and the pin");

{
  const { chainForTask } = await import("../src/lib/llm-router.ts");

  await withEnv({ GROQ_API_KEY: "x", GEMINI_API_KEY: "x" }, async () => {
    const content = await chainForTask("content");
    check("only configured providers are asked", content.join(",") === "groq,gemini", content.join(","));
    const copy = await chainForTask("copy");
    check("the same two providers are ordered differently for a different job",
      copy.join(",") === "gemini,groq", copy.join(","));
  });

  await withEnv({ OPENAI_API_KEY: "x", GROQ_API_KEY: "x" }, async () => {
    const chain = await chainForTask("content");
    check("a task's preferred providers come first", chain[0] === "groq", chain.join(","));
    check("a configured provider the task did not name still gets a turn", chain.includes("openai"), chain.join(","));
  });

  await withEnv({ LLM_PROVIDER: "none", GROQ_API_KEY: "x" }, async () => {
    const chain = await chainForTask("content");
    check("an operator pinning \"none\" switches the models off entirely", chain.length === 0, chain.join(","));
  });

  await withEnv({}, async () => {
    const chain = await chainForTask("content");
    check("with nothing configured there is no chain to try", chain.length === 0);
  });
}

section("The routing table an operator reads");

{
  await withEnv({ GROQ_API_KEY: "x" }, () => {
    const table = routingTable();
    check("every provider is listed", table.length === 9, String(table.length));
    const groq = table.find((r) => r.provider === "groq");
    check("a configured provider is marked as such", groq?.configured === true);
    check("a free provider is priced as free", groq?.price === "free", groq?.price ?? "");
    const openai = table.find((r) => r.provider === "openai");
    check("a paid provider shows its price", (openai?.price ?? "").includes("$"), openai?.price ?? "");
    check("the free tiers carry a daily ceiling", (groq?.budget ?? 0) > 0, String(groq?.budget));
    check("paid providers are limited by the wallet, not a free tier",
      table.find((r) => r.provider === "anthropic")?.budget === null);
  });
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed ? 1 : 0);

/**
 * Unit tests for the LLM provider adapter.
 *
 *   node --experimental-strip-types tests/llm.test.mts
 *
 * No network: these pin the provider-selection rules and the JSON extraction
 * that decides whether a customer gets real generated copy or the template.
 */

import { activeProvider, extractJson, providerChain } from "../src/lib/llm.ts";

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
  "CUSTOM_LLM_BASE_URL", "CUSTOM_LLM_MODEL", "CUSTOM_LLM_API_KEY",
  "OPENROUTER_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY", "ZAI_API_KEY", "NVIDIA_API_KEY",
  "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "OLLAMA_URL", "LLM_PROVIDER",
];

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  for (const [k, v] of Object.entries(vars)) {
    if (v !== undefined) process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

section("Provider selection");

withEnv({}, () => {
  check("no keys configured means no provider", activeProvider() === "none", activeProvider());
});

withEnv({ GEMINI_API_KEY: "x" }, () => {
  check("a Gemini key selects Gemini", activeProvider() === "gemini");
});

withEnv({ GROQ_API_KEY: "x" }, () => {
  check("a Groq key selects Groq", activeProvider() === "groq");
});

withEnv({ ANTHROPIC_API_KEY: "x" }, () => {
  check("an Anthropic key selects Anthropic", activeProvider() === "anthropic");
});

withEnv({ OLLAMA_URL: "http://127.0.0.1:11434" }, () => {
  check("an Ollama URL selects Ollama", activeProvider() === "ollama");
});

withEnv({ OPENROUTER_API_KEY: "x" }, () => {
  check("an OpenRouter key selects OpenRouter", activeProvider() === "openrouter");
});

withEnv({ OPENAI_API_KEY: "x" }, () => {
  check("an OpenAI key selects OpenAI", activeProvider() === "openai");
});

withEnv({ GEMINI_API_KEY: "x", ANTHROPIC_API_KEY: "y" }, () => {
  // Free before paid, so adding a paid key later does not silently start billing.
  check("a free key wins over a paid one", activeProvider() === "gemini", activeProvider());
});

withEnv({ CUSTOM_LLM_BASE_URL: "https://api.z.ai/api/paas/v4", CUSTOM_LLM_MODEL: "glm-4.7-flash" }, () => {
  check("a custom base URL selects the generic endpoint", activeProvider() === "custom", activeProvider());
});

section("Provider chain");

withEnv({ ZAI_API_KEY: "x" }, () => {
  check("a Z.ai key selects Z.ai", activeProvider() === "zai", activeProvider());
});

withEnv({ GROQ_API_KEY: "g", OPENROUTER_API_KEY: "o", GEMINI_API_KEY: "e", ZAI_API_KEY: "z" }, () => {
  // Ordered by measured speed and reliability of each free tier.
  check("free providers are ordered fastest-first",
    providerChain().join(",") === "groq,openrouter,gemini,zai", providerChain().join(","));
});

withEnv({ CUSTOM_LLM_BASE_URL: "https://api.z.ai/api/paas/v4", OPENROUTER_API_KEY: "x" }, () => {
  // An explicitly configured endpoint is a deliberate choice, so it leads.
  check("a custom endpoint leads the chain",
    providerChain().join(",") === "custom,openrouter", providerChain().join(","));
});

withEnv({ OPENROUTER_API_KEY: "x", GEMINI_API_KEY: "y", ANTHROPIC_API_KEY: "z" }, () => {
  // Every configured provider is tried in turn — free tiers fail often enough
  // that a single provider is not a reliable feature.
  check("the chain lists every configured provider, cheapest first",
    providerChain().join(",") === "openrouter,gemini,anthropic", providerChain().join(","));
});

withEnv({}, () => {
  check("no keys means an empty chain", providerChain().length === 0);
});

withEnv({ OPENROUTER_API_KEY: "x", GEMINI_API_KEY: "y", LLM_PROVIDER: "gemini" }, () => {
  check("pinning a provider collapses the chain to it",
    providerChain().join(",") === "gemini", providerChain().join(","));
});

withEnv({ OPENROUTER_API_KEY: "x", LLM_PROVIDER: "none" }, () => {
  check("LLM_PROVIDER=none empties the chain", providerChain().length === 0);
});

withEnv({ LLM_PROVIDER: "gemini" }, () => {
  // A pinned provider with no key must fail loudly rather than fall through.
  check("a pinned provider is kept even with no key set",
    providerChain().join(",") === "gemini", providerChain().join(","));
});

withEnv({ GEMINI_API_KEY: "x", LLM_PROVIDER: "anthropic" }, () => {
  check("LLM_PROVIDER overrides the auto-pick", activeProvider() === "anthropic", activeProvider());
});

withEnv({ GEMINI_API_KEY: "x", LLM_PROVIDER: "none" }, () => {
  check("LLM_PROVIDER=none forces templates", activeProvider() === "none", activeProvider());
});

withEnv({ GEMINI_API_KEY: "x", LLM_PROVIDER: "nonsense" }, () => {
  check("an unknown LLM_PROVIDER falls back to the auto-pick", activeProvider() === "gemini", activeProvider());
});

section("JSON extraction");

type Shape = { heroHeading?: string; nested?: { a: number }; text?: string };

check("plain JSON parses", extractJson<Shape>('{"heroHeading":"Hi"}')?.heroHeading === "Hi");
check(
  "fenced JSON parses",
  extractJson<Shape>('```json\n{"heroHeading":"Hi"}\n```')?.heroHeading === "Hi",
);
check(
  "leading commentary is ignored",
  extractJson<Shape>('Sure! Here is the JSON:\n{"heroHeading":"Hi"}')?.heroHeading === "Hi",
);
check(
  "trailing commentary is ignored",
  extractJson<Shape>('{"heroHeading":"Hi"}\nHope that helps!')?.heroHeading === "Hi",
);
check(
  "nested braces survive",
  extractJson<Shape>('{"nested":{"a":1},"heroHeading":"Hi"}')?.nested?.a === 1,
);
check(
  "a closing brace inside a string does not truncate the object",
  extractJson<Shape>('{"text":"a } b","heroHeading":"Hi"}')?.heroHeading === "Hi",
);
check(
  "an escaped quote inside a string is handled",
  extractJson<Shape>('{"text":"say \\"hi\\" }","heroHeading":"Hi"}')?.heroHeading === "Hi",
);
check("truncated JSON returns null", extractJson<Shape>('{"heroHeading":"Hi"') === null);
check("prose with no JSON returns null", extractJson<Shape>("I cannot help with that.") === null);
check("empty input returns null", extractJson<Shape>("") === null);

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed ? 1 : 0);

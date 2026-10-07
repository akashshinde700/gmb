// WebSetu — which model providers exist, and in what order they are tried.
//
// Kept apart from the adapter (lib/llm.ts) so the AI manager (lib/llm-router.ts)
// can reason about providers — quotas, costs, task fit — without the two files
// importing each other in a circle.

export type LlmProvider =
  | "custom" | "groq" | "openrouter" | "gemini" | "zai"
  | "nvidia" | "openai" | "anthropic" | "ollama" | "none";

/** Cheapest-first: free providers are tried before paid ones. */
export const PROVIDER_ORDER: { provider: LlmProvider; env: string }[] = [
  // An explicitly configured endpoint is a deliberate choice, so it goes first.
  { provider: "custom", env: "CUSTOM_LLM_BASE_URL" },
  // Groq leads the free providers: measured on the real prompt it answered in
  // 2.9s with a dedicated free tier (30 RPM / 14,400 per day), against
  // OpenRouter's shared pool and Gemini's 503s under load.
  { provider: "groq", env: "GROQ_API_KEY" },
  { provider: "openrouter", env: "OPENROUTER_API_KEY" },
  { provider: "gemini", env: "GEMINI_API_KEY" },
  // Z.ai's Flash models are free but slow — 16s on the real prompt — so they
  // sit behind the quicker free tiers rather than in front of them.
  { provider: "zai", env: "ZAI_API_KEY" },
  { provider: "nvidia", env: "NVIDIA_API_KEY" },
  { provider: "openai", env: "OPENAI_API_KEY" },
  { provider: "anthropic", env: "ANTHROPIC_API_KEY" },
  { provider: "ollama", env: "OLLAMA_URL" },
];

/**
 * Every provider that can be tried, in the order they will be tried.
 * `LLM_PROVIDER` pins the chain to one provider (or disables it with "none").
 */
export function providerChain(): LlmProvider[] {
  const forced = (process.env.LLM_PROVIDER || "").trim().toLowerCase();
  if (forced === "none") return [];
  if (forced) {
    const match = PROVIDER_ORDER.find((p) => p.provider === forced);
    // A pinned provider is used even if its key is missing, so a typo surfaces
    // as a loud failure rather than silently falling through to another one.
    if (match) return [match.provider];
  }
  return PROVIDER_ORDER.filter((p) => process.env[p.env]).map((p) => p.provider);
}

/** The provider that will be tried first — what the UI and credit check use. */
export function activeProvider(): LlmProvider {
  return providerChain()[0] ?? "none";
}

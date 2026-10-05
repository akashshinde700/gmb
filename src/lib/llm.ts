// WebSetu — text generation provider adapter.
//
// The scaffold shipped `z-ai-web-dev-sdk`, which reads a `.z-ai-config` file
// that only existed in the original dev sandbox. On this deployment every call
// threw and the route silently served its hardcoded fallback copy — the "AI
// writes your content" feature was never actually running.
//
// This picks whichever provider has a key configured, so the same build works
// on a free Gemini/Groq key today and a paid key later with no code change:
//
//   CUSTOM_LLM_BASE_URL any OpenAI-compatible endpoint (Groq, Cerebras, Mistral,
//                       DeepSeek, SambaNova, Nebius, Z AI, ModelScope, ...)
//   OPENROUTER_API_KEY  OpenRouter       (free `:free` models, one key many models)
//   GEMINI_API_KEY      Google AI Studio (free tier, no card)
//   GROQ_API_KEY        Groq             (free tier)
//   ZAI_API_KEY         Z.ai GLM         (free Flash models)
//   NVIDIA_API_KEY      NVIDIA NIM       (free credits, model access varies)
//   OPENAI_API_KEY      OpenAI           (paid, needs credits on the account)
//   ANTHROPIC_API_KEY   Claude           (paid, ~$0.007 per generation)
//   OLLAMA_URL          self-hosted      (free, slow on a CPU-only box)
//
// Most providers on lists like awesome-freellm-apis speak the OpenAI
// chat-completions shape and differ only in base URL, so `custom` covers them
// all without new code: set CUSTOM_LLM_BASE_URL, CUSTOM_LLM_API_KEY and
// CUSTOM_LLM_MODEL and it joins the chain.
//
// Every configured provider is tried in order, because free tiers fail often:
// measured on this project, OpenRouter free models get rate-limited and Gemini
// free returns 503 "high demand" — but rarely at the same moment. With none
// configured (or all failing) `generateJson` returns null and the caller keeps
// its deterministic fallback: the feature degrades, it never breaks.

export type LlmProvider =
  | "custom" | "groq" | "openrouter" | "gemini" | "zai"
  | "nvidia" | "openai" | "anthropic" | "ollama" | "none";

/** Cheapest-first: free providers are tried before paid ones. */
const PROVIDER_ORDER: { provider: LlmProvider; env: string }[] = [
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

/** Model per provider — overridable with LLM_MODEL. */
function modelFor(provider: LlmProvider): string {
  const override = (process.env.LLM_MODEL || "").trim();
  if (override) return override;
  switch (provider) {
    case "custom":
      return process.env.CUSTOM_LLM_MODEL || "";
    case "openrouter":
      // Free models come and go and get rate-limited; OPENROUTER_FALLBACK_MODEL
      // is tried when this one is unavailable. `npm run ai:check` lists what the
      // key can currently reach.
      return process.env.OPENROUTER_MODEL || "dots-studio/dots-3-note-preview:free";
    case "nvidia":
      return "meta/llama-3.3-70b-instruct";
    case "gemini":
      // 2.5-flash is retired for new keys; 3.6-flash and flash-latest returned
      // 503 "high demand" on the free tier when this was measured.
      return process.env.GEMINI_MODEL || "gemini-3.5-flash";
    case "zai":
      // glm-4.7-flash is the newest free model but returned 429 "overloaded"
      // when measured; 4.5-flash answered.
      return process.env.ZAI_MODEL || "glm-4.5-flash";
    case "groq":
      // llama-3.3-70b-versatile was retired; gpt-oss-20b fails Groq's JSON
      // validation on this prompt. 120b answered in 2.9s with full content.
      return process.env.GROQ_MODEL || "openai/gpt-oss-120b";
    case "openai":
      return process.env.OPENAI_MODEL || "gpt-4o-mini";
    case "anthropic":
      // Cheapest Claude; this task is short and highly structured.
      return "claude-haiku-4-5";
    case "ollama":
      return "qwen2.5:3b";
    default:
      return "";
  }
}

const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 12_000);

/**
 * Hard ceiling for a whole generateJson call, across every provider tried.
 *
 * Each provider gets its own timeout, and most have a fallback model too, so a
 * chain of five providers could legitimately sit for minutes — which is what it
 * did: the wizard hung and the browser gave up with ERR_TIMED_OUT before any
 * website was created. The copy is a nice-to-have with a good deterministic
 * fallback, so it gets a budget and the customer gets their site on time.
 */
const BUDGET_MS = Number(process.env.LLM_BUDGET_MS || 24_000);

/** Pull the first balanced JSON object out of a reply, fences and all. */
export function extractJson<T>(raw: string): T | null {
  if (!raw) return null;
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') inString = !inString;
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(cleaned.slice(start, i + 1)) as T;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

async function post(url: string, headers: Record<string, string>, body: unknown, budgetMs?: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(TIMEOUT_MS, budgetMs ?? TIMEOUT_MS));
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`${res.status} ${detail.slice(0, 300)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** One attempt against one provider. Throws so the chain can move on. */
async function generateWith<T>(
  provider: LlmProvider,
  opts: { system: string; prompt: string; maxTokens?: number },
  budgetMs?: number,
): Promise<{ content: T; provider: LlmProvider; model: string }> {
  const model = modelFor(provider);
  const maxTokens = opts.maxTokens ?? 2000;
  let text = "";

  if (
    provider === "custom" ||
    provider === "openrouter" ||
    provider === "nvidia" ||
    provider === "openai" ||
    provider === "groq" ||
    provider === "zai"
  ) {
    // All of these speak the OpenAI chat-completions shape and differ only in
    // base URL and key.
    const isOpenRouter = provider === "openrouter";
    const url =
      provider === "custom"
        ? `${(process.env.CUSTOM_LLM_BASE_URL || "").replace(/\/$/, "")}/chat/completions`
        : provider === "openrouter"
          ? "https://openrouter.ai/api/v1/chat/completions"
          : provider === "nvidia"
            ? "https://integrate.api.nvidia.com/v1/chat/completions"
            : provider === "groq"
              ? "https://api.groq.com/openai/v1/chat/completions"
              : provider === "zai"
                ? "https://api.z.ai/api/paas/v4/chat/completions"
                : "https://api.openai.com/v1/chat/completions";
    const key =
      provider === "custom"
        ? process.env.CUSTOM_LLM_API_KEY
        : provider === "openrouter"
          ? process.env.OPENROUTER_API_KEY
          : provider === "nvidia"
            ? process.env.NVIDIA_API_KEY
            : provider === "groq"
              ? process.env.GROQ_API_KEY
              : provider === "zai"
                ? process.env.ZAI_API_KEY
                : process.env.OPENAI_API_KEY;

    if (provider === "custom" && !model) {
      throw new Error("CUSTOM_LLM_MODEL is required alongside CUSTOM_LLM_BASE_URL");
    }

    const body = {
      model,
      temperature: 0.7,
      max_tokens: maxTokens,
      // A few free endpoints reject response_format outright; set
      // CUSTOM_LLM_NO_JSON_MODE=1 for those — the reply is parsed leniently
      // anyway, so JSON mode is a hint rather than a requirement.
      ...(provider === "custom" && process.env.CUSTOM_LLM_NO_JSON_MODE === "1"
        ? {}
        : { response_format: { type: "json_object" as const } }),
      // Most free models are reasoning models: left on, they spend the whole
      // budget in `reasoning` and return `content: null` with finish_reason
      // "length". Measured on the real prompt, disabling it took one candidate
      // from a 2000-token empty answer to a full one in 1.5s.
      //
      // Always sent for OpenRouter, which defines the field. For a custom
      // endpoint it is opt-in (CUSTOM_LLM_DISABLE_REASONING=1) because strict
      // APIs — OpenAI among them — reject unknown body parameters with a 400.
      ...(isOpenRouter || (provider === "custom" && process.env.CUSTOM_LLM_DISABLE_REASONING === "1")
        ? { reasoning: { enabled: false } }
        : {}),
      // GLM is a hybrid reasoning model and thinks by default: measured at 39s
      // and 163 completion tokens for a one-line answer. Z.ai spells the switch
      // differently from OpenRouter — this is the parameter the scaffold's own
      // z-ai SDK call used.
      ...(provider === "zai" ? { thinking: { type: "disabled" } } : {}),
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.prompt },
      ],
    };

    const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
    if (isOpenRouter) {
      // OpenRouter attributes usage to these; they are optional but show the
      // app name on the dashboard instead of "unknown".
      headers["HTTP-Referer"] = process.env.NEXT_PUBLIC_APP_URL || "https://websetu.in";
      headers["X-Title"] = "WebSetu";
    }

    type ChatResponse = { choices?: { message?: { content?: string | null } }[] };
    const readText = (d: ChatResponse) => d.choices?.[0]?.message?.content ?? "";

    let data: ChatResponse;
    try {
      data = (await post(url, headers, body, budgetMs)) as ChatResponse;
      // A model that answered with nothing is a failure, not a success.
      if (!readText(data).trim()) throw new Error("empty completion");
    } catch (e) {
      // Free models go busy or get retired; fall back to a second model
      // rather than dropping the customer to templates.
      const alt =
        provider === "custom"
          ? process.env.CUSTOM_LLM_FALLBACK_MODEL
          : provider === "openrouter"
            ? process.env.OPENROUTER_FALLBACK_MODEL
            : provider === "nvidia"
              ? process.env.NVIDIA_FALLBACK_MODEL
              : provider === "groq"
                ? process.env.GROQ_FALLBACK_MODEL
                : provider === "zai"
                  ? process.env.ZAI_FALLBACK_MODEL
                  : process.env.OPENAI_FALLBACK_MODEL;
      if (!alt) throw e;
      console.error(`[llm] ${provider}/${model} failed (${e instanceof Error ? e.message : e}), retrying with ${alt}`);
      data = (await post(url, headers, { ...body, model: alt }, budgetMs)) as ChatResponse;
    }
    text = readText(data);
  } else if (provider === "gemini") {
    const data = (await post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      { "x-goog-api-key": process.env.GEMINI_API_KEY! },
      {
        system_instruction: { parts: [{ text: opts.system }] },
        contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: maxTokens,
          responseMimeType: "application/json",
          // Gemini Flash thinks by default: measured on a 9-token answer it
          // spent 157 thinking tokens, and at a low output cap it can spend the
          // whole budget and return nothing. The copy task does not need it.
          thinkingConfig: { thinkingBudget: 0 },
        },
      },
      budgetMs,
    )) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  } else if (provider === "anthropic") {
    const data = (await post(
      "https://api.anthropic.com/v1/messages",
      {
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      {
        model,
        max_tokens: maxTokens,
        system: opts.system,
        messages: [{ role: "user", content: opts.prompt }],
      },
      budgetMs,
    )) as { content?: { type: string; text?: string }[]; stop_reason?: string };
    text = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  } else {
    // Ollama on the same host — no key, no network egress.
    const data = (await post(
      `${(process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "")}/api/chat`,
      {},
      {
        model,
        stream: false,
        format: "json",
        options: { temperature: 0.7, num_predict: maxTokens },
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.prompt },
        ],
      },
      budgetMs,
    )) as { message?: { content?: string } };
    text = data.message?.content ?? "";
  }

  const content = extractJson<T>(text);
  if (!content) throw new Error("no parsable JSON in the reply");
  return { content, provider, model };
}

/**
 * Ask the configured providers for a JSON object, in order, stopping at the
 * first that answers. Returns null when none is configured or all fail — the
 * caller must always have its own fallback.
 */
export async function generateJson<T>(opts: {
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<{ content: T; provider: LlmProvider; model: string } | null> {
  const chain = providerChain();
  if (!chain.length) return null;

  const deadline = Date.now() + BUDGET_MS;
  for (const provider of chain) {
    const left = deadline - Date.now();
    // Starting an attempt that cannot finish inside the budget only delays the
    // fallback copy the customer is going to get anyway.
    if (left < 3_000) {
      console.error(`[llm] out of time after ${provider === chain[0] ? "first" : "previous"} provider — using template copy`);
      return null;
    }
    try {
      return await generateWith<T>(provider, opts, left);
    } catch (e) {
      // Provider errors never reach the customer; the next one gets a turn.
      console.error(`[llm] ${provider} failed:`, e instanceof Error ? e.message : e);
    }
  }
  return null;
}

/**
 * Verify the configured AI provider actually works, and — on OpenRouter — show
 * which free models your key can currently reach.
 *
 *   node scripts/ai-check.mjs                       # reads keys from the environment
 *   OPENROUTER_API_KEY=sk-or-... node scripts/ai-check.mjs
 *   node scripts/ai-check.mjs --model deepseek/deepseek-chat-v3-0324:free
 *
 * Free model IDs on OpenRouter change over time; this asks the provider rather
 * than trusting a hardcoded list. It makes one small real request, so it costs
 * whatever one short completion costs (nothing on a `:free` model).
 */

const args = process.argv.slice(2);
const modelArg = args.includes("--model") ? args[args.indexOf("--model") + 1] : null;

const SYSTEM = "Reply with valid JSON only. No markdown, no commentary.";
const PROMPT =
  'Return exactly this JSON with a short friendly value: {"ok": true, "greeting": "<8 words or fewer>"}';

// Must mirror PROVIDER_ORDER in src/lib/llm.ts.
const PROVIDER_ORDER = [
  ["custom", "CUSTOM_LLM_BASE_URL"],
  ["groq", "GROQ_API_KEY"],
  ["openrouter", "OPENROUTER_API_KEY"],
  ["gemini", "GEMINI_API_KEY"],
  ["zai", "ZAI_API_KEY"],
  ["nvidia", "NVIDIA_API_KEY"],
  ["openai", "OPENAI_API_KEY"],
  ["anthropic", "ANTHROPIC_API_KEY"],
  ["ollama", "OLLAMA_URL"],
];

function providerChain() {
  const forced = (process.env.LLM_PROVIDER || "").trim().toLowerCase();
  if (forced === "none") return [];
  if (forced) return PROVIDER_ORDER.filter(([p]) => p === forced).map(([p]) => p);
  return PROVIDER_ORDER.filter(([, env]) => process.env[env]).map(([p]) => p);
}

const DEFAULT_MODEL = {
  custom: process.env.CUSTOM_LLM_MODEL || "",
  openrouter: process.env.OPENROUTER_MODEL || "dots-studio/dots-3-note-preview:free",
  gemini: process.env.GEMINI_MODEL || "gemini-3.5-flash",
  groq: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
  zai: process.env.ZAI_MODEL || "glm-4.5-flash",
  nvidia: "meta/llama-3.3-70b-instruct",
  openai: process.env.OPENAI_MODEL || "gpt-4o-mini",
  anthropic: "claude-haiku-4-5",
  ollama: "qwen2.5:3b",
};

async function listOpenRouterFreeModels() {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
    });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.data || [])
      .filter((m) => {
        const p = m.pricing || {};
        // "free" means both prompt and completion cost 0.
        return Number(p.prompt ?? 1) === 0 && Number(p.completion ?? 1) === 0;
      })
      .map((m) => ({ id: m.id, ctx: m.context_length }))
      .sort((a, b) => (b.ctx || 0) - (a.ctx || 0));
  } catch {
    return [];
  }
}

async function callProvider(provider, model) {
  const started = Date.now();

  if (
    provider === "custom" || provider === "openrouter" || provider === "nvidia" ||
    provider === "openai" || provider === "groq" || provider === "zai"
  ) {
    const isOR = provider === "openrouter";
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
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        ...(isOR ? { "HTTP-Referer": "https://websetu.in", "X-Title": "WebSetu" } : {}),
      },
      body: JSON.stringify({
        model,
        max_tokens: 200,
        temperature: 0.5,
        // Free reasoning models otherwise spend the whole budget thinking.
        ...(isOR || (provider === "custom" && process.env.CUSTOM_LLM_DISABLE_REASONING === "1")
          ? { reasoning: { enabled: false } }
          : {}),
        ...(provider === "zai" ? { thinking: { type: "disabled" } } : {}),
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: PROMPT },
        ],
      }),
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${body.slice(0, 400)}`);
    const json = JSON.parse(body);
    return { text: json.choices?.[0]?.message?.content ?? "", ms: Date.now() - started, usage: json.usage };
  }

  if (provider === "gemini") {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: "user", parts: [{ text: PROMPT }] }],
          generationConfig: {
            maxOutputTokens: 200,
            responseMimeType: "application/json",
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      },
    );
    const body = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${body.slice(0, 400)}`);
    const json = JSON.parse(body);
    return {
      text: json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "",
      ms: Date.now() - started,
    };
  }

  if (provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 200,
        system: SYSTEM,
        messages: [{ role: "user", content: PROMPT }],
      }),
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${body.slice(0, 400)}`);
    const json = JSON.parse(body);
    return {
      text: (json.content || []).filter((b) => b.type === "text").map((b) => b.text).join(""),
      ms: Date.now() - started,
      usage: json.usage,
    };
  }

  const res = await fetch(`${(process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      format: "json",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: PROMPT },
      ],
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${body.slice(0, 400)}`);
  return { text: JSON.parse(body).message?.content ?? "", ms: Date.now() - started };
}

async function main() {
  const chain = providerChain();
  if (!chain.length) {
    console.log("No provider key found in the environment.\n");
    console.log("Set one of: OPENROUTER_API_KEY, GEMINI_API_KEY, GROQ_API_KEY,");
    console.log("NVIDIA_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, or OLLAMA_URL —");
    console.log("or point CUSTOM_LLM_BASE_URL / CUSTOM_LLM_API_KEY / CUSTOM_LLM_MODEL");
    console.log("at any OpenAI-compatible provider.");
    process.exit(1);
  }

  // Every configured provider is checked: the app falls back through all of
  // them, so knowing which ones are healthy is the point of this script.
  if (chain.length > 1) console.log(`chain    : ${chain.join(" -> ")}\n`);

  const provider = chain[0];
  const model = modelArg || DEFAULT_MODEL[provider];
  console.log(`provider : ${provider}`);
  console.log(`model    : ${model}\n`);

  if (provider === "openrouter" && !modelArg) {
    const free = await listOpenRouterFreeModels();
    if (free.length) {
      console.log(`Free models your key can reach (${free.length} total), largest context first:`);
      for (const m of free.slice(0, 12)) console.log(`  ${m.id}${m.ctx ? `  (${m.ctx.toLocaleString()} ctx)` : ""}`);
      console.log("");
    }
  }

  try {
    const { text, ms, usage } = await callProvider(provider, model);
    const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    let parsed = null;
    try {
      parsed = JSON.parse(cleaned.slice(cleaned.indexOf("{"), cleaned.lastIndexOf("}") + 1));
    } catch {
      /* reported below */
    }

    console.log(`response : ${cleaned.slice(0, 200) || "(empty)"}`);
    console.log(`latency  : ${ms} ms`);
    if (usage) console.log(`usage    : ${JSON.stringify(usage)}`);
    console.log(parsed ? "\nOK — valid JSON returned. This key is ready to use." : "\nWARNING — the reply was not valid JSON.");

    // Report the rest of the chain so a dead backup is visible before it is needed.
    for (const other of chain.slice(1)) {
      const otherModel = DEFAULT_MODEL[other];
      try {
        const r = await callProvider(other, otherModel);
        const good = r.text && r.text.includes("{");
        console.log(`fallback : ${other} (${otherModel}) — ${good ? "OK" : "replied without JSON"} in ${r.ms} ms`);
      } catch (e) {
        console.log(`fallback : ${other} (${otherModel}) — FAILED: ${(e instanceof Error ? e.message : String(e)).slice(0, 120)}`);
      }
    }

    process.exit(parsed ? 0 : 1);
  } catch (e) {
    console.error(`\nFAILED: ${e instanceof Error ? e.message : e}`);
    if (provider === "openrouter") {
      console.error("\nIf this says the model is not found, pick one from the list above:");
      console.error("  node scripts/ai-check.mjs --model <id>");
    }
    process.exit(1);
  }
}

main();

import { HttpError, limitOrThrow, route } from "@/lib/api";
import {
  FREEMODELS_DEFAULT_MODEL,
  FREEMODELS_MODEL_IDS,
  FREEMODELS_UPSTREAM_URL,
} from "@/lib/freemodels";

const MAX_BODY_BYTES = 128 * 1024;
const MAX_MESSAGES = 50;
const MAX_MESSAGE_CHARS = 20_000;

type Message = { role: "system" | "user" | "assistant"; content: string };

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const contentLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    throw new HttpError("Request body is too large", 413);
  }

  const reader = req.body?.getReader();
  if (!reader) throw new HttpError("Request body is required");

  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new HttpError("Request body is too large", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new HttpError("Invalid request body", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError("Invalid request body", 400);
  }
  return body as Record<string, unknown>;
}

function validateMessages(value: unknown): Message[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MESSAGES) {
    throw new HttpError(`messages must contain between 1 and ${MAX_MESSAGES} items`);
  }
  return value.map((message) => {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      throw new HttpError("Each message must have a valid role and content");
    }
    const { role, content } = message as Record<string, unknown>;
    if (
      role !== "system" && role !== "user" && role !== "assistant" ||
      typeof content !== "string" || content.length > MAX_MESSAGE_CHARS
    ) {
      throw new HttpError("Each message must have a valid role and content");
    }
    return { role, content };
  });
}

function optionalBoolean(value: unknown, name: string): boolean {
  if (value === undefined) return false;
  if (typeof value !== "boolean") throw new HttpError(`${name} must be a boolean`);
  return value;
}

export const POST = route(async (req: Request) => {
  limitOrThrow(req, "freemodels:chat", 10, 60_000);
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new HttpError("Content-Type must be application/json", 415);
  }

  const body = await readBody(req);
  const messages = validateMessages(body.messages);
  const modelId = body.modelId === undefined ? FREEMODELS_DEFAULT_MODEL : body.modelId;
  if (typeof modelId !== "string" || !FREEMODELS_MODEL_IDS.has(modelId)) {
    throw new HttpError("Unsupported modelId");
  }
  const thinking = optionalBoolean(body.thinking, "thinking");
  const deepSearch = optionalBoolean(body.deepSearch, "deepSearch");
  const stream = body.stream === undefined ? true : body.stream;
  if (typeof stream !== "boolean") throw new HttpError("stream must be a boolean");

  let upstream: Response;
  try {
    upstream = await fetch(FREEMODELS_UPSTREAM_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://freemodels.pro",
        Referer: "https://freemodels.pro/",
      },
      body: JSON.stringify({ messages, modelId, thinking, deepSearch, stream }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(120_000),
    });
  } catch (error) {
    console.error("[freemodels] upstream request failed:", error);
    return Response.json({ error: "FreeModels upstream is unavailable" }, { status: 502 });
  }

  if (!upstream.ok) {
    await upstream.body?.cancel();
    return Response.json(
      { error: "FreeModels upstream request failed", upstreamStatus: upstream.status },
      { status: 502 },
    );
  }

  if (stream) {
    const contentType = upstream.headers.get("content-type") ?? "";
    if (!upstream.body || !contentType.toLowerCase().includes("text/event-stream")) {
      await upstream.body?.cancel();
      return Response.json({ error: "FreeModels returned an invalid stream response" }, { status: 502 });
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  }

  let result: unknown;
  try {
    result = await upstream.json();
  } catch {
    return Response.json({ error: "FreeModels returned invalid JSON" }, { status: 502 });
  }
  if (!result || typeof result !== "object" || !("content" in result) || typeof result.content !== "string") {
    return Response.json({ error: "FreeModels returned an invalid response" }, { status: 502 });
  }
  return Response.json({ content: result.content, model: modelId });
});

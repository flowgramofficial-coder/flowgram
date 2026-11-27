import Anthropic from "@anthropic-ai/sdk";

export interface GenerateRequest {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens: number;
}
export interface LlmProvider {
  name: string;
  generate(req: GenerateRequest): Promise<string>;
}

/** Plain-text generation only: no tools are ever passed, so the model cannot take actions. */
export class AnthropicProvider implements LlmProvider {
  readonly name: string;
  constructor(private readonly client: Anthropic, private readonly model: string, private readonly timeoutMs = 12_000) {
    this.name = `anthropic:${model}`;
  }
  async generate(req: GenerateRequest): Promise<string> {
    const res = await this.client.messages.create(
      { model: this.model, max_tokens: req.maxTokens, system: req.system, messages: req.messages },
      { timeout: this.timeoutMs, maxRetries: 0 },
    );
    return res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  }
}

/** OpenAI-compatible chat completions provider (Gemini Free, Groq Free, OpenRouter Free). No tools passed. */
export class OpenAiCompatibleProvider implements LlmProvider {
  readonly name: string;
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly model: string,
    label = "openai-compat",
    private readonly timeoutMs = 12_000,
    private readonly f: typeof fetch = fetch,
  ) {
    this.name = `${label}:${model}`;
  }

  async generate(req: GenerateRequest): Promise<string> {
    const res = await this.f(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: req.maxTokens,
        messages: [{ role: "system", content: req.system }, ...req.messages],
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const j = (await res.json().catch(() => ({}))) as {
      choices?: Array<{ message?: { content?: string | null } }>;
      error?: { message?: string };
    };
    const text = j.choices?.[0]?.message?.content?.trim();
    if (!res.ok || !text) {
      throw new Error(`${this.name} failed (${res.status}): ${j.error?.message ?? "empty response"}`);
    }
    return text;
  }
}

export interface Embedder {
  readonly dimensions: number;
  embed(text: string): Promise<number[]>;
}

/** Any OpenAI-compatible /embeddings endpoint (supports OpenAI and Google Gemini gemini-embedding-001 at 1536 dims). */
export class OpenAiCompatibleEmbedder implements Embedder {
  readonly dimensions = 1536;
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.openai.com/v1",
    private readonly model = "text-embedding-3-small",
    private readonly f: typeof fetch = fetch,
  ) {}
  async embed(text: string): Promise<number[]> {
    const res = await this.f(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: this.model, input: text.slice(0, 8000), dimensions: this.dimensions }),
      signal: AbortSignal.timeout(8_000),
    });
    const j = (await res.json().catch(() => ({}))) as { data?: Array<{ embedding: number[] }> };
    const v = j.data?.[0]?.embedding;
    if (!res.ok || !v || v.length !== this.dimensions) throw new Error(`embedding failed (${res.status})`);
    return v;
  }
}

/** Picks Gemini Free embeddings if GEMINI_API_KEY is set and EMBEDDING_API_KEY is absent/placeholder; otherwise OpenAI. */
export function createEmbedderFromEnv(env: NodeJS.ProcessEnv = process.env): Embedder {
  const openaiKey = env.EMBEDDING_API_KEY;
  if (openaiKey && !openaiKey.startsWith("dev_")) {
    return new OpenAiCompatibleEmbedder(openaiKey);
  }
  if (env.GEMINI_API_KEY && !env.GEMINI_API_KEY.startsWith("dev_")) {
    return new OpenAiCompatibleEmbedder(
      env.GEMINI_API_KEY,
      "https://generativelanguage.googleapis.com/v1beta/openai",
      "gemini-embedding-001",
    );
  }
  return new OpenAiCompatibleEmbedder(openaiKey ?? env.GEMINI_API_KEY ?? "");
}

/** pgvector literal for a parameterised query: "[0.1,0.2,...]" */
export function toPgVector(v: number[]): string {
  return `[${v.join(",")}]`;
}

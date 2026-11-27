import Anthropic from "@anthropic-ai/sdk";
import { Worker } from "bullmq";
import { pino } from "pino";
import { createDb, createPool } from "@flowgram/db";
import { AnthropicProvider, OpenAiCompatibleProvider, createEmbedderFromEnv, type GenerateRequest, type LlmProvider } from "@flowgram/ai-engine";
import { IgApiError, IgClient } from "@flowgram/ig-client";
import {
  CONCURRENCY, TokenBucket, attachDlq, backoffStrategy, createBreaker, createConnection, createQueues,
} from "@flowgram/queue";
import { REDACT_PATHS, keyProviderFromEnv } from "@flowgram/security";
import {
  QUEUES, aiPersonaJobSchema, commentJobSchema, dmInboundJobSchema, dmWelcomeJobSchema, stripeEventJobSchema,
} from "@flowgram/shared";
import type { Ctx } from "./context.js";
import { processAiPersona } from "./processors/aiPersona.js";
import { processComment } from "./processors/comment.js";
import { processDmInbound } from "./processors/dmInbound.js";
import { runMaintenance } from "./processors/maintenance.js";
import { processStripeEvent } from "./processors/stripe.js";
import { processWelcome } from "./processors/welcome.js";

function need(n: string): string {
  const v = process.env[n];
  if (!v) throw new Error(`${n} is required`);
  return v;
}

const log = pino({ redact: { paths: REDACT_PATHS, censor: "[REDACTED]" } });
const url = need("VALKEY_URL");
const producer = createConnection(url, "producer");
const queues = createQueues(producer);
const pool = createPool(need("DATABASE_URL"), Number(process.env.DB_POOL_MAX ?? 10));
const db = createDb(pool);

const ig = new IgClient();
const igBreaker = createBreaker<[() => Promise<unknown>], unknown>("instagram", (fn) => fn(), {
  timeoutMs: 15_000, isClientError: (e) => e instanceof IgApiError && e.isClientError,
});
function buildProviders(): { primary: LlmProvider; secondary: LlmProvider | null } {
  const candidates: LlmProvider[] = [];
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey && !geminiKey.startsWith("dev_")) {
    candidates.push(new OpenAiCompatibleProvider(geminiKey, "https://generativelanguage.googleapis.com/v1beta/openai", process.env.GEMINI_MODEL ?? "gemini-2.5-flash", "gemini"));
  }
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey && !anthropicKey.startsWith("dev_")) {
    const anthropic = new Anthropic({ apiKey: anthropicKey });
    candidates.push(new AnthropicProvider(anthropic, process.env.AI_PRIMARY_MODEL ?? "claude-sonnet-5-5"));
  }
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey && !groqKey.startsWith("dev_")) {
    candidates.push(new OpenAiCompatibleProvider(groqKey, "https://api.groq.com/openai/v1", process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile", "groq"));
  }
  const orKey = process.env.OPENROUTER_API_KEY;
  if (orKey && !orKey.startsWith("dev_")) {
    candidates.push(new OpenAiCompatibleProvider(orKey, "https://openrouter.ai/api/v1", process.env.OPENROUTER_MODEL ?? "meta-llama/llama-3.3-70b-instruct:free", "openrouter"));
  }
  if (candidates.length === 0) {
    candidates.push(new OpenAiCompatibleProvider("dev_placeholder", "https://generativelanguage.googleapis.com/v1beta/openai", "gemini-2.5-flash", "gemini"));
  }
  return { primary: candidates[0]!, secondary: candidates[1] ?? null };
}

const { primary, secondary } = buildProviders();
const brk = (p: LlmProvider) => createBreaker<[GenerateRequest], string>(p.name, (r) => p.generate(r), { timeoutMs: 15_000 });

const ctx: Ctx = {
  db, redis: producer, queues, ig, igBreaker, log,
  bucket: new TokenBucket(producer),
  keys: keyProviderFromEnv(),
  llm: { primary: brk(primary), secondary: secondary ? brk(secondary) : null },
  embedder: createEmbedderFromEnv(),
  now: () => new Date(),
};

const workers: Worker[] = [];
function run<T>(name: keyof typeof CONCURRENCY, schema: { parse(x: unknown): T }, fn: (c: Ctx, d: T) => Promise<unknown>) {
  const w = new Worker(name, async (job) => fn(ctx, schema.parse(job.data)), {
    connection: createConnection(url, "worker"),
    concurrency: CONCURRENCY[name],
    settings: { backoffStrategy },
  });
  attachDlq(w, queues.dlq, name);
  w.on("error", (err) => log.error({ queue: name, err: err.message }, "worker error"));
  workers.push(w);
}

run(QUEUES.comments, commentJobSchema, processComment);
run(QUEUES.dmInbound, dmInboundJobSchema, processDmInbound);
run(QUEUES.dmWelcome, dmWelcomeJobSchema, processWelcome);
run(QUEUES.aiPersona, aiPersonaJobSchema, processAiPersona);
run(QUEUES.stripe, stripeEventJobSchema, processStripeEvent);

const maint = new Worker(QUEUES.maintenance, async (job) => runMaintenance(ctx, job.name), {
  connection: createConnection(url, "worker"), concurrency: 1,
});
maint.on("failed", (j, e) => log.error({ job: j?.name, err: e.message }, "maintenance failed"));
workers.push(maint);

// Repeatables are idempotent by scheduler id, so every pod can call this safely.
await queues.maintenance.upsertJobScheduler("flush-counters", { every: 10_000 }, { name: "flush-counters" });
await queues.maintenance.upsertJobScheduler("refresh-tokens", { pattern: "0 3 * * *" }, { name: "refresh-tokens" });
await queues.maintenance.upsertJobScheduler("purge-dedup", { pattern: "30 3 * * *" }, { name: "purge-dedup" });

log.info({ queues: Object.keys(CONCURRENCY) }, "worker started");

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await Promise.allSettled(workers.map((w) => w.close()));
  await runMaintenance(ctx, "flush-counters").catch(() => undefined); // do not lose the last <10s of counters
  await producer.quit();
  await pool.end();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

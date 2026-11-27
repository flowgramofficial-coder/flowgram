import { randomBytes, randomUUID } from "node:crypto";
import type { Redis } from "ioredis";
import type pg from "pg";
import { createDb, createPool } from "@flowgram/db";
import { IgApiError } from "@flowgram/ig-client";
import { TokenBucket, createBreaker, createConnection, createQueues } from "@flowgram/queue";
import { LocalKeyProvider, encryptSecret } from "@flowgram/security";
import type { Ctx } from "./context.js";

/** Test harness: real Postgres (non-owner role, RLS enforced) + real Valkey/Redis; fake Instagram + LLM. */
export interface Fakes {
  sent: Array<{ kind: "text" | "private" | "public"; to: string; text: string; quickReplies?: unknown }>;
  llmCalls: number;
  llmReply: string;
  failNext: IgApiError | null;
}

export async function makeHarness(opts: { appUrl: string; ownerUrl: string; valkeyUrl: string }) {
  const redis: Redis = createConnection(opts.valkeyUrl, "worker");
  const appPool = createPool(opts.appUrl, 6);
  const owner: pg.Pool = createPool(opts.ownerUrl, 2);
  const fakes: Fakes = { sent: [], llmCalls: 0, llmReply: "Sure, happy to help!", failNext: null };
  let mid = 0;
  const maybeFail = () => { if (fakes.failNext) { const e = fakes.failNext; fakes.failNext = null; throw e; } };
  const ig = {
    async sendText(_t: string, _id: string, to: string, text: string, quickReplies?: unknown) { maybeFail(); fakes.sent.push({ kind: "text", to, text, quickReplies }); return { messageId: `mid-${randomUUID()}-${++mid}` }; },
    async sendPrivateReply(_t: string, _id: string, commentId: string, text: string) { maybeFail(); fakes.sent.push({ kind: "private", to: commentId, text }); return { messageId: `mid-${randomUUID()}-${++mid}` }; },
    async replyToComment(_t: string, commentId: string, text: string) { fakes.sent.push({ kind: "public", to: commentId, text }); return { id: "r" }; },
    async getMediaCaption() { return "My Big Reel"; },
  };
  const keys = new LocalKeyProvider(randomBytes(32).toString("base64"));
  const queues = createQueues(createConnection(opts.valkeyUrl, "producer"));
  const igBreaker = createBreaker<[() => Promise<unknown>], unknown>("ig-test", (fn) => fn(), { volumeThreshold: 1000 });
  const llm = createBreaker("llm-test", async () => { fakes.llmCalls++; return fakes.llmReply; }, { volumeThreshold: 1000 });
  let clock = new Date();
  const ctx: Ctx = {
    db: createDb(appPool), redis, queues, ig: ig as never, keys, igBreaker, log: { info() {}, warn() {}, error() {} },
    bucket: new TokenBucket(redis, { capacity: 1000, refillPerSec: 1000 }),
    llm: { primary: llm as never, secondary: null },
    embedder: { dimensions: 1536, embed: async () => Array.from({ length: 1536 }, () => 0.01) },
    now: () => clock,
  };

  async function seedWorkspace(o: { plan?: "free" | "pro"; status?: string; quota?: number } = {}) {
    const ws = randomUUID(), acct = randomUUID(), igUserId = `ig-${randomUUID()}`;
    await owner.query("insert into workspaces (id, owner_user_id, plan, subscription_status, monthly_dm_quota) values ($1,$2,$3,$4,$5)",
      [ws, `u-${ws}`, o.plan ?? "free", o.status ?? (o.plan === "pro" ? "active" : "none"), o.quota ?? 100]);
    const enc = await encryptSecret(keys, "IG-TOKEN", acct);
    await owner.query("insert into ig_accounts (id, workspace_id, ig_user_id, username, encrypted_access_token, encrypted_dek, token_expires_at) values ($1,$2,$3,'creator',$4,$5, now() + interval '30 days')",
      [acct, ws, igUserId, enc.ciphertext, enc.encryptedDek]);
    return { ws, acct, igUserId };
  }
  const addRule = (s: { ws: string; acct: string }, o: Record<string, unknown> = {}) => owner.query(
    `insert into comment_rules (workspace_id, ig_account_id, name, media_scope, match_type, keywords, dm_template, public_reply_enabled, public_reply_templates)
     values ($1,$2,'r','any','keywords',$3,$4,$5,$6) returning id`,
    [s.ws, s.acct, o.keywords ?? ["link"], o.dm ?? "Hi {username}! Here is the link", o.pub ?? false, o.pubTpl ?? []]).then((r) => r.rows[0].id as string);
  const addPersona = (s: { ws: string; acct: string }, o: Record<string, unknown> = {}) => owner.query(
    `insert into ai_persona_configs (workspace_id, ig_account_id, is_active, persona_name, tone, handoff_topics, allowed_domains)
     values ($1,$2,true,'Maya','warm',$3,$4)`, [s.ws, s.acct, o.handoff ?? ["refund"], o.domains ?? ["maya.com"]]);

  return {
    ctx, fakes, owner, redis, seedWorkspace, addRule, addPersona,
    setClock: (d: Date) => { clock = d; },
    async cleanup(workspaces: string[]) { await owner.query("delete from workspaces where id = any($1)", [workspaces]); },
    async close() { await redis.quit(); await appPool.end(); await owner.end(); await ctx.queues.comments.close(); },
  };
}

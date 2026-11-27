import { timingSafeEqual } from "node:crypto";
import helmet from "@fastify/helmet";
import Fastify, { type FastifyInstance } from "fastify";
import { Counter, Histogram, Registry } from "prom-client";
import Stripe from "stripe";
import { REDACT_PATHS, verifyMetaSignature } from "@flowgram/security";
import {
  ERROR_CODES, LIMITS, metaCommentValueSchema, metaWebhookSchema,
  type CommentJob, type DmInboundJob, type StripeEventJob,
} from "@flowgram/shared";

/** The only surface the ingestor needs from BullMQ; keeps it trivially fakeable. */
export interface JobSink {
  addBulk(jobs: Array<{ name: string; data: unknown; opts: { jobId: string } }>): Promise<unknown>;
}
export interface IngestorDeps {
  appSecret: string;
  verifyToken: string;
  queues: { comments: JobSink; dmInbound: JobSink; stripe: JobSink };
  stripe?: { webhookSecret: string; client: Stripe };
  logger?: boolean;
}

/** BullMQ rejects ':' in custom job ids, so the dedup prefix uses '_' (e.g. "comment_<id>"). */
export const jobKey = (prefix: string, id: string): string => `${prefix}_${id}`;

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function buildApp(deps: IngestorDeps): { app: FastifyInstance; registry: Registry } {
  const app = Fastify({
    bodyLimit: LIMITS.webhookBodyBytes,
    logger: deps.logger === false ? false : { redact: { paths: REDACT_PATHS, censor: "[REDACTED]" } },
    trustProxy: true,
  });

  const registry = new Registry();
  const ack = new Histogram({
    name: "ingest_ack_seconds", help: "Time to verify and enqueue a webhook", registers: [registry],
    labelNames: ["source"], buckets: [0.002, 0.005, 0.01, 0.02, 0.03, 0.05, 0.1, 0.25, 1],
  });
  const rejected = new Counter({ name: "ingest_rejected_total", help: "Rejected webhooks", registers: [registry], labelNames: ["reason"] });
  const enqueued = new Counter({ name: "ingest_enqueued_total", help: "Jobs enqueued", registers: [registry], labelNames: ["queue"] });

  // Keep the exact bytes: signatures are over the raw body, not re-serialised JSON.
  app.addContentTypeParser("application/json", { parseAs: "buffer", bodyLimit: LIMITS.webhookBodyBytes }, (_req, body, done) => done(null, body));

  void app.register(helmet, { hsts: { maxAge: 63_072_000, includeSubDomains: true, preload: true }, frameguard: { action: "deny" }, referrerPolicy: { policy: "strict-origin-when-cross-origin" } });

  app.setErrorHandler((err: { statusCode?: number }, _req, reply) => {
    const status = err.statusCode === 413 ? 413 : err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    if (status === 413) rejected.inc({ reason: "too_large" });
    void reply.code(status).send({ error: status === 413 ? ERROR_CODES.PAYLOAD_TOO_LARGE : status === 500 ? "internal" : ERROR_CODES.INVALID_PAYLOAD });
  });

  app.get("/healthz", async () => ({ ok: true }));
  app.get("/metrics", async (_req, reply) => reply.type(registry.contentType).send(await registry.metrics()));

  // Meta subscription handshake
  app.get("/webhooks/instagram", async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    if (q["hub.mode"] === "subscribe" && typeof q["hub.verify_token"] === "string" && safeEqual(q["hub.verify_token"], deps.verifyToken)) {
      return reply.type("text/plain").send(q["hub.challenge"] ?? "");
    }
    return reply.code(403).send({ error: ERROR_CODES.INVALID_SIGNATURE });
  });

  app.post("/webhooks/instagram", async (req, reply) => {
    const end = ack.startTimer({ source: "meta" });
    const raw = req.body as Buffer;
    const sig = req.headers["x-hub-signature-256"];
    if (!Buffer.isBuffer(raw) || !verifyMetaSignature(raw, typeof sig === "string" ? sig : undefined, deps.appSecret)) {
      rejected.inc({ reason: "bad_signature" });
      return reply.code(401).send({ error: ERROR_CODES.INVALID_SIGNATURE });
    }

    let parsed;
    try {
      parsed = metaWebhookSchema.safeParse(JSON.parse(raw.toString("utf8")));
    } catch {
      rejected.inc({ reason: "bad_json" });
      return reply.code(400).send({ error: ERROR_CODES.INVALID_PAYLOAD });
    }
    if (!parsed.success) {
      rejected.inc({ reason: "bad_schema" });
      return reply.code(400).send({ error: ERROR_CODES.INVALID_PAYLOAD });
    }

    const now = Date.now();
    const comments: Array<{ name: string; data: CommentJob; opts: { jobId: string } }> = [];
    const dms: Array<{ name: string; data: DmInboundJob; opts: { jobId: string } }> = [];

    for (const entry of parsed.data.entry) {
      for (const ch of entry.changes ?? []) {
        if (ch.field !== "comments") continue;
        const v = metaCommentValueSchema.safeParse(ch.value);
        if (!v.success || v.data.parent_id) continue; // replies-to-comments are not triggers
        comments.push({
          name: "comment",
          data: {
            igUserId: entry.id, commentId: v.data.id, mediaId: v.data.media?.id ?? null,
            fromId: v.data.from.id, fromUsername: v.data.from.username ?? null,
            text: v.data.text.slice(0, 4000), receivedAt: now,
          },
          opts: { jobId: jobKey("comment", v.data.id) },
        });
      }
      for (const m of entry.messaging ?? []) {
        // read receipts, reactions, deletions: nothing to do
        if (!m.message || m.message.is_deleted) continue;
        const isEcho = m.message.is_echo === true;
        // For echoes the creator is the sender; the follower is the recipient.
        dms.push({
          name: "dm",
          data: {
            igUserId: entry.id, senderId: m.sender.id, recipientId: m.recipient.id, messageId: m.message.mid,
            text: m.message.text?.slice(0, 4000) ?? null, isEcho,
            quickReplyPayload: m.message.quick_reply?.payload.slice(0, 200) ?? null, timestamp: m.timestamp ?? now,
          },
          opts: { jobId: jobKey("dm", m.message.mid) },
        });
      }
    }

    try {
      await Promise.all([
        comments.length ? deps.queues.comments.addBulk(comments).then(() => enqueued.inc({ queue: "comments" }, comments.length)) : undefined,
        dms.length ? deps.queues.dmInbound.addBulk(dms).then(() => enqueued.inc({ queue: "dm_inbound" }, dms.length)) : undefined,
      ]);
    } catch {
      // Queue unavailable: a 5xx makes Meta retry, which is what we want. Never ack what we did not store.
      rejected.inc({ reason: "queue_down" });
      return reply.code(503).send({ error: "unavailable" });
    }
    end();
    return reply.code(200).send({ ok: true });
  });

  app.post("/webhooks/stripe", async (req, reply) => {
    const end = ack.startTimer({ source: "stripe" });
    if (!deps.stripe) return reply.code(404).send({ error: ERROR_CODES.NOT_FOUND });
    const sig = req.headers["stripe-signature"];
    let event: Stripe.Event;
    try {
      // 300s tolerance rejects replayed events older than 5 minutes.
      event = deps.stripe.client.webhooks.constructEvent(req.body as Buffer, typeof sig === "string" ? sig : "", deps.stripe.webhookSecret, 300);
    } catch {
      rejected.inc({ reason: "stripe_bad_signature" });
      return reply.code(401).send({ error: ERROR_CODES.INVALID_SIGNATURE });
    }
    const job: StripeEventJob = { eventId: event.id, type: event.type, payload: (req.body as Buffer).toString("utf8") };
    try {
      await deps.queues.stripe.addBulk([{ name: "stripe", data: job, opts: { jobId: jobKey("stripe", event.id) } }]);
      enqueued.inc({ queue: "stripe" });
    } catch {
      rejected.inc({ reason: "queue_down" });
      return reply.code(503).send({ error: "unavailable" });
    }
    end();
    return reply.code(200).send({ received: true });
  });

  return { app, registry };
}

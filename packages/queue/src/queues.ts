import { Queue, type JobsOptions, type Job, type Worker } from "bullmq";
import type { Redis } from "ioredis";
import { QUEUES, type DlqJob, type QueueName } from "@flowgram/shared";

export const MAX_ATTEMPTS = 5;

export const defaultJobOptions: JobsOptions = {
  attempts: MAX_ATTEMPTS,
  backoff: { type: "jitteredExponential", delay: 1_000 },
  removeOnComplete: { age: 3_600, count: 10_000 },
  removeOnFail: { age: 7 * 24 * 3_600 },
};

/** Independent queues so a comment storm never starves AI replies or billing. */
export const CONCURRENCY: Record<Exclude<QueueName, "ig-dlq" | "maintenance">, number> = {
  "ig-comments": 50,
  "ig-dm-inbound": 40,
  "ig-dm-welcome": 20,
  "ig-ai-persona": 15,
  "stripe-events": 5,
};

export function createQueues(connection: Redis) {
  const make = (name: QueueName) => new Queue(name, { connection, defaultJobOptions });
  return {
    comments: make(QUEUES.comments),
    dmInbound: make(QUEUES.dmInbound),
    dmWelcome: make(QUEUES.dmWelcome),
    aiPersona: make(QUEUES.aiPersona),
    stripe: make(QUEUES.stripe),
    dlq: new Queue(QUEUES.dlq, { connection, defaultJobOptions: { attempts: 1, removeOnComplete: false, removeOnFail: false } }),
    maintenance: make(QUEUES.maintenance),
  };
}
export type Queues = ReturnType<typeof createQueues>;

/** Attach to every worker: once retries are exhausted, park the job in the DLQ. */
export function attachDlq(worker: Worker, dlq: Queue, queueName: string): void {
  worker.on("failed", (job: Job | undefined, err: Error) => {
    if (!job) return;
    const max = job.opts.attempts ?? 1;
    if (job.attemptsMade < max) return;
    const payload: DlqJob = {
      originQueue: queueName,
      originJobId: job.id ?? null,
      failedReason: err.message.slice(0, 2000),
      attemptsMade: job.attemptsMade,
      data: job.data,
      failedAt: Date.now(),
    };
    void dlq.add("dead", payload, { jobId: `dlq:${queueName}:${job.id}` }).catch(() => undefined);
  });
}

/** Ops replay: move a DLQ entry back to its origin queue as a fresh job. */
export async function replayDlqJob(queues: Queues, dlqJobId: string): Promise<boolean> {
  const job = await queues.dlq.getJob(dlqJobId);
  if (!job) return false;
  const d = job.data as DlqJob;
  const target = Object.values(queues).find((q) => q.name === d.originQueue);
  if (!target) return false;
  await target.add("replay", d.data, { jobId: `replay:${d.originJobId}:${Date.now()}` });
  await job.remove();
  return true;
}

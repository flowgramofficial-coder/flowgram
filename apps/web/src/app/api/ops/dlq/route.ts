import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createConnection, createQueues, replayDlqJob } from "@flowgram/queue";
import type { DlqJob } from "@flowgram/shared";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Ops-only. Disabled (404) unless OPS_TOKEN is set; bearer compared in constant time. Not tenant-facing. */
function authorised(req: NextRequest): boolean {
  const expected = process.env.OPS_TOKEN;
  if (!expected || expected.length < 32) return false;
  const got = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const a = Buffer.from(got), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const queues = () => createQueues(createConnection(env.valkeyUrl, "producer"));

export async function GET(req: NextRequest) {
  if (!process.env.OPS_TOKEN) return new NextResponse(null, { status: 404 });
  if (!authorised(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = queues();
  try {
    const jobs = await q.dlq.getJobs(["waiting", "completed", "delayed"], 0, 99);
    // Payloads can contain follower text, so the listing exposes metadata only.
    return NextResponse.json({ jobs: jobs.map((j) => { const d = j.data as DlqJob; return { id: j.id, originQueue: d.originQueue, failedReason: d.failedReason, attemptsMade: d.attemptsMade, failedAt: d.failedAt }; }) });
  } finally { await Promise.all(Object.values(q).map((x) => x.close())); }
}

export async function POST(req: NextRequest) {
  if (!process.env.OPS_TOKEN) return new NextResponse(null, { status: 404 });
  if (!authorised(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = z.object({ jobId: z.string().min(1).max(200) }).strict().safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const q = queues();
  try {
    const ok = await replayDlqJob(q, body.data.jobId);
    return NextResponse.json({ replayed: ok }, { status: ok ? 200 : 404 });
  } finally { await Promise.all(Object.values(q).map((x) => x.close())); }
}

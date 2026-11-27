import { randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { services } from "@/lib/server";

export const dynamic = "force-dynamic";

const schema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(500),
  workspaceId: z.string().uuid().optional(),
}).strict();

function authorized(req: Request): boolean {
  const expected = process.env.OPS_TOKEN;
  if (!expected || expected.length < 32) return false;
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Broadcasts a notification to all users or a specific workspace (protected by OPS_TOKEN). */
export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const item = JSON.stringify({
    id: randomUUID(),
    title: parsed.data.title,
    body: parsed.data.body,
    createdAt: new Date().toISOString(),
  });

  const redis = services().redis;
  const key = parsed.data.workspaceId ? `fg:notif:ws:${parsed.data.workspaceId}` : "fg:notif:global";
  await redis.lpush(key, item);
  await redis.ltrim(key, 0, 49);
  return NextResponse.json({ ok: true });
}

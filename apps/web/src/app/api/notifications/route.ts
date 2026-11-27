import { NextResponse } from "next/server";
import { services } from "@/lib/server";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}

export async function GET() {
  const s = await getSession();
  if (!s?.mfaPassed) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const redis = services().redis;
  const [wsRaw, globalRaw, readRaw] = await Promise.all([
    redis.lrange(`fg:notif:ws:${s.workspaceId}`, 0, 19),
    redis.lrange("fg:notif:global", 0, 19),
    redis.smembers(`fg:notif:read:${s.userId}`),
  ]);

  const readSet = new Set(readRaw);
  const combined: AppNotification[] = [...wsRaw, ...globalRaw]
    .map((x) => {
      try {
        const parsed = JSON.parse(x) as { id: string; title: string; body: string; createdAt: string };
        return { ...parsed, read: readSet.has(parsed.id) };
      } catch {
        return null;
      }
    })
    .filter((x): x is AppNotification => x !== null)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 20);

  return NextResponse.json({ notifications: combined });
}

export async function POST(req: Request) {
  const s = await getSession();
  if (!s?.mfaPassed) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { ids?: string[] };
  if (Array.isArray(body.ids) && body.ids.length > 0) {
    await services().redis.sadd(`fg:notif:read:${s.userId}`, ...body.ids.slice(0, 50));
    await services().redis.expire(`fg:notif:read:${s.userId}`, 60 * 60 * 24 * 60);
  }
  return NextResponse.json({ ok: true });
}

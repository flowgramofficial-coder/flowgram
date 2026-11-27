import { randomUUID } from "node:crypto";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { signMetaBody } from "@flowgram/security";
import { buildApp, type JobSink } from "./app.js";

const SECRET = "app-secret";
const sink = () => {
  const calls: Array<Array<{ name: string; data: any; opts: { jobId: string } }>> = [];
  const s: JobSink = { addBulk: async (j) => { calls.push(j as any); return []; } };
  return { s, calls };
};

const commentPayload = (id = "c1", from = "u2") => ({
  object: "instagram",
  entry: [{ id: "ig-creator", time: 1, changes: [{ field: "comments", value: { id, text: "LINK please", from: { id: from, username: "bob" }, media: { id: "m1" } } }] }],
});
const dmPayload = (mid: string, echo = false) => ({
  object: "instagram",
  entry: [{ id: "ig-creator", messaging: [{ sender: { id: echo ? "ig-creator" : "f1" }, recipient: { id: echo ? "f1" : "ig-creator" }, timestamp: 5, message: { mid, text: "hi", is_echo: echo } }] }],
});

function setup(extra: Partial<Parameters<typeof buildApp>[0]> = {}) {
  const c = sink(), d = sink(), st = sink();
  const { app } = buildApp({ appSecret: SECRET, verifyToken: "vt", queues: { comments: c.s, dmInbound: d.s, stripe: st.s }, logger: false, ...extra });
  const post = (body: unknown, sig?: string | null) => {
    const raw = Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
    return app.inject({ method: "POST", url: "/webhooks/instagram", payload: raw,
      headers: { "content-type": "application/json", ...(sig === null ? {} : { "x-hub-signature-256": sig ?? signMetaBody(raw, SECRET) }) } });
  };
  return { app, c, d, st, post };
}

describe("Meta webhook verification (forgery tests)", () => {
  it("rejects missing, forged and malformed signatures with 401 and enqueues nothing", async () => {
    const { post, c } = setup();
    expect((await post(commentPayload(), null)).statusCode).toBe(401);
    expect((await post(commentPayload(), signMetaBody(Buffer.from("x"), "other"))).statusCode).toBe(401);
    expect((await post(commentPayload(), "sha256=")).statusCode).toBe(401);
    expect((await post(commentPayload(), "md5=abcd")).statusCode).toBe(401);
    expect(c.calls).toHaveLength(0);
  });
  it("rejects a valid signature replayed over a modified body", async () => {
    const { app, c } = setup();
    const good = Buffer.from(JSON.stringify(commentPayload("c1")));
    const sig = signMetaBody(good, SECRET);
    const res = await app.inject({ method: "POST", url: "/webhooks/instagram", payload: Buffer.from(JSON.stringify(commentPayload("c2"))), headers: { "content-type": "application/json", "x-hub-signature-256": sig } });
    expect(res.statusCode).toBe(401);
    expect(c.calls).toHaveLength(0);
  });
  it("enforces the 256 KB body limit", async () => {
    const { app } = setup();
    const raw = Buffer.alloc(300 * 1024, "a");
    const res = await app.inject({ method: "POST", url: "/webhooks/instagram", payload: raw, headers: { "content-type": "application/json", "x-hub-signature-256": signMetaBody(raw, SECRET) } });
    expect(res.statusCode).toBe(413);
  });
  it("returns 400 for a signed but malformed body", async () => {
    const { post } = setup();
    expect((await post("not json")).statusCode).toBe(400);
    expect((await post({ object: "page", entry: [] })).statusCode).toBe(400);
  });
});

describe("Meta webhook routing", () => {
  it("enqueues a comment with a deterministic dedup job id", async () => {
    const { post, c } = setup();
    const res = await post(commentPayload("c-77"));
    expect(res.statusCode).toBe(200);
    expect(c.calls[0]?.[0]?.opts.jobId).toBe("comment_c-77");
    expect(c.calls[0]?.[0]?.data).toMatchObject({ igUserId: "ig-creator", fromId: "u2", mediaId: "m1", commentId: "c-77" });
  });
  it("routes inbound DMs and echoes to the inbound queue, drops read receipts", async () => {
    const { post, d } = setup();
    await post(dmPayload("mid-1"));
    await post(dmPayload("mid-2", true));
    await post({ object: "instagram", entry: [{ id: "ig-creator", messaging: [{ sender: { id: "f1" }, recipient: { id: "ig-creator" }, read: { mid: "x" } }] }] });
    const all = d.calls.flat();
    expect(all.map((j) => j.data.isEcho)).toEqual([false, true]);
    expect(all).toHaveLength(2);
  });
  it("ignores replies to comments (parent_id) as triggers", async () => {
    const { post, c } = setup();
    const p = commentPayload();
    (p.entry[0]!.changes![0]!.value as any).parent_id = "parent";
    await post(p);
    expect(c.calls).toHaveLength(0);
  });
  it("returns 503, not 200, when the queue is down so Meta retries", async () => {
    const { app } = buildApp({ appSecret: SECRET, verifyToken: "vt", logger: false,
      queues: { comments: { addBulk: async () => { throw new Error("down"); } }, dmInbound: sink().s, stripe: sink().s } });
    const raw = Buffer.from(JSON.stringify(commentPayload()));
    const res = await app.inject({ method: "POST", url: "/webhooks/instagram", payload: raw, headers: { "content-type": "application/json", "x-hub-signature-256": signMetaBody(raw, SECRET) } });
    expect(res.statusCode).toBe(503);
  });
  it("answers the subscribe handshake only with the right token", async () => {
    const { app } = setup();
    const ok = await app.inject({ method: "GET", url: "/webhooks/instagram?hub.mode=subscribe&hub.verify_token=vt&hub.challenge=123" });
    expect([ok.statusCode, ok.body]).toEqual([200, "123"]);
    const bad = await app.inject({ method: "GET", url: "/webhooks/instagram?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=123" });
    expect(bad.statusCode).toBe(403);
  });
  it("sets security headers", async () => {
    const { app } = setup();
    const r = await app.inject({ method: "GET", url: "/healthz" });
    expect(r.headers["strict-transport-security"]).toContain("max-age=63072000");
    expect(r.headers["x-frame-options"]).toBe("DENY");
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
  });
});

describe("Stripe webhook verification", () => {
  const stripe = new Stripe("sk_test_x");
  const whsec = "whsec_test";
  const body = JSON.stringify({ id: "evt_1", object: "event", type: "customer.subscription.updated", data: { object: {} } });
  const send = (app: ReturnType<typeof setup>["app"], header: string) =>
    app.inject({ method: "POST", url: "/webhooks/stripe", payload: Buffer.from(body), headers: { "content-type": "application/json", "stripe-signature": header } });

  it("accepts a valid signature and enqueues once-keyed", async () => {
    const { app, st } = setup({ stripe: { client: stripe, webhookSecret: whsec } });
    const header = stripe.webhooks.generateTestHeaderString({ payload: body, secret: whsec });
    expect((await send(app, header)).statusCode).toBe(200);
    expect(st.calls[0]?.[0]?.opts.jobId).toBe("stripe_evt_1");
  });
  it("rejects bad signatures and replays older than 5 minutes", async () => {
    const { app, st } = setup({ stripe: { client: stripe, webhookSecret: whsec } });
    expect((await send(app, "t=1,v1=deadbeef")).statusCode).toBe(401);
    const old = stripe.webhooks.generateTestHeaderString({ payload: body, secret: whsec, timestamp: Math.floor(Date.now() / 1000) - 600 });
    expect((await send(app, old)).statusCode).toBe(401);
    expect(st.calls).toHaveLength(0);
  });
});

const url = process.env.TEST_VALKEY_URL;

// In CI the integration suites must run: a missing service is a failure, never a silent skip.
if (process.env.CI && !url) throw new Error("integration test services are not configured in CI");
describe.skipIf(!url)("against a real BullMQ queue", () => {
  it("dedups redelivered webhooks by job id and acks fast (p99)", async () => {
    const conn = new Redis(url!, { maxRetriesPerRequest: null });
    const name = `test-comments-${randomUUID()}`;
    const q = new Queue(name, { connection: conn });
    const { app } = buildApp({ appSecret: SECRET, verifyToken: "vt", logger: false, queues: { comments: q, dmInbound: sink().s, stripe: sink().s } });
    const send = async (id: string) => {
      const raw = Buffer.from(JSON.stringify(commentPayload(id)));
      const t = performance.now();
      const r = await app.inject({ method: "POST", url: "/webhooks/instagram", payload: raw, headers: { "content-type": "application/json", "x-hub-signature-256": signMetaBody(raw, SECRET) } });
      return [r.statusCode, performance.now() - t] as const;
    };
    await send("dup"); await send("dup"); await send("dup");
    expect(await q.getWaitingCount()).toBe(1);

    const lat: number[] = [];
    for (let i = 0; i < 300; i++) { const [code, ms] = await send(`c${i}`); expect(code).toBe(200); lat.push(ms); }
    lat.sort((a, b) => a - b);
    const p99 = lat[Math.floor(lat.length * 0.99)]!;
    console.log(`ack latency p50=${lat[150]!.toFixed(2)}ms p99=${p99.toFixed(2)}ms`);
    expect(p99).toBeLessThan(30);
    expect(await q.getWaitingCount()).toBe(301);
    await q.obliterate({ force: true });
    await q.close(); conn.disconnect();
  });
});
vi.setConfig({ testTimeout: 30_000 });

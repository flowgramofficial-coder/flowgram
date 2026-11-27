import { describe, expect, it, vi } from "vitest";
import { IgApiError, IgClient, truncateUtf8 } from "./index.js";

const ok = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe("truncateUtf8", () => {
  it("counts bytes, not characters, and never splits a code point", () => {
    const s = "😀".repeat(300); // 4 bytes each = 1200 bytes
    const t = truncateUtf8(s, 1000);
    expect(Buffer.byteLength(t)).toBe(1000);
    expect([...t].every((c) => c === "😀")).toBe(true);
    expect(truncateUtf8("short", 1000)).toBe("short");
  });
});

describe("IgClient", () => {
  it("sends a private reply with recipient.comment_id and a bearer header (token never in URL)", async () => {
    const f = ok({ message_id: "m1" });
    const c = new IgClient({ fetchImpl: f as any });
    const r = await c.sendPrivateReply("TOKEN", "17841", "cmt9", "hello");
    expect(r.messageId).toBe("m1");
    const [url, init] = f.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("https://graph.instagram.com/v26.0/17841/messages");
    expect(String(url)).not.toContain("TOKEN");
    expect((init.headers as any).authorization).toBe("Bearer TOKEN");
    expect(JSON.parse(init.body as string)).toEqual({ recipient: { comment_id: "cmt9" }, message: { text: "hello" } });
  });
  it("caps quick replies at 13 with 20-char titles and truncates text to 1000 bytes", async () => {
    const f = ok({ message_id: "m" });
    const c = new IgClient({ fetchImpl: f as any });
    await c.sendText("T", "1", "2", "é".repeat(800), Array.from({ length: 20 }, (_, i) => ({ title: "x".repeat(30), payload: `IB:${i}` })));
    const body = JSON.parse((f.mock.calls[0] as any)[1].body);
    expect(body.message.quick_replies).toHaveLength(13);
    expect(body.message.quick_replies[0].title).toHaveLength(20);
    expect(Buffer.byteLength(body.message.text)).toBeLessThanOrEqual(1000);
  });
  it("classifies errors for retry and circuit-breaker decisions", async () => {
    const tok = await new IgClient({ fetchImpl: ok({ error: { message: "bad", code: 190 } }, 400) as any }).sendText("T", "1", "2", "x").catch((e) => e);
    expect(tok).toBeInstanceOf(IgApiError);
    expect(tok.tokenInvalid).toBe(true);
    expect(tok.retryable).toBe(false);
    const thr = await new IgClient({ fetchImpl: ok({ error: { message: "slow", code: 4 } }, 400) as any }).sendText("T", "1", "2", "x").catch((e) => e);
    expect(thr.throttled && thr.retryable && !thr.isClientError).toBe(true);
    const s5 = await new IgClient({ fetchImpl: ok({}, 503) as any }).sendText("T", "1", "2", "x").catch((e) => e);
    expect(s5.retryable).toBe(true);
    const net = await new IgClient({ fetchImpl: (async () => { throw new Error("ECONNRESET"); }) as any }).sendText("T", "1", "2", "x").catch((e) => e);
    expect(net.status).toBe(0);
    expect(net.retryable).toBe(true);
  });
});

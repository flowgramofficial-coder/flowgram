/**
 * Instagram API with Instagram Login (Business Login) client.
 * Hosts/paths verified against Meta's docs: POST /{ig_id}/messages (text, quick_replies,
 * private reply via recipient.comment_id) and POST /{comment_id}/replies.
 */

export const IG_DM_MAX_BYTES = 1000; // Meta limit is 1000 bytes of UTF-8, not characters.

export class IgApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: number | null,
    public readonly subcode: number | null,
  ) {
    super(message);
    this.name = "IgApiError";
  }
  /** 190 = invalid/expired token; the account must reconnect. */
  get tokenInvalid(): boolean { return this.code === 190; }
  /** Meta throttling codes. */
  get throttled(): boolean { return this.code === 4 || this.code === 17 || this.code === 32 || this.code === 613 || this.status === 429; }
  /** Server-side or transient. 4xx caused by our own payload are not retryable. */
  get retryable(): boolean { return this.throttled || this.status >= 500 || this.status === 0; }
  /** Provider-health signal for circuit breakers: only 5xx/network count, not our own bad requests. */
  get isClientError(): boolean { return this.status >= 400 && this.status < 500 && !this.throttled; }
}

export interface QuickReply { title: string; payload: string }

export interface IgClientOptions {
  version?: string;
  host?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** Truncate to a UTF-8 byte budget without splitting a code point. */
export function truncateUtf8(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
  let out = "";
  let bytes = 0;
  for (const ch of text) {
    const b = Buffer.byteLength(ch, "utf8");
    if (bytes + b > maxBytes) break;
    out += ch;
    bytes += b;
  }
  return out;
}

export class IgClient {
  private readonly base: string;
  private readonly timeoutMs: number;
  private readonly f: typeof fetch;

  constructor(opts: IgClientOptions = {}) {
    this.base = `https://${opts.host ?? "graph.instagram.com"}/${opts.version ?? "v26.0"}`;
    this.timeoutMs = opts.timeoutMs ?? 8_000;
    this.f = opts.fetchImpl ?? fetch;
  }

  private async call<T>(method: "GET" | "POST", path: string, token: string, body?: unknown, query?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.base}${path}`);
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
    let res: Response;
    try {
      res = await this.f(url, {
        method,
        // Token goes in a header, never in the URL, so it cannot leak into access logs.
        headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      throw new IgApiError(e instanceof Error ? e.message : "network error", 0, null, null);
    }
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number; error_subcode?: number } } & T;
    if (!res.ok || json.error) {
      throw new IgApiError(json.error?.message ?? `HTTP ${res.status}`, res.status, json.error?.code ?? null, json.error?.error_subcode ?? null);
    }
    return json;
  }

  /** DM to a user who has messaged us (inside the messaging window). */
  async sendText(token: string, igUserId: string, recipientId: string, text: string, quickReplies?: QuickReply[]): Promise<{ messageId: string }> {
    const message: Record<string, unknown> = { text: truncateUtf8(text, IG_DM_MAX_BYTES) };
    if (quickReplies?.length) {
      message.quick_replies = quickReplies.slice(0, 13).map((q) => ({ content_type: "text", title: q.title.slice(0, 20), payload: q.payload }));
    }
    const r = await this.call<{ message_id: string }>("POST", `/${igUserId}/messages`, token, { recipient: { id: recipientId }, message });
    return { messageId: r.message_id };
  }

  /** The single allowed private reply to a comment (within 7 days of the comment). */
  async sendPrivateReply(token: string, igUserId: string, commentId: string, text: string): Promise<{ messageId: string }> {
    const r = await this.call<{ message_id: string }>("POST", `/${igUserId}/messages`, token, {
      recipient: { comment_id: commentId },
      message: { text: truncateUtf8(text, IG_DM_MAX_BYTES) },
    });
    return { messageId: r.message_id };
  }

  async replyToComment(token: string, commentId: string, text: string): Promise<{ id: string }> {
    return this.call<{ id: string }>("POST", `/${commentId}/replies`, token, { message: text.slice(0, 2200) });
  }

  /** The connected professional account: its IG user id and @handle. */
  async getMe(token: string): Promise<{ userId: string; username: string }> {
    const r = await this.call<{ user_id?: string; id?: string; username: string }>("GET", "/me", token, undefined, { fields: "user_id,username" });
    return { userId: String(r.user_id ?? r.id), username: r.username };
  }

  /** Caption of a post/reel, used for the {post_title} placeholder. Returns "" if unavailable. */
  async getMediaCaption(token: string, mediaId: string): Promise<string> {
    const r = await this.call<{ caption?: string }>("GET", `/${mediaId}`, token, undefined, { fields: "caption" });
    return (r.caption ?? "").split("\n")[0]?.slice(0, 60) ?? "";
  }

  /** Long-lived token refresh. Tokens must be >= 24h old and unexpired. */
  async refreshToken(token: string): Promise<{ accessToken: string; expiresInSec: number }> {
    const r = await this.call<{ access_token: string; expires_in: number }>("GET", "/refresh_access_token", token, undefined, { grant_type: "ig_refresh_token" });
    return { accessToken: r.access_token, expiresInSec: r.expires_in };
  }

  async subscribeWebhooks(token: string, igUserId: string, fields = ["comments", "messages"]): Promise<void> {
    await this.call("POST", `/${igUserId}/subscribed_apps`, token, undefined, { subscribed_fields: fields.join(",") });
  }
}

/** OAuth code exchange helpers (not bearer-authenticated, so separate from IgClient.call). */
export async function exchangeCodeForShortToken(p: { appId: string; appSecret: string; redirectUri: string; code: string }, f: typeof fetch = fetch): Promise<{ accessToken: string; userId: string }> {
  const form = new URLSearchParams({ client_id: p.appId, client_secret: p.appSecret, grant_type: "authorization_code", redirect_uri: p.redirectUri, code: p.code });
  const res = await f("https://api.instagram.com/oauth/access_token", { method: "POST", body: form, signal: AbortSignal.timeout(8_000) });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; user_id?: string | number; error_message?: string };
  if (!res.ok || !j.access_token) throw new IgApiError(j.error_message ?? "code exchange failed", res.status, null, null);
  return { accessToken: j.access_token, userId: String(j.user_id) };
}

export async function exchangeForLongLived(p: { appSecret: string; shortToken: string; version?: string }, f: typeof fetch = fetch): Promise<{ accessToken: string; expiresInSec: number }> {
  const url = new URL(`https://graph.instagram.com/access_token`);
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", p.appSecret);
  url.searchParams.set("access_token", p.shortToken);
  const res = await f(url, { signal: AbortSignal.timeout(8_000) });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: { message?: string; code?: number } };
  if (!res.ok || !j.access_token) throw new IgApiError(j.error?.message ?? "long-lived exchange failed", res.status, j.error?.code ?? null, null);
  return { accessToken: j.access_token, expiresInSec: j.expires_in ?? 5_184_000 };
}

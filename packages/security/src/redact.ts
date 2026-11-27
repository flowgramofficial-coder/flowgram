/** Pino redaction paths: secrets and follower PII never reach logs or Sentry. */
export const REDACT_PATHS: string[] = [
  "authorization",
  "cookie",
  "access_token",
  "encrypted_access_token",
  "encrypted_dek",
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers['x-hub-signature-256']",
  "res.headers['set-cookie']",
  "*.access_token",
  "*.encrypted_access_token",
  "*.sender_username",
  "*.username",
  "*.body",
  "*.text",
  "*.message_text",
];

const SENSITIVE_KEYS = new Set([
  "authorization", "cookie", "access_token", "encrypted_access_token", "encrypted_dek",
  "sender_username", "username", "body", "text", "message_text", "password", "token",
]);

/** Deep-redact an arbitrary object (use in Sentry beforeSend). */
export function redactDeep<T>(value: T, depth = 0): T {
  if (depth > 8 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1)) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? "[REDACTED]" : redactDeep(v, depth + 1);
  }
  return out as T;
}

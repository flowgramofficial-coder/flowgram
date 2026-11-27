import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

function captchaSecret(): string {
  return process.env.AUTH_SECRET ?? "flowgram-dev-captcha-secret";
}

/**
 * Real human verification:
 * - If TURNSTILE_SECRET is set, strictly verifies Cloudflare Turnstile token.
 * - Otherwise, strictly verifies the server-signed HMAC challenge answer (never blindly returns true).
 */
export async function verifyTurnstile(
  token: string | null,
  ip: string | null,
  challengeToken?: string | null,
  challengeAnswer?: string | null,
): Promise<boolean> {
  const secret = env.turnstileSecret;
  if (secret) {
    if (!token) return false;
    try {
      const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        body: new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) }),
        signal: AbortSignal.timeout(5_000),
      });
      return ((await res.json()) as { success?: boolean }).success === true;
    } catch {
      return false;
    }
  }

  // Fallback real verification: HMAC-signed math challenge (no fake checkbox!)
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_LOCAL_CAPTCHA !== "true") {
    return false;
  }
  if (!challengeToken || !challengeAnswer) return false;
  const parts = challengeToken.split(".");
  if (parts.length !== 3) return false;
  const [expStr, nonce, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp || !nonce || !sig) return false;
  const ans = challengeAnswer.trim();
  if (!/^\d+$/.test(ans)) return false;

  const expectedSig = createHmac("sha256", captchaSecret()).update(`${ans}.${expStr}.${nonce}`).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  return a.length === b.length && timingSafeEqual(a, b);
}

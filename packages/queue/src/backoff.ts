/** base * 2^attempt + random jitter, capped. `attempt` is 1-based as passed by BullMQ. */
export function jitteredBackoffMs(attempt: number, baseMs = 1_000, capMs = 5 * 60_000, rand: () => number = Math.random): number {
  const exp = Math.min(capMs, baseMs * 2 ** Math.max(0, attempt - 1));
  return Math.min(capMs, exp + Math.floor(rand() * exp * 0.5));
}

/** Pass as `settings.backoffStrategy` on every BullMQ Worker. */
export function backoffStrategy(attemptsMade: number, type?: string, err?: Error): number {
  if (err instanceof RateLimitedError) {
    // honour the bucket's own estimate, plus jitter so a burst doesn't re-collide
    return err.retryAfterMs + Math.floor(Math.random() * 500);
  }
  return type === "jitteredExponential" || type === undefined ? jitteredBackoffMs(attemptsMade) : 1_000;
}

/** Thrown by processors when the per-account bucket is empty; carries the wait. */
export class RateLimitedError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super(`rate limited, retry in ${retryAfterMs}ms`);
    this.name = "RateLimitedError";
  }
}

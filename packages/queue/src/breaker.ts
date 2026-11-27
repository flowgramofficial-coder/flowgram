import CircuitBreaker from "opossum";

export interface BreakerOptions {
  timeoutMs?: number;
  errorThresholdPercentage?: number;
  resetTimeoutMs?: number;
  volumeThreshold?: number;
  /** Errors that should NOT count as provider failure (e.g. 4xx caused by our own payload). */
  isClientError?: (err: unknown) => boolean;
}

export function createBreaker<A extends unknown[], R>(
  name: string,
  fn: (...args: A) => Promise<R>,
  opts: BreakerOptions = {},
): CircuitBreaker<A, R> {
  const breaker = new CircuitBreaker<A, R>(fn, {
    name,
    timeout: opts.timeoutMs ?? 10_000,
    errorThresholdPercentage: opts.errorThresholdPercentage ?? 50,
    resetTimeout: opts.resetTimeoutMs ?? 20_000,
    volumeThreshold: opts.volumeThreshold ?? 10,
    errorFilter: opts.isClientError,
  });
  return breaker;
}

/** Try the primary breaker; on open circuit or failure, fall through to the secondary. */
export async function withFailover<A extends unknown[], R>(
  primary: CircuitBreaker<A, R>,
  secondary: CircuitBreaker<A, R> | null,
  ...args: A
): Promise<R> {
  try {
    return await primary.fire(...args);
  } catch (err) {
    if (!secondary) throw err;
    return secondary.fire(...args);
  }
}

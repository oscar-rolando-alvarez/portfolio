import { StepTimeoutError, isRetryable } from '../domain/errors.ts';

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  factor: number;
}

export const defaultRetryPolicy: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 200,
  maxDelayMs: 5_000,
  factor: 2,
};

export type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>;

export const realSleep: Sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason as Error);
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(signal.reason as Error);
      },
      { once: true },
    );
  });

/**
 * Exponential backoff with "full jitter" (AWS architecture blog): delay = rand(0, min(cap, base * factor^n)).
 * `random` is injectable so tests are deterministic.
 */
export function backoffDelay(
  policy: RetryPolicy,
  attempt: number,
  random: () => number = Math.random,
): number {
  const exp = Math.min(policy.maxDelayMs, policy.baseDelayMs * policy.factor ** (attempt - 1));
  return Math.floor(random() * exp);
}

export interface AttemptFailure {
  attempt: number;
  error: unknown;
  delayMs: number;
  willRetry: boolean;
}

/** Runs `fn` with a hard timeout per attempt; retries only errors classified as retryable. */
export async function runWithRetry<T>(
  fn: (attempt: number, signal: AbortSignal) => Promise<T>,
  opts: {
    policy: RetryPolicy;
    timeoutMs: number;
    label: string;
    sleep?: Sleep;
    random?: () => number;
    onAttemptFailed?: (f: AttemptFailure) => void;
  },
): Promise<{ value: T; attempts: number }> {
  const sleep = opts.sleep ?? realSleep;
  let attempt = 0;
  for (;;) {
    attempt += 1;
    try {
      const value = await withTimeout((signal) => fn(attempt, signal), opts.timeoutMs, opts.label);
      return { value, attempts: attempt };
    } catch (error) {
      const retry = attempt < opts.policy.maxAttempts && isRetryable(error);
      const delayMs = retry ? backoffDelay(opts.policy, attempt, opts.random) : 0;
      opts.onAttemptFailed?.({ attempt, error, delayMs, willRetry: retry });
      if (!retry) throw error;
      await sleep(delayMs);
    }
  }
}

export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new StepTimeoutError(label, timeoutMs);
      controller.abort(err);
      reject(err);
    }, timeoutMs);
  });
  try {
    return await Promise.race([fn(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

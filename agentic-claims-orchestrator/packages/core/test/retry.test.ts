import { describe, expect, it } from 'vitest';
import {
  DomainError,
  StepTimeoutError,
  TransientError,
  backoffDelay,
  defaultRetryPolicy,
  runWithRetry,
} from '../src/index.ts';

const noSleep = () => Promise.resolve();

describe('backoffDelay (full jitter)', () => {
  it('grows exponentially and is capped', () => {
    const policy = { maxAttempts: 10, baseDelayMs: 100, maxDelayMs: 1_000, factor: 2 };
    const max = () => 0.999999;
    expect(backoffDelay(policy, 1, max)).toBe(99);
    expect(backoffDelay(policy, 2, max)).toBe(199);
    expect(backoffDelay(policy, 3, max)).toBe(399);
    expect(backoffDelay(policy, 8, max)).toBe(999);
    expect(backoffDelay(policy, 3, () => 0)).toBe(0);
  });
});

describe('runWithRetry', () => {
  it('retries transient errors until success', async () => {
    let calls = 0;
    const failures: number[] = [];
    const res = await runWithRetry(
      () => {
        calls += 1;
        if (calls < 3) throw new TransientError('blip');
        return Promise.resolve('ok');
      },
      {
        policy: defaultRetryPolicy,
        timeoutMs: 1_000,
        label: 't',
        sleep: noSleep,
        onAttemptFailed: (f) => failures.push(f.attempt),
      },
    );
    expect(res).toEqual({ value: 'ok', attempts: 3 });
    expect(failures).toEqual([1, 2]);
  });

  it('does not retry non-retryable errors', async () => {
    let calls = 0;
    await expect(
      runWithRetry(
        () => {
          calls += 1;
          throw new DomainError('VALIDATION_FAILED', 'bad');
        },
        { policy: defaultRetryPolicy, timeoutMs: 1_000, label: 't', sleep: noSleep },
      ),
    ).rejects.toThrow('bad');
    expect(calls).toBe(1);
  });

  it('gives up after maxAttempts', async () => {
    let calls = 0;
    await expect(
      runWithRetry(
        () => {
          calls += 1;
          throw new TransientError('down');
        },
        { policy: { ...defaultRetryPolicy, maxAttempts: 4 }, timeoutMs: 1_000, label: 't', sleep: noSleep },
      ),
    ).rejects.toThrow('down');
    expect(calls).toBe(4);
  });

  it('enforces a per-attempt timeout and aborts the signal', async () => {
    let aborted = false;
    await expect(
      runWithRetry(
        (_attempt, signal) =>
          new Promise((resolve) => {
            signal.addEventListener('abort', () => {
              aborted = true;
            });
            setTimeout(resolve, 500);
          }),
        { policy: { ...defaultRetryPolicy, maxAttempts: 1 }, timeoutMs: 20, label: 'slow', sleep: noSleep },
      ),
    ).rejects.toBeInstanceOf(StepTimeoutError);
    expect(aborted).toBe(true);
  });
});

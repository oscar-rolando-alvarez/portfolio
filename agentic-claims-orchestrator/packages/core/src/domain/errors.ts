/**
 * Error taxonomy. The runtime decides whether to retry purely on the error class,
 * so adapters must translate infrastructure failures into one of these.
 */
export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'FORBIDDEN'
  | 'TRANSIENT'
  | 'TIMEOUT'
  | 'BUDGET_EXCEEDED'
  | 'POLICY_BLOCKED'
  | 'TOOL_FAILED'
  | 'LLM_FAILED'
  | 'STEP_FAILED'
  | 'CONCURRENCY';

export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    code: ErrorCode,
    message: string,
    options: { retryable?: boolean; cause?: unknown; details?: Record<string, unknown> } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'DomainError';
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
  }
}

export class TransientError extends DomainError {
  constructor(message: string, cause?: unknown) {
    super('TRANSIENT', message, { retryable: true, cause });
    this.name = 'TransientError';
  }
}

export class StepTimeoutError extends DomainError {
  constructor(step: string, timeoutMs: number) {
    super('TIMEOUT', `step "${step}" exceeded ${timeoutMs}ms`, { retryable: true });
    this.name = 'StepTimeoutError';
  }
}

export class BudgetExceededError extends DomainError {
  constructor(dimension: string, limit: number, actual: number) {
    super('BUDGET_EXCEEDED', `budget exceeded: ${dimension} ${actual} > ${limit}`, {
      retryable: false,
      details: { dimension, limit, actual },
    });
    this.name = 'BudgetExceededError';
  }
}

export class PolicyViolationError extends DomainError {
  constructor(ruleId: string, message: string) {
    super('POLICY_BLOCKED', `[${ruleId}] ${message}`, { retryable: false, details: { ruleId } });
    this.name = 'PolicyViolationError';
  }
}

export class ConcurrencyError extends DomainError {
  constructor(message: string) {
    super('CONCURRENCY', message, { retryable: false });
    this.name = 'ConcurrencyError';
  }
}

export function isRetryable(err: unknown): boolean {
  if (err instanceof DomainError) return err.retryable;
  // Unknown errors (network resets, driver hiccups) are treated as transient; validation
  // problems are always surfaced as DomainError('VALIDATION_FAILED') by our own code.
  return true;
}

export function toErrorInfo(err: unknown): { code: ErrorCode; message: string } {
  if (err instanceof DomainError) return { code: err.code, message: err.message };
  if (err instanceof Error) return { code: 'STEP_FAILED', message: err.message };
  return { code: 'STEP_FAILED', message: String(err) };
}

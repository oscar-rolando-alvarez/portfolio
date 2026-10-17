import { BudgetExceededError } from '../domain/errors.ts';
import type { Usage } from './types.ts';

/** Hard per-run limits. A run that hits one fails safe (it is handed to a human, never auto-decided). */
export interface RunBudget {
  maxIterations: number;
  maxLlmTokens: number;
  maxCostUsd: number;
  maxToolCalls: number;
  maxWallClockMs: number;
}

export const defaultBudget: RunBudget = {
  maxIterations: 20,
  maxLlmTokens: 24_000,
  maxCostUsd: 0.25,
  maxToolCalls: 40,
  maxWallClockMs: 10 * 60_000,
};

export function checkBudget(budget: RunBudget, usage: Usage, elapsedMs: number): void {
  if (usage.iterations >= budget.maxIterations) {
    throw new BudgetExceededError('iterations', budget.maxIterations, usage.iterations + 1);
  }
  const tokens = usage.inputTokens + usage.outputTokens;
  if (tokens > budget.maxLlmTokens) throw new BudgetExceededError('llm_tokens', budget.maxLlmTokens, tokens);
  if (usage.costUsd > budget.maxCostUsd)
    throw new BudgetExceededError('cost_usd', budget.maxCostUsd, usage.costUsd);
  if (usage.toolCalls > budget.maxToolCalls) {
    throw new BudgetExceededError('tool_calls', budget.maxToolCalls, usage.toolCalls);
  }
  if (elapsedMs > budget.maxWallClockMs) {
    throw new BudgetExceededError('wall_clock_ms', budget.maxWallClockMs, elapsedMs);
  }
}

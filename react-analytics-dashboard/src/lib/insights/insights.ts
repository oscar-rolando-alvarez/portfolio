import { generateText, type LanguageModel } from 'ai';
import type { Metric } from '@/types';
import type { FunnelStep } from '@/lib/analytics/mockData';

export interface InsightsInput {
  metrics: Metric[];
  funnel: FunnelStep[];
}

export interface InsightsResult {
  source: 'llm' | 'rules';
  highlights: string[];
  generatedAt: string;
}

const MAX_HIGHLIGHTS = 4;

const SYSTEM_PROMPT = [
  'You are a senior product analyst.',
  'Given KPI and funnel data as JSON, write at most four short, factual insights for a business dashboard.',
  'Each insight is one sentence on its own line, without bullets or numbering.',
  'Only use numbers present in the data. Do not speculate about causes you cannot see.',
].join(' ');

function pct(value: number) {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

/** Deterministic insights used when no LLM is configured or the call fails. */
export function ruleBasedInsights({ metrics, funnel }: InsightsInput): string[] {
  const highlights: string[] = [];
  const withChange = metrics.filter((m) => typeof m.changePercent === 'number');

  const best = [...withChange].sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0))[0];
  if (best) {
    highlights.push(`${best.name} is the strongest mover at ${pct(best.changePercent ?? 0)} versus the previous period.`);
  }

  const declining = withChange.filter((m) => (m.changePercent ?? 0) < 0);
  if (declining.length > 0) {
    highlights.push(`Watch ${declining.map((m) => m.name).join(', ')}: down versus the previous period.`);
  } else if (withChange.length > 0) {
    highlights.push(`All ${withChange.length} tracked KPIs improved versus the previous period.`);
  }

  if (funnel.length > 1) {
    let worst = { from: funnel[0]!, to: funnel[1]!, rate: 1 };
    for (let i = 1; i < funnel.length; i++) {
      const from = funnel[i - 1]!;
      const to = funnel[i]!;
      const rate = from.value > 0 ? to.value / from.value : 0;
      if (rate < worst.rate) worst = { from, to, rate };
    }
    highlights.push(
      `The largest funnel drop-off is ${worst.from.stage} to ${worst.to.stage}, where only ${(worst.rate * 100).toFixed(1)}% continue.`
    );

    const first = funnel[0]!;
    const last = funnel[funnel.length - 1]!;
    if (first.value > 0) {
      highlights.push(
        `End-to-end funnel conversion is ${((last.value / first.value) * 100).toFixed(1)}% (${first.stage} to ${last.stage}).`
      );
    }
  }

  return highlights.slice(0, MAX_HIGHLIGHTS);
}

function parseHighlights(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)
    .slice(0, MAX_HIGHLIGHTS);
}

/**
 * Produces natural-language insights for the dashboard. Uses the configured
 * language model when available and always falls back to rule-based output,
 * so the UI never depends on an external provider being reachable.
 */
export async function generateInsights(
  input: InsightsInput,
  options: { model?: LanguageModel | null; now?: () => Date; abortSignal?: AbortSignal } = {}
): Promise<InsightsResult> {
  const now = options.now ?? (() => new Date());

  if (options.model) {
    try {
      const { text } = await generateText({
        model: options.model,
        system: SYSTEM_PROMPT,
        prompt: JSON.stringify({
          metrics: input.metrics.map(({ name, value, previousValue, changePercent, unit }) => ({
            name,
            value,
            previousValue,
            changePercent,
            unit,
          })),
          funnel: input.funnel,
        }),
        temperature: 0.2,
        maxRetries: 1,
        abortSignal: options.abortSignal,
      });
      const highlights = parseHighlights(text);
      if (highlights.length > 0) {
        return { source: 'llm', highlights, generatedAt: now().toISOString() };
      }
    } catch (error) {
      console.warn('LLM insights failed, falling back to rule-based insights:', error);
    }
  }

  return { source: 'rules', highlights: ruleBasedInsights(input), generatedAt: now().toISOString() };
}

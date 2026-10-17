import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import { getChartSeries, getMetrics } from '@/lib/analytics/mockData';
import { generateInsights, ruleBasedInsights } from '../insights';
import { resolveInsightsModel } from '../provider';

const input = { metrics: getMetrics(), funnel: getChartSeries().funnel };
const fixedNow = () => new Date('2026-10-17T12:00:00Z');

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 20, text: 20, reasoning: undefined },
};

function mockModel(text: string) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text', text }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage,
      warnings: [],
    }),
  });
}

describe('ruleBasedInsights', () => {
  it('highlights the strongest mover and the worst funnel step', () => {
    const highlights = ruleBasedInsights(input);

    expect(highlights.length).toBeGreaterThan(0);
    expect(highlights.length).toBeLessThanOrEqual(4);
    expect(highlights[0]).toContain('Total Visitors');
    expect(highlights.some((h) => h.includes('Product views to Add to cart'))).toBe(true);
    expect(highlights.some((h) => h.includes('End-to-end funnel conversion is 4.2%'))).toBe(true);
  });

  it('calls out declining KPIs', () => {
    const metrics = [
      { id: 'a', name: 'Signups', value: 90, changePercent: -10, trend: 'down' as const, category: 'x' },
      { id: 'b', name: 'Revenue', value: 120, changePercent: 20, trend: 'up' as const, category: 'x' },
    ];
    expect(ruleBasedInsights({ metrics, funnel: [] })).toContain(
      'Watch Signups: down versus the previous period.'
    );
  });
});

describe('generateInsights', () => {
  it('falls back to rules when no model is configured', async () => {
    const result = await generateInsights(input, { model: null, now: fixedNow });

    expect(result.source).toBe('rules');
    expect(result.generatedAt).toBe('2026-10-17T12:00:00.000Z');
    expect(result.highlights).toEqual(ruleBasedInsights(input));
  });

  it('uses the language model output and strips list markers', async () => {
    const model = mockModel('- Visitors grew 11%.\n2. Revenue is up 6.2%.\n\n* Checkout is the weakest step.');

    const result = await generateInsights(input, { model, now: fixedNow });

    expect(result.source).toBe('llm');
    expect(result.highlights).toEqual([
      'Visitors grew 11%.',
      'Revenue is up 6.2%.',
      'Checkout is the weakest step.',
    ]);
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt);
    expect(prompt).toContain('Total Visitors');
    expect(prompt).toContain('Add to cart');
  });

  it('falls back to rules when the model call fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error('provider unavailable');
      },
    });

    const result = await generateInsights(input, { model, now: fixedNow });

    expect(result.source).toBe('rules');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('resolveInsightsModel', () => {
  it('returns null when the endpoint is not configured', () => {
    expect(resolveInsightsModel({})).toBeNull();
    expect(resolveInsightsModel({ baseURL: 'http://localhost:4000/v1' })).toBeNull();
  });

  it('builds an OpenAI-compatible chat model from config', () => {
    const model = resolveInsightsModel({ baseURL: 'http://localhost:4000/v1', model: 'my-model' });
    expect(model).not.toBeNull();
    expect(typeof model === 'object' && model?.modelId).toBe('my-model');
  });
});

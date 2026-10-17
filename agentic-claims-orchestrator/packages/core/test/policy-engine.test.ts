import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PolicyEngine, evaluateCondition, getPath } from '../src/index.ts';

const policyDoc: unknown = JSON.parse(
  readFileSync(new URL('../../../config/claims-policy.json', import.meta.url), 'utf8'),
);
const engine = new PolicyEngine<Record<string, unknown>>(policyDoc);

const approve = (payout: number, extra: Record<string, unknown> = {}) => ({
  decision: { outcome: 'approve', payoutAmount: payout },
  coverage: { covered: true, coverageLimit: 50_000 },
  extraction: { consistency: 'consistent' },
  intake: { flags: [] },
  fraud: { score: 0.05 },
  ...extra,
});

describe('condition evaluation', () => {
  const state = { a: { b: 5, list: ['x'], s: 'hello' }, c: null };
  it.each([
    [{ field: 'a.b', op: 'gt', value: 4 }, true],
    [{ field: 'a.b', op: 'lte', value: 4 }, false],
    [{ field: 'a.list', op: 'contains', value: 'x' }, true],
    [{ field: 'a.s', op: 'contains', value: 'ell' }, true],
    [{ field: 'a.b', op: 'in', value: [1, 5] }, true],
    [{ field: 'c', op: 'missing' }, true],
    [{ field: 'nope.deep', op: 'exists' }, false],
    [{ field: 'nope', op: 'gt', value: 1 }, false],
    [{ field: 'a.b', op: 'gte', ref: 'a.b' }, true],
    [{ all: [{ field: 'a.b', op: 'eq', value: 5 }, { not: { field: 'c', op: 'exists' } }] }, true],
    [
      {
        any: [
          { field: 'a.b', op: 'eq', value: 1 },
          { field: 'a.s', op: 'neq', value: 'x' },
        ],
      },
      true,
    ],
  ] as const)('%j -> %s', (cond, expected) => {
    expect(evaluateCondition(cond as never, state)).toBe(expected);
  });

  it('getPath tolerates non-objects', () => {
    expect(getPath({ a: 1 }, 'a.b.c')).toBeUndefined();
  });
});

describe('claims guardrail policy', () => {
  it('lets low-value, low-risk, documented approvals straight through', () => {
    const v = engine.evaluate('decision', approve(3_000));
    expect(v.effect).toBe('allow');
    expect(v.matched).toEqual([]);
  });

  it('requires a senior adjuster above the payout threshold', () => {
    const v = engine.evaluate('decision', approve(10_001));
    expect(v).toMatchObject({ effect: 'require_approval', requiredRole: 'senior_adjuster' });
    expect(v.matched.map((m) => m.ruleId)).toEqual(['HITL-HIGH-PAYOUT']);
  });

  it('escalates to the highest-authority role when several rules match', () => {
    const v = engine.evaluate('decision', approve(20_000, { fraud: { score: 0.75 } }));
    expect(v.requiredRole).toBe('siu_investigator');
    expect(v.matched.map((m) => m.ruleId).sort()).toEqual(
      ['HITL-HIGH-PAYOUT', 'HITL-MEDIUM-FRAUD', 'HITL-SIU-HIGH-FRAUD'].sort(),
    );
  });

  it('never lets a denial through without a human', () => {
    const v = engine.evaluate('decision', { decision: { outcome: 'deny', payoutAmount: 0 } });
    expect(v).toMatchObject({ effect: 'require_approval', requiredRole: 'adjuster' });
  });

  it('flags prompt injection attempts for review', () => {
    const v = engine.evaluate(
      'decision',
      approve(500, { intake: { flags: ['prompt_injection_suspected'] } }),
    );
    expect(v.matched.map((m) => m.ruleId)).toContain('HITL-PROMPT-INJECTION');
  });

  it('blocks payouts above the coverage limit (also after human overrides)', () => {
    expect(engine.evaluate('decision', approve(60_000)).effect).toBe('block');
    const v = engine.evaluate('finalize', {
      final: { payoutAmount: 60_000 },
      coverage: { covered: true, coverageLimit: 50_000 },
    });
    expect(v.effect).toBe('block');
    expect(
      engine.evaluate('finalize', {
        final: { payoutAmount: 10 },
        coverage: { covered: false, coverageLimit: 0 },
      }).effect,
    ).toBe('block');
  });

  it('grants tools per step (least privilege)', () => {
    expect(engine.allowedTools('extraction')).toEqual(['document_extract']);
    expect(engine.allowedTools('decision')).toEqual([]);
    expect(engine.allowedTools('unknown')).toEqual([]);
    expect(engine.egressRuleId).toBe('DP-PII-NO-EGRESS');
    expect(engine.policyVersion).toBe('2026.10.1');
  });

  it('rejects malformed policy documents', () => {
    expect(() => new PolicyEngine({ id: 'x' })).toThrow();
    const bad = structuredClone(policyDoc) as { rules: { role?: string }[] };
    (bad.rules[0] as { role: string }).role = 'ceo';
    expect(() => new PolicyEngine(bad)).toThrow(/approvalRolePriority/);
  });
});

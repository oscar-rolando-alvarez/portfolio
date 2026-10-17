import { describe, expect, it } from 'vitest';
import { FraudModel } from '../src/index.ts';

const model = new FraudModel();

describe('FraudModel (exported logistic regression)', () => {
  it('reproduces the Python training probabilities (parity vectors)', () => {
    expect(model.artifact.parityVectors.length).toBeGreaterThan(0);
    for (const v of model.artifact.parityVectors) {
      expect(Math.abs(model.score(v.features).probability - v.probability)).toBeLessThan(1e-9);
    }
  });

  it('decomposes the logit exactly into feature contributions', () => {
    const v = model.artifact.parityVectors[0];
    if (!v) throw new Error('no parity vector');
    const s = model.score(v.features);
    const logit = model.artifact.intercept + s.factors.reduce((acc, f) => acc + f.contribution, 0);
    expect(1 / (1 + Math.exp(-logit))).toBeCloseTo(s.probability, 12);
    const abs = s.factors.map((f) => Math.abs(f.contribution));
    expect(abs).toEqual([...abs].sort((a, b) => b - a));
  });

  it('maps probabilities to bands', () => {
    expect(model.band(0.1)).toBe('low');
    expect(model.band(0.3)).toBe('medium');
    expect(model.band(0.69)).toBe('medium');
    expect(model.band(0.7)).toBe('high');
  });

  it('rejects missing or non-finite features', () => {
    expect(() => model.score({})).toThrow(/missing/);
    const v = model.artifact.parityVectors[0]?.features ?? {};
    expect(() => model.score({ ...v, night_incident: Number.NaN })).toThrow(/invalid/);
  });

  it('exposes training metadata for the model card', () => {
    expect(model.version).toBe('fraud-lr-1.0.0');
    expect(model.featureNames).toContain('documentation_gap');
    expect(model.featureNames).not.toContain('age');
    expect(model.artifact.metrics.rocAuc).toBeGreaterThan(0.8);
  });

  it('rejects artifacts that do not match the schema', () => {
    expect(() => new FraudModel({ modelVersion: 'x' })).toThrow();
  });
});

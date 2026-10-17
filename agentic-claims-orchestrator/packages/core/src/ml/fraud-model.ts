import { z } from 'zod';
import type { FraudBand, FraudFactor } from '../domain/claim.ts';
import artifact from './fraud-model.v1.json' with { type: 'json' };

/** Schema of the JSON artifact exported by ml/train_fraud_model.py. */
export const FraudModelArtifact = z.object({
  modelVersion: z.string(),
  algorithm: z.string(),
  intercept: z.number(),
  features: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        mean: z.number(),
        scale: z.number().positive(),
        coefficient: z.number(),
      }),
    )
    .min(1),
  bands: z.object({ medium: z.number(), high: z.number() }),
  metrics: z.record(z.string(), z.unknown()),
  training: z.record(z.string(), z.unknown()),
  parityVectors: z.array(z.object({ features: z.record(z.string(), z.number()), probability: z.number() })),
});
export type FraudModelArtifact = z.infer<typeof FraudModelArtifact>;

export interface FraudScore {
  probability: number;
  band: FraudBand;
  modelVersion: string;
  /** Per-feature contribution to the logit (coefficient x standardized value), sorted by |impact|. */
  factors: FraudFactor[];
}

/**
 * Pure-TypeScript scorer for the exported logistic regression. No inference server, no native
 * deps; the explanation is exact (linear model), which is what an adjuster or regulator needs.
 */
export class FraudModel {
  readonly artifact: FraudModelArtifact;

  constructor(raw: unknown = artifact) {
    this.artifact = FraudModelArtifact.parse(raw);
  }

  get version(): string {
    return this.artifact.modelVersion;
  }

  get featureNames(): string[] {
    return this.artifact.features.map((f) => f.name);
  }

  score(features: Readonly<Record<string, number>>): FraudScore {
    let z = this.artifact.intercept;
    const factors: FraudFactor[] = [];
    for (const f of this.artifact.features) {
      const value = features[f.name];
      if (value === undefined || !Number.isFinite(value))
        throw new Error(`missing/invalid feature "${f.name}"`);
      const contribution = ((value - f.mean) / f.scale) * f.coefficient;
      z += contribution;
      factors.push({ feature: f.name, value, contribution });
    }
    const probability = 1 / (1 + Math.exp(-z));
    factors.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
    return { probability, band: this.band(probability), modelVersion: this.version, factors };
  }

  band(probability: number): FraudBand {
    if (probability >= this.artifact.bands.high) return 'high';
    if (probability >= this.artifact.bands.medium) return 'medium';
    return 'low';
  }
}

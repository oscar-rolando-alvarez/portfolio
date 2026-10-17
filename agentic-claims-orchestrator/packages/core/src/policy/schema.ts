import { z } from 'zod';

const Scalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const ComparisonOp = z.enum([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'contains',
  'exists',
  'missing',
]);

export interface Comparison {
  field: string;
  op: z.infer<typeof ComparisonOp>;
  value?: z.infer<typeof Scalar> | z.infer<typeof Scalar>[] | undefined;
  /** Compare against another field of the state instead of a literal. */
  ref?: string | undefined;
}

export type Condition = Comparison | { all: Condition[] } | { any: Condition[] } | { not: Condition };

export const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.strictObject({ all: z.array(ConditionSchema).min(1) }),
    z.strictObject({ any: z.array(ConditionSchema).min(1) }),
    z.strictObject({ not: ConditionSchema }),
    z.strictObject({
      field: z.string().min(1),
      op: ComparisonOp,
      value: z.union([Scalar, z.array(Scalar)]).optional(),
      ref: z.string().optional(),
    }),
  ]),
);

export const PolicyRule = z.discriminatedUnion('effect', [
  z.strictObject({
    id: z.string().regex(/^[A-Z][A-Z0-9-]+$/),
    description: z.string(),
    stage: z.string(),
    when: ConditionSchema,
    effect: z.literal('require_approval'),
    role: z.string(),
  }),
  z.strictObject({
    id: z.string().regex(/^[A-Z][A-Z0-9-]+$/),
    description: z.string(),
    stage: z.string(),
    when: ConditionSchema,
    effect: z.literal('block'),
  }),
]);
export type PolicyRule = z.infer<typeof PolicyRule>;

export const DataPolicy = z.strictObject({
  id: z.string().regex(/^[A-Z][A-Z0-9-]+$/),
  description: z.string(),
  classification: z.enum(['pii', 'internal']),
  /** Only these tools may *produce* data of this classification (raw values never leave them). */
  sourceTools: z.array(z.string()),
  deniedSinks: z.array(z.enum(['llm', 'audit', 'logs', 'api'])),
});
export type DataPolicy = z.infer<typeof DataPolicy>;

export const PolicyDocument = z.strictObject({
  $schema: z.string().optional(),
  id: z.string(),
  version: z.string(),
  description: z.string(),
  /** Highest-authority role first; used to pick a single approver when several rules match. */
  approvalRolePriority: z.array(z.string()).min(1),
  rules: z.array(PolicyRule),
  dataPolicies: z.array(DataPolicy),
  /** Least-privilege tool grants per graph step. Steps not listed get no tools. */
  toolGrants: z.record(z.string(), z.array(z.string())),
});
export type PolicyDocument = z.infer<typeof PolicyDocument>;

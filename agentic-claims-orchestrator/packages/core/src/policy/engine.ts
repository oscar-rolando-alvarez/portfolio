import { PolicyDocument, type Condition, type PolicyRule } from './schema.ts';

export interface MatchedRule {
  ruleId: string;
  effect: PolicyRule['effect'];
  role: string | null;
  description: string;
}

export interface GateVerdict {
  effect: 'allow' | 'require_approval' | 'block';
  matched: MatchedRule[];
  requiredRole: string | null;
  policyId: string;
  policyVersion: string;
}

/** Port the orchestrator depends on; the policy engine is the production implementation. */
export interface Gate<S> {
  readonly policyVersion: string;
  readonly egressRuleId: string;
  evaluate(stage: string, state: S): GateVerdict;
  allowedTools(stage: string): readonly string[];
}

export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function compare(op: string, actual: unknown, expected: unknown): boolean {
  switch (op) {
    case 'exists':
      return actual !== undefined && actual !== null;
    case 'missing':
      return actual === undefined || actual === null;
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'in':
      return Array.isArray(expected) && expected.includes(actual);
    case 'contains':
      return Array.isArray(actual)
        ? actual.includes(expected)
        : typeof actual === 'string' && actual.includes(String(expected));
    default: {
      // Ordered comparisons only apply to numbers; a missing field never matches (fail-closed
      // rules are written explicitly with "missing").
      if (typeof actual !== 'number' || typeof expected !== 'number') return false;
      if (op === 'gt') return actual > expected;
      if (op === 'gte') return actual >= expected;
      if (op === 'lt') return actual < expected;
      if (op === 'lte') return actual <= expected;
      return false;
    }
  }
}

export function evaluateCondition(cond: Condition, state: unknown): boolean {
  if ('all' in cond) return cond.all.every((c) => evaluateCondition(c, state));
  if ('any' in cond) return cond.any.some((c) => evaluateCondition(c, state));
  if ('not' in cond) return !evaluateCondition(cond.not, state);
  const actual = getPath(state, cond.field);
  const expected = cond.ref !== undefined ? getPath(state, cond.ref) : cond.value;
  return compare(cond.op, actual, expected);
}

/** Declarative, versioned policy engine. Pure and deterministic: same state + policy => same verdict. */
export class PolicyEngine<S> implements Gate<S> {
  readonly doc: PolicyDocument;
  readonly egressRuleId: string;

  constructor(doc: unknown) {
    this.doc = PolicyDocument.parse(doc);
    const priority = new Set(this.doc.approvalRolePriority);
    for (const r of this.doc.rules) {
      if (r.effect === 'require_approval' && !priority.has(r.role)) {
        throw new Error(`rule ${r.id}: role "${r.role}" missing from approvalRolePriority`);
      }
    }
    const egress = this.doc.dataPolicies.find(
      (d) => d.classification === 'pii' && d.deniedSinks.includes('llm'),
    );
    if (!egress) throw new Error('policy must declare a PII data policy denying the "llm" sink');
    this.egressRuleId = egress.id;
  }

  get policyVersion(): string {
    return this.doc.version;
  }

  evaluate(stage: string, state: S): GateVerdict {
    const matched: MatchedRule[] = this.doc.rules
      .filter((r) => r.stage === stage && evaluateCondition(r.when, state))
      .map((r) => ({
        ruleId: r.id,
        effect: r.effect,
        role: r.effect === 'require_approval' ? r.role : null,
        description: r.description,
      }));
    const base = { matched, policyId: this.doc.id, policyVersion: this.doc.version };
    if (matched.some((m) => m.effect === 'block')) return { ...base, effect: 'block', requiredRole: null };
    const roles = new Set(matched.map((m) => m.role).filter((r): r is string => r !== null));
    if (roles.size === 0) return { ...base, effect: 'allow', requiredRole: null };
    const requiredRole = this.doc.approvalRolePriority.find((r) => roles.has(r)) ?? null;
    return { ...base, effect: 'require_approval', requiredRole };
  }

  allowedTools(stage: string): readonly string[] {
    return this.doc.toolGrants[stage] ?? [];
  }
}

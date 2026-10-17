import type { LlmPort } from '../llm/types.ts';
import type { GateVerdict } from '../policy/engine.ts';
import type { ToolGateway } from '../tools/contracts.ts';
import type { AuditEventInput, Clock, Logger } from './types.ts';
import type { RetryPolicy } from './retry.ts';

export const END = '__end__' as const;
export const START = '__start__' as const;

export interface StepContext {
  readonly runId: string;
  readonly tenantId: string;
  readonly step: string;
  readonly attempt: number;
  readonly signal: AbortSignal;
  /** Metered, budget-enforced, PII-guarded and traced LLM handle scoped to this step. */
  readonly llm: LlmPort;
  /** Allow-listed, schema-validated MCP tool gateway scoped to this step. */
  readonly tools: ToolGateway;
  readonly clock: Clock;
  readonly logger: Logger;
  /** Adds a domain event to the audit trail; persisted atomically with the step checkpoint. */
  emit(event: Omit<AuditEventInput, 'actor'>): void;
}

export interface StepDefinition<S> {
  readonly name: string;
  readonly kind: 'agent' | 'system';
  readonly description: string;
  readonly timeoutMs?: number;
  readonly retry?: Partial<RetryPolicy>;
  execute(state: S, ctx: StepContext): Promise<S>;
}

export type Edge<S> = string | ((state: S) => string);

export interface GraphDefinition<S> {
  readonly id: string;
  readonly version: string;
  readonly entry: string;
  readonly steps: Readonly<Record<string, StepDefinition<S>>>;
  /** Explicit transition table: step -> next step (static or state-dependent). */
  readonly edges: Readonly<Record<string, Edge<S>>>;
  /** Folds a human approval decision into the state before the run resumes. */
  applyHumanDecision(state: S, approval: { approvalId: string; decidedBy: string; decision: unknown }): S;
  /** Records the guardrail verdict in domain state (e.g. routing) after a gated step. */
  annotateVerdict?(state: S, stage: string, verdict: GateVerdict): S;
}

export class Graph<S> {
  readonly def: GraphDefinition<S>;

  constructor(def: GraphDefinition<S>) {
    this.def = def;
    this.validate();
  }

  get id(): string {
    return this.def.id;
  }

  get version(): string {
    return this.def.version;
  }

  step(name: string): StepDefinition<S> {
    const step = this.def.steps[name];
    if (!step) throw new Error(`unknown step "${name}" in graph ${this.def.id}`);
    return step;
  }

  next(from: string, state: S): string {
    const edge = this.def.edges[from];
    if (edge === undefined) throw new Error(`no edge from "${from}"`);
    const target = typeof edge === 'function' ? edge(state) : edge;
    if (target !== END && !(target in this.def.steps)) {
      throw new Error(`edge from "${from}" points to unknown step "${target}"`);
    }
    return target;
  }

  /** Static validation: every step has an edge, static targets exist, every step is reachable. */
  private validate(): void {
    const names = Object.keys(this.def.steps);
    if (!names.includes(this.def.entry)) throw new Error(`entry step "${this.def.entry}" not defined`);
    for (const name of names) {
      const step = this.def.steps[name];
      if (step?.name !== name) throw new Error(`step key "${name}" does not match step.name`);
      const edge = this.def.edges[name];
      if (edge === undefined) throw new Error(`step "${name}" has no outgoing edge`);
      if (typeof edge === 'string' && edge !== END && !names.includes(edge)) {
        throw new Error(`edge "${name}" -> "${edge}" targets an unknown step`);
      }
    }
    for (const from of Object.keys(this.def.edges)) {
      if (!names.includes(from)) throw new Error(`edge declared from unknown step "${from}"`);
    }
  }

  /** Mermaid rendering of the static topology (dynamic edges are labelled "conditional"). */
  toMermaid(conditionalTargets: Record<string, string[]> = {}): string {
    const lines = ['stateDiagram-v2', `  [*] --> ${this.def.entry}`];
    for (const [from, edge] of Object.entries(this.def.edges)) {
      const targets = typeof edge === 'string' ? [edge] : (conditionalTargets[from] ?? []);
      for (const t of targets) lines.push(`  ${from} --> ${t === END ? '[*]' : t}`);
    }
    return lines.join('\n');
  }
}

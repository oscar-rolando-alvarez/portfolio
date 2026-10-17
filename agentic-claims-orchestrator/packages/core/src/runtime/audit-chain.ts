import { createHash } from 'node:crypto';
import type { AuditEvent, AuditEventInput } from './types.ts';

export const GENESIS_HASH = '0'.repeat(64);

/** Deterministic JSON (sorted keys) so hashes are reproducible across stores and languages. */
export function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** Builds the next tamper-evident event: hash = sha256(prevHash || canonical(event body)). */
export function chainEvent(
  prev: { seq: number; hash: string } | null,
  base: { runId: string; tenantId: string; at: string },
  input: AuditEventInput,
): AuditEvent {
  const seq = prev ? prev.seq + 1 : 1;
  const prevHash = prev ? prev.hash : GENESIS_HASH;
  const body = {
    runId: base.runId,
    tenantId: base.tenantId,
    seq,
    at: base.at,
    type: input.type,
    actor: input.actor,
    payload: input.payload,
  };
  return { ...body, prevHash, hash: sha256(prevHash + canonicalJson(body)) };
}

export interface ChainVerification {
  valid: boolean;
  events: number;
  brokenAtSeq: number | null;
}

export function verifyAuditChain(events: readonly AuditEvent[]): ChainVerification {
  let prevHash = GENESIS_HASH;
  let expectedSeq = 1;
  for (const e of events) {
    const body = {
      runId: e.runId,
      tenantId: e.tenantId,
      seq: e.seq,
      at: e.at,
      type: e.type,
      actor: e.actor,
      payload: e.payload,
    };
    if (
      e.seq !== expectedSeq ||
      e.prevHash !== prevHash ||
      sha256(prevHash + canonicalJson(body)) !== e.hash
    ) {
      return { valid: false, events: events.length, brokenAtSeq: e.seq };
    }
    prevHash = e.hash;
    expectedSeq += 1;
  }
  return { valid: true, events: events.length, brokenAtSeq: null };
}

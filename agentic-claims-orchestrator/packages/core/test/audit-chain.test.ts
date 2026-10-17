import { describe, expect, it } from 'vitest';
import { GENESIS_HASH, canonicalJson, chainEvent, verifyAuditChain, type AuditEvent } from '../src/index.ts';

function build(n: number): AuditEvent[] {
  const events: AuditEvent[] = [];
  for (let i = 0; i < n; i += 1) {
    events.push(
      chainEvent(
        events.at(-1) ?? null,
        { runId: 'r1', tenantId: 't1', at: `2026-10-17T00:00:0${i}.000Z` },
        { type: 'step.completed', actor: 'system:orchestrator', payload: { i, nested: { b: 2, a: 1 } } },
      ),
    );
  }
  return events;
}

describe('canonicalJson', () => {
  it('sorts keys recursively and drops undefined', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: undefined } })).toBe(
      '{"a":{"d":[1,{"y":2,"z":1}]},"b":1}',
    );
  });
});

describe('audit hash chain', () => {
  it('links events from the genesis hash', () => {
    const events = build(3);
    expect(events[0]?.prevHash).toBe(GENESIS_HASH);
    expect(events[1]?.prevHash).toBe(events[0]?.hash);
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(verifyAuditChain(events)).toEqual({ valid: true, events: 3, brokenAtSeq: null });
  });

  it('detects payload tampering', () => {
    const events = build(3);
    events[1]!.payload = { i: 99 };
    expect(verifyAuditChain(events)).toMatchObject({ valid: false, brokenAtSeq: 2 });
  });

  it('detects deleted events', () => {
    const events = build(4);
    events.splice(1, 1);
    expect(verifyAuditChain(events).valid).toBe(false);
  });

  it('is independent of key order (jsonb round-trips)', () => {
    const events = build(2);
    const reordered = events.map((e) => ({ ...e, payload: { nested: { a: 1, b: 2 }, i: e.payload.i } }));
    expect(verifyAuditChain(reordered).valid).toBe(true);
  });
});

import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  InMemoryVaultStorage,
  PiiCipher,
  TokenizingVault,
  isPiiToken,
  maskReplacer,
  redactPii,
  scanPii,
} from '../src/index.ts';

const key = randomBytes(32).toString('base64');

describe('DLP scanner', () => {
  it('finds emails, phones, SSNs and Luhn-valid card numbers', () => {
    const text =
      'Mail a.b@example.com, call (555) 123-4567 or +1 555-987-6543, SSN 123-45-6789, card 4111 1111 1111 1111.';
    const kinds = scanPii(text).map((f) => f.kind);
    expect(kinds).toEqual(['email', 'phone', 'phone', 'ssn', 'card']);
  });

  it('ignores non-Luhn digit runs, dates, decimals and policy numbers', () => {
    expect(scanPii('ref 1234567890123 on 2026-10-01 for POL-100001, x=6.175867270105761')).toEqual([]);
  });

  it('matches known values case-insensitively', () => {
    expect(scanPii('Claimant MARIA LOPEZ called', ['Maria Lopez'])).toHaveLength(1);
  });

  it('redacts with a replacer', async () => {
    const { text, findings } = await redactPii('write to x@y.io now', maskReplacer);
    expect(text).toBe('write to [REDACTED:EMAIL] now');
    expect(findings).toHaveLength(1);
  });
});

describe('PII vault', () => {
  const vault = () =>
    new TokenizingVault(new InMemoryVaultStorage(), new PiiCipher(key), 'hmac-secret-for-tests');

  it('issues deterministic, tenant-scoped tokens and round-trips values', async () => {
    const v = vault();
    const t1 = await v.tokenize('acme', 'email', 'Jane@Example.com');
    const t2 = await v.tokenize('acme', 'email', ' jane@example.com ');
    const other = await v.tokenize('globex', 'email', 'jane@example.com');
    expect(t1).toBe(t2);
    expect(t1).not.toBe(other);
    expect(isPiiToken(t1)).toBe(true);
    expect(await v.detokenize('acme', t1)).toBe('Jane@Example.com');
    expect(await v.detokenize('globex', t1)).toBeNull();
  });

  it('tokens never match DLP patterns', async () => {
    const t = await vault().tokenize('acme', 'phone', '555-123-4567');
    expect(scanPii(t)).toEqual([]);
  });

  it('uses authenticated encryption (tampering is detected)', () => {
    const cipher = new PiiCipher(key);
    const ct = cipher.encrypt('secret');
    expect(ct).not.toContain('secret');
    const [iv, tag, body] = ct.split('.');
    const tampered = [iv, tag, Buffer.from('xxxxxx').toString('base64')].join('.');
    expect(() => cipher.decrypt(tampered)).toThrow();
    expect(cipher.decrypt([iv, tag, body].join('.'))).toBe('secret');
  });

  it('rejects keys of the wrong size', () => {
    expect(() => new PiiCipher(Buffer.alloc(16).toString('base64'))).toThrow(/32 bytes/);
  });
});

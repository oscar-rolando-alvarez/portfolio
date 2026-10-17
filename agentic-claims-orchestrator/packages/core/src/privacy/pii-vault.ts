import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import type { PiiKind } from './dlp.ts';

/**
 * PII vault: raw identifiers are swapped for deterministic, tenant-scoped tokens
 * (HMAC-SHA256) and stored encrypted (AES-256-GCM). Determinism lets downstream steps
 * correlate "same claimant" across claims without ever seeing the raw value.
 */
export interface PiiVault {
  tokenize(tenantId: string, kind: PiiKind, value: string): Promise<string>;
  detokenize(tenantId: string, token: string): Promise<string | null>;
}

export interface VaultStorage {
  put(tenantId: string, token: string, kind: PiiKind, ciphertext: string): Promise<void>;
  get(tenantId: string, token: string): Promise<string | null>;
}

export const PII_TOKEN_RE = /\[\[pii:[a-z]+:[0-9a-f]{16}\]\]/g;

export function isPiiToken(value: string): boolean {
  return /^\[\[pii:[a-z]+:[0-9a-f]{16}\]\]$/.test(value);
}

export class PiiCipher {
  private readonly key: Buffer;

  constructor(keyMaterial: string) {
    const key = Buffer.from(keyMaterial, 'base64');
    if (key.length !== 32) throw new Error('PII encryption key must be 32 bytes, base64-encoded');
    this.key = key;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), ct].map((b) => b.toString('base64')).join('.');
  }

  decrypt(payload: string): string {
    const [iv, tag, ct] = payload.split('.').map((p) => Buffer.from(p, 'base64'));
    if (!iv || !tag || !ct) throw new Error('malformed ciphertext');
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  }
}

export class TokenizingVault implements PiiVault {
  private readonly storage: VaultStorage;
  private readonly cipher: PiiCipher;
  private readonly hmacKey: string;

  constructor(storage: VaultStorage, cipher: PiiCipher, hmacKey: string) {
    this.storage = storage;
    this.cipher = cipher;
    this.hmacKey = hmacKey;
  }

  async tokenize(tenantId: string, kind: PiiKind, value: string): Promise<string> {
    const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ');
    const digest = createHmac('sha256', this.hmacKey)
      .update(`${tenantId}\u0000${kind}\u0000${normalized}`)
      .digest('hex');
    const token = `[[pii:${kind}:${digest.slice(0, 16)}]]`;
    await this.storage.put(tenantId, token, kind, this.cipher.encrypt(value));
    return token;
  }

  async detokenize(tenantId: string, token: string): Promise<string | null> {
    const ct = await this.storage.get(tenantId, token);
    return ct === null ? null : this.cipher.decrypt(ct);
  }
}

export class InMemoryVaultStorage implements VaultStorage {
  private readonly data = new Map<string, string>();

  put(tenantId: string, token: string, _kind: PiiKind, ciphertext: string): Promise<void> {
    // First write wins, matching the PostgreSQL adapter (ON CONFLICT DO NOTHING).
    const key = `${tenantId}|${token}`;
    if (!this.data.has(key)) this.data.set(key, ciphertext);
    return Promise.resolve();
  }

  get(tenantId: string, token: string): Promise<string | null> {
    return Promise.resolve(this.data.get(`${tenantId}|${token}`) ?? null);
  }

  get size(): number {
    return this.data.size;
  }
}

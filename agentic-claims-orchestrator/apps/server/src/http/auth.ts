import { createHash } from 'node:crypto';
import type { Principal } from '@aco/core';
import type { ApiKeyEntry } from '../config.ts';

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

/**
 * API-key authentication with tenant scoping and RBAC. Keys are configured as SHA-256 hashes,
 * so a leaked config/secret does not leak usable credentials. In production this sits behind
 * an API gateway / OIDC (see ADR-0005); the Principal model is the same.
 */
export class ApiKeyAuthenticator {
  private readonly byHash: Map<string, ApiKeyEntry>;

  constructor(entries: readonly ApiKeyEntry[]) {
    this.byHash = new Map(entries.map((e) => [e.sha256, e]));
  }

  authenticate(headers: {
    apiKey?: string | undefined;
    authorization?: string | undefined;
  }): Principal | null {
    const bearer = headers.authorization?.startsWith('Bearer ') ? headers.authorization.slice(7) : undefined;
    const key = headers.apiKey ?? bearer;
    if (!key || key.length < 16 || key.length > 256) return null;
    const entry = this.byHash.get(hashApiKey(key));
    return entry ? { id: entry.id, tenantId: entry.tenantId, roles: entry.roles } : null;
  }
}

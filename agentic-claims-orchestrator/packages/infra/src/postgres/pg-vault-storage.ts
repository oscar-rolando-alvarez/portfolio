import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PiiKind, VaultStorage } from '@aco/core';
import * as schema from './schema.ts';

export class PgVaultStorage implements VaultStorage {
  private readonly db: NodePgDatabase<typeof schema>;

  constructor(db: NodePgDatabase<typeof schema>) {
    this.db = db;
  }

  async put(tenantId: string, token: string, kind: PiiKind, ciphertext: string): Promise<void> {
    // Deterministic tokens: the first write wins, re-tokenizing the same value is a no-op.
    await this.db.insert(schema.piiVault).values({ tenantId, token, kind, ciphertext }).onConflictDoNothing();
  }

  async get(tenantId: string, token: string): Promise<string | null> {
    const [row] = await this.db
      .select({ ciphertext: schema.piiVault.ciphertext })
      .from(schema.piiVault)
      .where(and(eq(schema.piiVault.tenantId, tenantId), eq(schema.piiVault.token, token)));
    return row?.ciphertext ?? null;
  }
}

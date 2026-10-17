import { fileURLToPath } from 'node:url';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import * as schema from './schema.ts';

export type Database = NodePgDatabase<typeof schema>;

export const MIGRATIONS_DIR = fileURLToPath(new URL('../../drizzle', import.meta.url));

export function createDatabase(
  url: string,
  opts: { maxConnections?: number } = {},
): { db: Database; pool: pg.Pool } {
  const pool = new pg.Pool({
    connectionString: url,
    max: opts.maxConnections ?? 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: 'agentic-claims-orchestrator',
  });
  return { db: drizzle(pool, { schema }), pool };
}

export async function runMigrations(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}

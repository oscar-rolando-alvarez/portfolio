import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './packages/infra/src/postgres/schema.ts',
  out: './packages/infra/drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://claims:claims@localhost:5432/claims' },
  strict: true,
});

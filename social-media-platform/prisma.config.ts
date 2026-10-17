import { defineConfig } from 'prisma/config'

// Load .env for local CLI usage (Node 24 built-in; no-op when the file is absent).
try {
  process.loadEnvFile()
} catch {
  // no .env file
}

// Prisma 7 reads connection settings from here instead of schema.prisma.
// `prisma generate` does not need a database, so a placeholder URL is used when unset.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts'
  },
  datasource: {
    url: process.env.DATABASE_URL ?? 'postgresql://placeholder:placeholder@localhost:5432/placeholder'
  }
})

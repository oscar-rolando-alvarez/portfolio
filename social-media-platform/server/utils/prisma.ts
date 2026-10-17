import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'

let client: PrismaClient | undefined

/** Lazily creates a single Prisma client per server process (node-postgres driver adapter). */
export function usePrisma(): PrismaClient {
  if (!client) {
    const databaseUrl = useRuntimeConfig().databaseUrl || process.env.DATABASE_URL
    if (!databaseUrl) {
      throw createError({ statusCode: 503, statusMessage: 'DATABASE_URL is not configured' })
    }
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
  }
  return client
}

/** Prisma `select` for the public author/user card. */
export const userSummarySelect = {
  id: true,
  username: true,
  displayName: true,
  avatar: true,
  verified: true
} as const

import { Pool } from "pg"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  pool: Pool
  prisma: PrismaClient
}

// Reuse the pool across hot-reloads in development
if (!globalForPrisma.pool) {
  globalForPrisma.pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
  })
}

if (!globalForPrisma.prisma) {
  const adapter = new PrismaPg(globalForPrisma.pool)
  globalForPrisma.prisma = new PrismaClient({ adapter })
}

export const db = globalForPrisma.prisma

import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Query logging prints every statement — including customer data in the
// parameters — and costs measurable time per request, so it stays off in
// production. Set PRISMA_LOG_QUERIES=1 to turn it on temporarily.
const logLevels =
  process.env.NODE_ENV === 'production'
    ? (process.env.PRISMA_LOG_QUERIES === '1' ? (['query', 'warn', 'error'] as const) : (['warn', 'error'] as const))
    : (['query', 'warn', 'error'] as const)

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: [...logLevels],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

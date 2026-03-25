import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;

const prismaOptions = {
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
};

// Append connection parameters: pool limits + statement timeout + SSL enforcement
if (process.env.DATABASE_URL) {
  const sep = process.env.DATABASE_URL.includes('?') ? '&' : '?';
  const sslParam = process.env.DATABASE_URL.includes('sslmode=') ? '' : '&sslmode=require';
  prismaOptions.datasources = {
    db: {
      url: `${process.env.DATABASE_URL}${sep}connection_limit=10&pool_timeout=30&statement_timeout=60000${sslParam}`,
    },
  };
}

// Default interactive transaction options (can be overridden per-call)
prismaOptions.transactionOptions = {
  maxWait: 10000,  // 10s to acquire connection
  timeout: 30000,  // 30s transaction timeout
};

const prisma = globalForPrisma.prisma ?? new PrismaClient(prismaOptions);

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;

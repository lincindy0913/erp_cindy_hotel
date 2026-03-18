import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;

const prismaOptions = {
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
};

if (process.env.DATABASE_URL) {
  prismaOptions.datasources = {
    db: {
      url: `${process.env.DATABASE_URL}${process.env.DATABASE_URL.includes('?') ? '&' : '?'}connection_limit=10&pool_timeout=30`,
    },
  };
}

const prisma = globalForPrisma.prisma ?? new PrismaClient(prismaOptions);

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;

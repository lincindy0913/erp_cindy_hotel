/**
 * 資料庫連接設定
 * 使用 Prisma Client
 */

const { PrismaClient } = require('@prisma/client');

const globalForPrisma = global;

const dbOpts = {
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
};

// Enforce SSL on database connection
if (process.env.DATABASE_URL) {
  const sep = process.env.DATABASE_URL.includes('?') ? '&' : '?';
  const sslParam = process.env.DATABASE_URL.includes('sslmode=') ? '' : '&sslmode=require';
  dbOpts.datasources = {
    db: { url: `${process.env.DATABASE_URL}${sep}connection_limit=10&pool_timeout=30${sslParam}` },
  };
}

const prisma =
  globalForPrisma.prisma ||
  new PrismaClient(dbOpts);

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

module.exports = prisma;
module.exports.default = prisma;


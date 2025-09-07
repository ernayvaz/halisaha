import { PrismaClient } from '@prisma/client';

declare global {
  var __prisma__: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  global.__prisma__ ||
  new PrismaClient({
    log: ['error', 'warn'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL || 'file:./prisma/dev.db'
      }
    }
  });

if (process.env.NODE_ENV !== 'production') {
  global.__prisma__ = prisma;
}



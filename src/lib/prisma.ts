import { PrismaClient } from '@prisma/client';

declare global {
  var __prisma__: PrismaClient | undefined;
}

const isProd = process.env.NODE_ENV === 'production';

export const prisma: PrismaClient =
  global.__prisma__ ||
  new PrismaClient({
    log: ['error', 'warn'],
    datasources: {
      db: {
        // On Vercel, DATABASE_URL must be provided (Postgres). Locally, default to SQLite file.
        url: isProd ? (process.env.DATABASE_URL as string) : (process.env.DATABASE_URL || 'file:./prisma/dev.db')
      }
    }
  });

if (process.env.NODE_ENV !== 'production') {
  global.__prisma__ = prisma;
}



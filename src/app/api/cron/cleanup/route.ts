import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(_req: NextRequest) {
  const now = new Date();
  const result = await prisma.historySnapshot.deleteMany({ where: { ttlAt: { lte: now } } });
  return NextResponse.json({ deleted: result.count });
}



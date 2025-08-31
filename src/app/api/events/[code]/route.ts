import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_: NextRequest, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  const event = await prisma.event.findUnique({ where: { code } });
  if (!event) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(event);
}



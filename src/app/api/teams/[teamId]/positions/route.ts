import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_: NextRequest, context: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await context.params;
  const p = await prisma.lineupPosition.findMany({ where: { teamId } });
  return NextResponse.json(p);
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await context.params;
  const { participantId, x, y } = (await req.json()) as { participantId: string; x: number; y: number };
  const updated = await prisma.lineupPosition.upsert({
    where: { teamId_participantId: { teamId, participantId } },
    update: { x, y },
    create: { teamId, participantId, x, y },
  });
  return NextResponse.json(updated);
}



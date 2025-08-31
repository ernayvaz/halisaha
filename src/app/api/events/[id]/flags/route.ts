import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await req.json();
  const { rosterLocked, lineupLocked } = body as { rosterLocked?: boolean; lineupLocked?: boolean };
  const event = await prisma.event.update({
    where: { id },
    data: {
      rosterLocked: typeof rosterLocked === 'boolean' ? rosterLocked : undefined,
      lineupLocked: typeof lineupLocked === 'boolean' ? lineupLocked : undefined,
    },
  });
  return NextResponse.json({ rosterLocked: event.rosterLocked, lineupLocked: event.lineupLocked });
}



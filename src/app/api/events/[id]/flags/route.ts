import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { publish } from '@/lib/realtime';
import { ensureOwner } from '@/lib/auth';

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!(await ensureOwner(id))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const body = await req.json();
  const { rosterLocked, lineupLocked } = body as { rosterLocked?: boolean; lineupLocked?: boolean };
  const event = await prisma.event.update({
    where: { id },
    data: {
      rosterLocked: typeof rosterLocked === 'boolean' ? rosterLocked : undefined,
      lineupLocked: typeof lineupLocked === 'boolean' ? lineupLocked : undefined,
    },
  });
  await publish({ type: 'flags_updated', eventId: id });
  return NextResponse.json({ rosterLocked: event.rosterLocked, lineupLocked: event.lineupLocked });
}



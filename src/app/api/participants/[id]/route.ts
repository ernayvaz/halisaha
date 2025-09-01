import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { publish } from '@/lib/realtime';

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { guestName } = (await req.json()) as { guestName?: string };
  
  const participant = await prisma.participant.findUnique({ 
    where: { id },
    select: { eventId: true, isGuest: true }
  });
  
  if (!participant) return NextResponse.json({ error: 'participant not found' }, { status: 404 });
  if (!participant.isGuest) return NextResponse.json({ error: 'not a guest' }, { status: 400 });
  
  const updated = await prisma.participant.update({
    where: { id },
    data: { guestName: guestName || null },
    include: { user: { select: { id: true, handle: true, displayName: true } } }
  });
  
  // Trigger realtime update
  await publish({ type: 'participants_updated', eventId: participant.eventId });
  
  return NextResponse.json(updated);
}

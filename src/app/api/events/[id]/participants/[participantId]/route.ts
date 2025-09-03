import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rateLimit';
import { publish } from '@/lib/realtime';
import { ensureOwner } from '@/lib/auth';

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string; participantId: string }> }) {
  const ip = req.headers.get('x-forwarded-for') || 'local';
  if (!rateLimit(`remove_participant:${ip}`, 30, 60_000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const { id: eventId, participantId } = await context.params;
  
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return NextResponse.json({ error: 'event not found' }, { status: 404 });
  
  if (event.rosterLocked) return NextResponse.json({ error: 'roster_locked' }, { status: 403 });
  if (!(await ensureOwner(eventId))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  // Get participant to check if they exist
  const participant = await prisma.participant.findUnique({ where: { id: participantId } });
  if (!participant) return NextResponse.json({ error: 'participant not found' }, { status: 404 });
  
  // Remove from teams first (assignments and positions)
  const teamIds = (await prisma.team.findMany({ where: { eventId }, select: { id: true } })).map(t => t.id);
  
  await prisma.$transaction([
    prisma.assignment.deleteMany({ where: { participantId, teamId: { in: teamIds } } }),
    prisma.lineupPosition.deleteMany({ where: { participantId, teamId: { in: teamIds } } }),
    prisma.participant.delete({ where: { id: participantId } })
  ]);

  await publish({ type: 'participants_updated', eventId });
  await publish({ type: 'teams_updated', eventId });
  
  return NextResponse.json({ ok: true });
}

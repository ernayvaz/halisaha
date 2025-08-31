import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rateLimit';

export async function GET(_: NextRequest, context: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await context.params;
  const p = await prisma.lineupPosition.findMany({ where: { teamId } });
  return NextResponse.json(p);
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ teamId: string }> }) {
  const ip = req.headers.get('x-forwarded-for') || 'local';
  if (!rateLimit(`pos:${ip}`, 120, 60_000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  const { teamId } = await context.params;
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { eventId: true } });
  if (!team) return NextResponse.json({ error: 'team not found' }, { status: 404 });
  const event = await prisma.event.findUnique({ where: { id: team.eventId } });
  if (!event) return NextResponse.json({ error: 'event not found' }, { status: 404 });
  if (event.lineupLocked) return NextResponse.json({ error: 'lineup_locked' }, { status: 403 });

  const { participantId, x, y } = (await req.json()) as { participantId: string; x: number; y: number };
  const updated = await prisma.lineupPosition.upsert({
    where: { teamId_participantId: { teamId, participantId } },
    update: { x, y },
    create: { teamId, participantId, x, y },
  });
  return NextResponse.json(updated);
}



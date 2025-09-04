import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rateLimit';
import { publish } from '@/lib/realtime';
import { ensureOwner } from '@/lib/auth';

export async function POST(req: NextRequest, context: { params: Promise<{ teamId: string }> }) {
  const ip = req.headers.get('x-forwarded-for') || 'local';
  if (!rateLimit(`auto_position:${ip}`, 30, 60_000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const { teamId } = await context.params;
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { eventId: true } });
  if (!team) return NextResponse.json({ error: 'team not found' }, { status: 404 });

  const event = await prisma.event.findUnique({ where: { id: team.eventId } });
  if (!event) return NextResponse.json({ error: 'event not found' }, { status: 404 });
  if (event.lineupLocked) return NextResponse.json({ error: 'lineup_locked' }, { status: 403 });
  if (!(await ensureOwner(team.eventId))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { positions } = (await req.json()) as { positions: Array<{ id: string; teamId: string; participantId: string; x: number; y: number }> };

  // Clear existing positions and create new ones
  await prisma.$transaction([
    prisma.lineupPosition.deleteMany({ where: { teamId } }),
    prisma.lineupPosition.createMany({ 
      data: positions.map(p => ({ 
        teamId: p.teamId, 
        participantId: p.participantId, 
        x: p.x, 
        y: p.y 
      })) 
    })
  ]);

  await publish({ type: 'positions_updated', teamId });
  
  return NextResponse.json({ ok: true });
}

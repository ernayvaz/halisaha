import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return NextResponse.json({ error: 'event not found' }, { status: 404 });

  // Remove related data but keep users intact
  const teams = await prisma.team.findMany({ where: { eventId: id }, select: { id: true } });
  const teamIds = teams.map(t => t.id);
  await prisma.$transaction([
    prisma.lineupPosition.deleteMany({ where: { teamId: { in: teamIds } } }),
    prisma.assignment.deleteMany({ where: { teamId: { in: teamIds } } }),
    prisma.team.deleteMany({ where: { eventId: id } }),
    prisma.participant.deleteMany({ where: { eventId: id } }),
    prisma.mVPPoll.deleteMany({ where: { eventId: id } }),
    prisma.historySnapshot.deleteMany({ where: { eventId: id } }),
    prisma.event.update({ where: { id }, data: { status: 'open', rosterLocked: false, lineupLocked: false, preNotify1hSent: false, preNotify2hSent: false, preNotify3hSent: false } })
  ]);

  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await req.json().catch(()=>({})) as { action?: string };
  if (body?.action !== 'soft_reset') return NextResponse.json({ error: 'unsupported' }, { status: 400 });
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return NextResponse.json({ error: 'event not found' }, { status: 404 });
  const teams = await prisma.team.findMany({ where: { eventId: id }, select: { id: true } });
  const teamIds = teams.map(t => t.id);
  await prisma.$transaction([
    prisma.lineupPosition.deleteMany({ where: { teamId: { in: teamIds } } }),
    prisma.assignment.deleteMany({ where: { teamId: { in: teamIds } } }),
    prisma.team.deleteMany({ where: { eventId: id } }),
    prisma.event.update({ where: { id }, data: { rosterLocked: false, lineupLocked: false } })
  ]);
  return NextResponse.json({ ok: true });
}


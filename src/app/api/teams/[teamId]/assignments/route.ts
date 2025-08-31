import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rateLimit';

export async function GET(_: NextRequest, context: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await context.params;
  const a = await prisma.assignment.findMany({ where: { teamId }, include: { participant: { include: { user: { select: { id: true, handle: true, displayName: true } } } } } });
  return NextResponse.json(a);
}

export async function POST(req: NextRequest, context: { params: Promise<{ teamId: string }> }) {
  const ip = req.headers.get('x-forwarded-for') || 'local';
  if (!rateLimit(`assign:${ip}`, 60, 60_000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  const { teamId } = await context.params;
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { eventId: true } });
  if (!team) return NextResponse.json({ error: 'team not found' }, { status: 404 });
  const event = await prisma.event.findUnique({ where: { id: team.eventId } });
  if (!event) return NextResponse.json({ error: 'event not found' }, { status: 404 });
  if (event.rosterLocked) return NextResponse.json({ error: 'roster_locked' }, { status: 403 });

  const { participantId } = (await req.json()) as { participantId: string };
  const created = await prisma.assignment.upsert({
    where: { teamId_participantId: { teamId, participantId } },
    update: {},
    create: { teamId, participantId },
  });
  return NextResponse.json(created, { status: 201 });
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ teamId: string }> }) {
  const ip = req.headers.get('x-forwarded-for') || 'local';
  if (!rateLimit(`assign:${ip}`, 60, 60_000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  const { teamId } = await context.params;
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { eventId: true } });
  if (!team) return NextResponse.json({ error: 'team not found' }, { status: 404 });
  const event = await prisma.event.findUnique({ where: { id: team.eventId } });
  if (!event) return NextResponse.json({ error: 'event not found' }, { status: 404 });
  if (event.rosterLocked) return NextResponse.json({ error: 'roster_locked' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const participantId = searchParams.get('participantId');
  if (!participantId) return NextResponse.json({ error: 'participantId required' }, { status: 400 });
  await prisma.assignment.delete({ where: { teamId_participantId: { teamId, participantId } } });
  return NextResponse.json({ ok: true });
}



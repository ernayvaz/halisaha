import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rateLimit';
import { publish } from '@/lib/realtime';

function pickNonGreenColor() {
  const palette = ['#2563eb', '#db2777', '#f59e0b', '#7c3aed', '#0ea5a8', '#ef4444', '#eab308', '#14b8a6'];
  return palette[Math.floor(Math.random()*palette.length)];
}

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const participants = await prisma.participant.findMany({
    where: { eventId: id },
    include: { user: { select: { id: true, handle: true, displayName: true, badges: { where: { type: 'MVP' }, select: { level: true, count: true } } } } },
    orderBy: { joinedAt: 'asc' },
  });
  return NextResponse.json(participants);
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const ip = req.headers.get('x-forwarded-for') || 'local';
  if (!rateLimit(`join:${ip}`, 20, 60_000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const { userId, guestName, mode } = (await req.json()) as {
    userId?: string;
    guestName?: string;
    mode: 'join' | 'view';
  };

  const { id } = await context.params;
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return NextResponse.json({ error: 'event not found' }, { status: 404 });

  if (mode === 'view') {
    return NextResponse.json({ ok: true });
  }

  if (event.rosterLocked) {
    return NextResponse.json({ error: 'roster_locked' }, { status: 403 });
  }

  if (!userId && !guestName) {
    return NextResponse.json({ error: 'userId or guestName required' }, { status: 400 });
  }

  if (userId) {
    const exists = await prisma.participant.findFirst({ where: { eventId: id, userId } });
    if (exists) return NextResponse.json(exists);
  }

  // Check if there's already an owner for this event
  const existingOwner = await prisma.participant.findFirst({ 
    where: { eventId: id, role: 'owner' } 
  });
  const role = existingOwner ? 'player' : 'owner';

  const participant = await prisma.participant.create({
    data: {
      eventId: id,
      userId: userId || null,
      guestName: userId ? null : guestName || null,
      isGuest: !userId,
      role,
    },
  });

  // Auto-assign: create teams if missing, then put participant into the team with fewer members (tie -> random)
  const [team1, team2] = await Promise.all([
    prisma.team.upsert({ where: { eventId_index: { eventId: id, index: 1 } }, update: {}, create: { eventId: id, index: 1, name: 'Team 1', color: pickNonGreenColor() } }),
    prisma.team.upsert({ where: { eventId_index: { eventId: id, index: 2 } }, update: {}, create: { eventId: id, index: 2, name: 'Team 2', color: pickNonGreenColor() } })
  ]);
  const [c1, c2] = await Promise.all([
    prisma.assignment.count({ where: { teamId: team1.id } }),
    prisma.assignment.count({ where: { teamId: team2.id } }),
  ]);
  let targetTeamId = team1.id;
  if (c2 < c1) targetTeamId = team2.id;
  else if (c1 === c2) targetTeamId = Math.random() < 0.5 ? team1.id : team2.id;
  await prisma.assignment.upsert({ where: { teamId_participantId: { teamId: targetTeamId, participantId: participant.id } }, update: {}, create: { teamId: targetTeamId, participantId: participant.id } });

  await publish({ type: 'participants_updated', eventId: id });
  await publish({ type: 'assignments_updated', teamId: targetTeamId });
  await publish({ type: 'teams_updated', eventId: id });

  return NextResponse.json(participant, { status: 201 });
}



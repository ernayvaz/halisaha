import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rateLimit';

type Method = 'snake' | 'greedy';

function scoreOf(u: { pace?: number | null; shoot?: number | null; pass?: number | null; defend?: number | null }) {
  return (u.pace ?? 1) + (u.shoot ?? 1) + (u.pass ?? 1) + (u.defend ?? 1);
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const ip = req.headers.get('x-forwarded-for') || 'local';
  if (!rateLimit(`auto:${ip}`, 20, 60_000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  const { id } = await context.params;
  const { method, apply } = (await req.json()) as { method: Method; apply?: boolean };
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return NextResponse.json({ error: 'event not found' }, { status: 404 });
  if (apply && event.rosterLocked) return NextResponse.json({ error: 'roster_locked' }, { status: 403 });

  const [team1, team2] = await Promise.all([
    prisma.team.upsert({ where: { eventId_index: { eventId: id, index: 1 } }, update: {}, create: { eventId: id, index: 1, name: 'Takım 1' } }),
    prisma.team.upsert({ where: { eventId_index: { eventId: id, index: 2 } }, update: {}, create: { eventId: id, index: 2, name: 'Takım 2' } })
  ]);

  const participants = await prisma.participant.findMany({
    where: { eventId: id },
    include: { user: { select: { id: true, pace: true, shoot: true, pass: true, defend: true } } },
    orderBy: { joinedAt: 'asc' },
  });

  type ParticipantWithStats = { id: string; user: { pace: number | null; shoot: number | null; pass: number | null; defend: number | null } | null };
  const pool = participants.map((p: ParticipantWithStats) => ({
    participantId: p.id,
    score: scoreOf({ pace: p.user?.pace, shoot: p.user?.shoot, pass: p.user?.pass, defend: p.user?.defend }),
  }));

  pool.sort((a, b) => b.score - a.score);

  const a: string[] = [];
  const b: string[] = [];

  if (method === 'snake') {
    let toA = true;
    pool.forEach((x, i) => {
      if (toA) a.push(x.participantId); else b.push(x.participantId);
      if (i % 2 === 0) toA = !toA;
    });
  } else {
    let sumA = 0, sumB = 0;
    for (const x of pool) {
      if (sumA <= sumB) { a.push(x.participantId); sumA += x.score; }
      else { b.push(x.participantId); sumB += x.score; }
    }
  }

  if (apply) {
    await prisma.$transaction([
      prisma.assignment.deleteMany({ where: { teamId: { in: [team1.id, team2.id] } } }),
      prisma.lineupPosition.deleteMany({ where: { teamId: { in: [team1.id, team2.id] } } }),
      prisma.assignment.createMany({ data: a.map((pid) => ({ teamId: team1.id, participantId: pid })) }),
      prisma.assignment.createMany({ data: b.map((pid) => ({ teamId: team2.id, participantId: pid })) }),
    ]);
  }

  const sum = (ids: string[]) => ids.reduce((s, pid) => {
    const item = pool.find((p) => p.participantId === pid);
    return s + (item?.score || 0);
  }, 0);

  return NextResponse.json({ team1: a, team2: b, scoreA: sum(a), scoreB: sum(b), applied: Boolean(apply) });
}



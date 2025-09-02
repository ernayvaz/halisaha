import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rateLimit';
import { publish } from '@/lib/realtime';
import { cookies } from 'next/headers';

type Method = 'snake' | 'greedy';

function scoreOf(u: { pace?: number | null; shoot?: number | null; pass?: number | null; defend?: number | null }) {
  return (u.pace ?? 3) + (u.shoot ?? 3) + (u.pass ?? 3) + (u.defend ?? 3);
}

async function ensureOwner(eventId: string) {
  const cookieStore = await cookies();
  const deviceToken = cookieStore.get('device_token')?.value;
  if (!deviceToken) return false;
  const device = await prisma.device.findUnique({ where: { deviceToken }, select: { userId: true } });
  if (!device?.userId) return false;
  const me = await prisma.participant.findFirst({ where: { eventId, userId: device.userId } });
  return me?.role === 'owner';
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
  if (apply && !(await ensureOwner(id))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const [team1, team2] = await Promise.all([
    prisma.team.upsert({ where: { eventId_index: { eventId: id, index: 1 } }, update: {}, create: { eventId: id, index: 1, name: 'Team 1' } }),
    prisma.team.upsert({ where: { eventId_index: { eventId: id, index: 2 } }, update: {}, create: { eventId: id, index: 2, name: 'Team 2' } })
  ]);

  const participants = await prisma.participant.findMany({
    where: { eventId: id },
    include: { user: { select: { id: true, pace: true, shoot: true, pass: true, defend: true } } },
    orderBy: { joinedAt: 'asc' },
  });

  type PoolItem = { participantId: string; score: number };
  const pool: PoolItem[] = participants.map((p: { id: string; user: { pace: number | null; shoot: number | null; pass: number | null; defend: number | null } | null }) => ({
    participantId: p.id,
    score: scoreOf({ pace: p.user?.pace, shoot: p.user?.shoot, pass: p.user?.pass, defend: p.user?.defend }),
  }));

  pool.sort((a: PoolItem, b: PoolItem) => b.score - a.score);

  const a: string[] = [];
  const b: string[] = [];

  if (method === 'snake') {
    let toA = true;
    pool.forEach((x, i) => {
      if (toA) a.push(x.participantId); else b.push(x.participantId);
      if (i % 2 === 0) toA = !toA; // A, B, B, A, A, B, B, A, ...
    });
  } else {
    // Greedy with fairer tie-breaks: minimize absolute diff, prefer smaller team size when diff equal
    let sumA = 0, sumB = 0;
    for (const x of pool) {
      const diffIfA = Math.abs((sumA + x.score) - sumB);
      const diffIfB = Math.abs(sumA - (sumB + x.score));
      if (diffIfA < diffIfB) {
        a.push(x.participantId); sumA += x.score;
      } else if (diffIfB < diffIfA) {
        b.push(x.participantId); sumB += x.score;
      } else {
        if (a.length < b.length) { a.push(x.participantId); sumA += x.score; }
        else if (b.length < a.length) { b.push(x.participantId); sumB += x.score; }
        else { a.push(x.participantId); sumA += x.score; }
      }
    }
  }

  if (apply) {
    await prisma.$transaction([
      prisma.assignment.deleteMany({ where: { teamId: { in: [team1.id, team2.id] } } }),
      prisma.lineupPosition.deleteMany({ where: { teamId: { in: [team1.id, team2.id] } } }),
      prisma.assignment.createMany({ data: a.map((pid) => ({ teamId: team1.id, participantId: pid })) }),
      prisma.assignment.createMany({ data: b.map((pid) => ({ teamId: team2.id, participantId: pid })) }),
    ]);
    await publish({ type: 'assignments_updated', teamId: team1.id });
    await publish({ type: 'assignments_updated', teamId: team2.id });
  }

  const sum = (ids: string[]) => ids.reduce((s, pid) => {
    const item = pool.find((p) => p.participantId === pid);
    return s + (item?.score || 0);
  }, 0);

  return NextResponse.json({ team1: a, team2: b, scoreA: sum(a), scoreB: sum(b), applied: Boolean(apply) });
}



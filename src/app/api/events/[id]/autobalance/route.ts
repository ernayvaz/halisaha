import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rateLimit';
import { publish } from '@/lib/realtime';
import { cookies } from 'next/headers';

type Method = 'snake' | 'greedy';

function num(n: number | null | undefined, fallback = 3): number { return typeof n === 'number' && Number.isFinite(n) ? n : fallback; }
function scoreOf(u: { pace?: number | null; shoot?: number | null; pass?: number | null; defend?: number | null }) {
  return num(u.pace) + num(u.shoot) + num(u.pass) + num(u.defend);
}

// Position scoring per requirement:
// - For forward (F): base by shoot; tiebreaker by avg of other 3
// - For midfield (M): base by pass; tiebreaker by avg of other 3
// - For defense (D): base by defend; tiebreaker by avg of other 3
function positionScore(u: { pace?: number | null; shoot?: number | null; pass?: number | null; defend?: number | null }, pos: 'F'|'M'|'D'): number {
  const pace = num(u.pace), shoot = num(u.shoot), pass = num(u.pass), defend = num(u.defend);
  if (pos === 'F') return shoot + (pace + pass + defend) / 3;
  if (pos === 'M') return pass + (pace + shoot + defend) / 3;
  return defend + (pace + shoot + pass) / 3;
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
  // Derive recommended roles for each participant based on their stats
  const roleFor: Record<string,'F'|'M'|'D'> = {};
  for (const p of participants) {
    const u = p.user || {} as any;
    const f = positionScore(u, 'F');
    const m = positionScore(u, 'M');
    const d = positionScore(u, 'D');
    const max = Math.max(f, m, d);
    const picks: Array<'F'|'M'|'D'> = [];
    if (Math.abs(f-max) < 1e-9) picks.push('F');
    if (Math.abs(m-max) < 1e-9) picks.push('M');
    if (Math.abs(d-max) < 1e-9) picks.push('D');
    roleFor[p.id] = picks[Math.floor(Math.random()*picks.length)];
  }

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
    // Assign players, then place them on the half-fields according to inferred role
    const toCreatePositions = (teamId: string, ids: string[]) => {
      // Simple laneing: D near own goal, M middle, F near attack
      const lanes: Record<'D'|'M'|'F', number> = { D: 0.14, M: 0.56, F: 0.86 };
      const byRole: Record<'D'|'M'|'F', string[]> = { D: [], M: [], F: [] };
      for (const pid of ids) byRole[roleFor[pid] || 'M'].push(pid);
      const rows: Array<'D'|'M'|'F'> = ['D','M','F'];
      const positions: { teamId: string; participantId: string; x: number; y: number }[] = [];
      for (const r of rows) {
        const list = byRole[r];
        const n = list.length;
        for (let i=0;i<n;i++) {
          const x = n===1 ? 0.5 : (0.2 + i*(0.6/(n-1)));
          positions.push({ teamId, participantId: list[i], x, y: lanes[r] });
        }
      }
      return positions;
    };
    const posA = toCreatePositions(team1.id, a);
    const posB = toCreatePositions(team2.id, b);

    await prisma.$transaction([
      prisma.assignment.deleteMany({ where: { teamId: { in: [team1.id, team2.id] } } }),
      prisma.lineupPosition.deleteMany({ where: { teamId: { in: [team1.id, team2.id] } } }),
      prisma.assignment.createMany({ data: a.map((pid) => ({ teamId: team1.id, participantId: pid })) }),
      prisma.assignment.createMany({ data: b.map((pid) => ({ teamId: team2.id, participantId: pid })) }),
      prisma.lineupPosition.createMany({ data: posA }),
      prisma.lineupPosition.createMany({ data: posB }),
    ]);
    await publish({ type: 'assignments_updated', teamId: team1.id });
    await publish({ type: 'assignments_updated', teamId: team2.id });
    await publish({ type: 'positions_updated', teamId: team1.id });
    await publish({ type: 'positions_updated', teamId: team2.id });
  }

  const sum = (ids: string[]) => ids.reduce((s, pid) => {
    const item = pool.find((p) => p.participantId === pid);
    return s + (item?.score || 0);
  }, 0);

  return NextResponse.json({ team1: a, team2: b, scoreA: sum(a), scoreB: sum(b), applied: Boolean(apply) });
}



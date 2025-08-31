import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type SmokeStep = Record<string, unknown>;
type SmokeResult = { ok: boolean; steps: SmokeStep[] };

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'disabled' }, { status: 404 });
  }
  const result: SmokeResult = { ok: true, steps: [] };
  try {
    // 1) Create event
    const ev = await prisma.event.create({ data: { code: Math.random().toString(36).slice(2, 8).toUpperCase(), name: 'Smoke Test', durationMinutes: 60 } });
    result.steps.push({ createEvent: { id: ev.id, code: ev.code } });

    // 2) Bind user
    const handle = 's' + Math.floor(Math.random() * 1e9).toString();
    const user = await prisma.user.create({ data: { handle, displayName: 'Smoke User' } });
    result.steps.push({ anonymousUser: { id: user.id } });

    // 3) Join participant
    const participant = await prisma.participant.create({ data: { eventId: ev.id, userId: user.id, isGuest: false, role: 'owner' } });
    result.steps.push({ join: { id: participant.id } });

    // 4) Upsert teams
    const t1 = await prisma.team.upsert({ where: { eventId_index: { eventId: ev.id, index: 1 } }, update: { name: 'A' }, create: { eventId: ev.id, index: 1, name: 'A' } });
    const t2 = await prisma.team.upsert({ where: { eventId_index: { eventId: ev.id, index: 2 } }, update: { name: 'B' }, create: { eventId: ev.id, index: 2, name: 'B' } });
    result.steps.push({ teams: { t1: t1.id, t2: t2.id } });

    // 5) Autobalance greedy apply (simple: single user goes to A)
    await prisma.assignment.deleteMany({ where: { teamId: { in: [t1.id, t2.id] } } });
    await prisma.assignment.create({ data: { teamId: t1.id, participantId: participant.id } });
    result.steps.push({ autobalance: { applied: true } });

    // 6) Snapshot
    const snap = await prisma.historySnapshot.create({ data: { eventId: ev.id, snapshot: { note: 'smoke' }, ttlAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000) } });
    result.steps.push({ snapshot: { id: snap.id } });

    return NextResponse.json(result);
  } catch (err) {
    console.error('SMOKE_ERROR', err);
    return NextResponse.json({ ok: false, error: (err as Error)?.message }, { status: 500 });
  }
}



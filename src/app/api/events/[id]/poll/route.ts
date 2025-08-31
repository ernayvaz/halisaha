import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const poll = await prisma.mVPPoll.findUnique({ where: { eventId: id }, include: { votes: true } });
  if (!poll) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const now = new Date();
  if (now > poll.endsAt && !poll.finalized) {
    // finalize: find top-voted participant and assign/update badge
    const tally = new Map<string, number>();
    for (const v of poll.votes) tally.set(v.targetParticipantId, (tally.get(v.targetParticipantId) || 0) + 1);
    let best: { pid: string; count: number } | null = null;
    for (const [pid, count] of tally.entries()) {
      if (!best || count > best.count) best = { pid, count };
    }
    if (best) {
      const winner = await prisma.participant.findUnique({ where: { id: best.pid }, select: { userId: true } });
      if (winner?.userId) {
        const existing = await prisma.badge.findFirst({ where: { userId: winner.userId, type: 'MVP' } });
        if (existing) {
          await prisma.badge.update({ where: { id: existing.id }, data: { count: { increment: 1 }, level: { increment: 1 } } });
        } else {
          await prisma.badge.create({ data: { userId: winner.userId, type: 'MVP', count: 1, level: 1 } });
        }
      }
    }
    await prisma.mVPPoll.update({ where: { id: poll.id }, data: { finalized: true } });
  }
  const result = await prisma.mVPPoll.findUnique({ where: { eventId: id }, include: { votes: true } });
  return NextResponse.json(result);
}



import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rateLimit';

export async function POST(req: NextRequest, context: { params: Promise<{ pollId: string }> }) {
  const ip = req.headers.get('x-forwarded-for') || 'local';
  if (!rateLimit(`vote:${ip}`, 30, 60_000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  const { pollId } = await context.params;
  const { voterParticipantId, targetParticipantId } = (await req.json()) as { voterParticipantId: string; targetParticipantId: string };
  const poll = await prisma.mVPPoll.findUnique({ where: { id: pollId } });
  if (!poll) return NextResponse.json({ error: 'poll not found' }, { status: 404 });
  const now = new Date();
  if (now < poll.startsAt || now > poll.endsAt || poll.finalized) return NextResponse.json({ error: 'poll closed' }, { status: 400 });

  const vote = await prisma.mVPVote.upsert({
    where: { pollId_voterParticipantId: { pollId, voterParticipantId } },
    update: { targetParticipantId },
    create: { pollId, voterParticipantId, targetParticipantId },
  });
  return NextResponse.json(vote, { status: 201 });
}



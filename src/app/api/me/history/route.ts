import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';

export async function GET(_req: NextRequest) {
  const cookieStore = await cookies();
  const deviceToken = cookieStore.get('device_token')?.value;
  if (!deviceToken) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const device = await prisma.device.findUnique({ where: { deviceToken }, select: { userId: true } });
  if (!device?.userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const userId = device.userId;

  // Past participants (events joined)
  const parts = await prisma.participant.findMany({ where: { userId }, select: { id: true, eventId: true, joinedAt: true, event: { select: { code: true, name: true, date: true, startTime: true } } }, orderBy: { joinedAt: 'desc' }, take: 20 });

  // MVP wins
  const votesGot = await prisma.mVPVote.findMany({ where: { targetParticipant: { userId } }, include: { poll: { select: { eventId: true } } } });
  const mvpWinsByEvent = new Set<string>();
  // Best-effort: if user got most votes we already assign badge during finalize, but list events where got at least one vote
  for (const v of votesGot) mvpWinsByEvent.add(v.poll.eventId);

  // Recent event snapshots (history)
  const snapshots = await prisma.historySnapshot.findMany({ where: { eventId: { in: parts.map(p=>p.eventId) } }, orderBy: { createdAt: 'desc' }, take: 50 });

  return NextResponse.json({
    joined: parts,
    mvpEvents: Array.from(mvpWinsByEvent),
    snapshots,
  });
}


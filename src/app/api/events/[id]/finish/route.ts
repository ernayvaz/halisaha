import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return NextResponse.json({ error: 'event not found' }, { status: 404 });

  let startsInSeconds = 10 * 60; // default 10 minutes
  let durationSeconds = 30 * 60; // default 30 minutes
  try {
    const body = await req.json().catch(() => null) as { startsInSeconds?: number; durationSeconds?: number } | null;
    if (body && typeof body.startsInSeconds === 'number') startsInSeconds = Math.max(0, Math.floor(body.startsInSeconds));
    if (body && typeof body.durationSeconds === 'number') durationSeconds = Math.max(3, Math.floor(body.durationSeconds));
  } catch {}

  const now = new Date();
  const startsAt = new Date(now.getTime() + startsInSeconds * 1000);
  const endsAt = new Date(startsAt.getTime() + durationSeconds * 1000);

  const poll = await prisma.mVPPoll.upsert({
    where: { eventId: id },
    update: { startsAt, endsAt, finalized: false, notifSent: false },
    create: { eventId: id, startsAt, endsAt },
  });

  await prisma.event.update({ where: { id }, data: { status: 'finished' } });

  return NextResponse.json(poll, { status: 201 });
}



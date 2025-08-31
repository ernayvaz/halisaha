import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return NextResponse.json({ error: 'event not found' }, { status: 404 });

  const now = new Date();
  const startsAt = new Date(now.getTime() + 10 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);

  const poll = await prisma.mVPPoll.upsert({
    where: { eventId: id },
    update: { startsAt, endsAt, finalized: false },
    create: { eventId: id, startsAt, endsAt },
  });

  await prisma.event.update({ where: { id }, data: { status: 'finished' } });

  return NextResponse.json(poll, { status: 201 });
}



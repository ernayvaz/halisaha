import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { publish } from '@/lib/realtime';
import { cookies } from 'next/headers';

async function ensureOwner(eventId: string) {
  const cookieStore = await cookies();
  const deviceToken = cookieStore.get('device_token')?.value;
  if (!deviceToken) return false;
  const device = await prisma.device.findUnique({ where: { deviceToken }, select: { userId: true } });
  if (!device?.userId) return false;
  const me = await prisma.participant.findFirst({ where: { eventId, userId: device.userId } });
  return me?.role === 'owner';
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!(await ensureOwner(id))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const body = await req.json();
  const { rosterLocked, lineupLocked } = body as { rosterLocked?: boolean; lineupLocked?: boolean };
  const event = await prisma.event.update({
    where: { id },
    data: {
      rosterLocked: typeof rosterLocked === 'boolean' ? rosterLocked : undefined,
      lineupLocked: typeof lineupLocked === 'boolean' ? lineupLocked : undefined,
    },
  });
  await publish({ type: 'flags_updated', eventId: id });
  return NextResponse.json({ rosterLocked: event.rosterLocked, lineupLocked: event.lineupLocked });
}



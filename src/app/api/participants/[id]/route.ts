import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { publish } from '@/lib/realtime';

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await req.json().catch(()=>({})) as { guestName?: string };
  const p = await prisma.participant.findUnique({ where: { id }, select: { id: true, isGuest: true, eventId: true } });
  if (!p) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (!p.isGuest) return NextResponse.json({ error: 'not_guest' }, { status: 400 });
  const name = (body.guestName || '').trim();
  if (!name) return NextResponse.json({ error: 'name_required' }, { status: 400 });
  const upd = await prisma.participant.update({ where: { id }, data: { guestName: name } });
  await publish({ type: 'participants_updated', eventId: p.eventId });
  return NextResponse.json({ ok: true, id: upd.id, guestName: upd.guestName });
}



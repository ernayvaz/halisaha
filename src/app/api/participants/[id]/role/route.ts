import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await req.json().catch(()=>({})) as { role?: 'owner'|'mod'|'player'|'viewer'; guestName?: string };
  if (!('role' in body) && !('guestName' in body)) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  const updated = await prisma.participant.update({ where: { id }, data: { role: body.role ?? undefined, guestName: body.guestName ?? undefined } });
  return NextResponse.json(updated);
}



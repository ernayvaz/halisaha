import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { role } = (await req.json()) as { role: 'owner' | 'mod' | 'player' | 'viewer' };
  if (!role) return NextResponse.json({ error: 'role required' }, { status: 400 });
  const updated = await prisma.participant.update({ where: { id }, data: { role } });
  return NextResponse.json(updated);
}



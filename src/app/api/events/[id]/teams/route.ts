import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const teams = await prisma.team.findMany({ where: { eventId: id }, orderBy: { index: 'asc' } });
  return NextResponse.json(teams);
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { index, name, color, formation } = (await req.json()) as { index: number; name: string; color?: string; formation?: string };
  if (index !== 1 && index !== 2) return NextResponse.json({ error: 'index must be 1 or 2' }, { status: 400 });
  const created = await prisma.team.upsert({
    where: { eventId_index: { eventId: id, index } },
    update: { name, color: color || undefined, formation: formation || undefined },
    create: { eventId: id, index, name, color: color || '#16a34a', formation: formation || '1-2-2-1' },
  });
  return NextResponse.json(created, { status: 201 });
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { index, name, color, formation } = (await req.json()) as { index: number; name?: string; color?: string; formation?: string };
  if (index !== 1 && index !== 2) return NextResponse.json({ error: 'index must be 1 or 2' }, { status: 400 });
  const team = await prisma.team.update({
    where: { eventId_index: { eventId: id, index } },
    data: { name: name || undefined, color: color || undefined, formation: formation || undefined },
  });
  return NextResponse.json(team);
}



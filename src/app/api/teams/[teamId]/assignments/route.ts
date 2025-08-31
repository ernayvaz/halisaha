import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_: NextRequest, context: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await context.params;
  const a = await prisma.assignment.findMany({ where: { teamId }, include: { participant: true } });
  return NextResponse.json(a);
}

export async function POST(req: NextRequest, context: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await context.params;
  const { participantId } = (await req.json()) as { participantId: string };
  const created = await prisma.assignment.upsert({
    where: { teamId_participantId: { teamId, participantId } },
    update: {},
    create: { teamId, participantId },
  });
  return NextResponse.json(created, { status: 201 });
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await context.params;
  const { searchParams } = new URL(req.url);
  const participantId = searchParams.get('participantId');
  if (!participantId) return NextResponse.json({ error: 'participantId required' }, { status: 400 });
  await prisma.assignment.delete({ where: { teamId_participantId: { teamId, participantId } } });
  return NextResponse.json({ ok: true });
}



import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { publish } from '@/lib/realtime';

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const ttlDays = 180;
  const body = await req.json();
  const ttlAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
  const snap = await prisma.historySnapshot.create({ data: { eventId: id, snapshot: body, ttlAt } });
  // Broadcast so that all clients refresh teams/assignments/positions after an explicit save
  try {
    await publish({ type: 'teams_updated', eventId: id });
    const teams = await prisma.team.findMany({ where: { eventId: id }, select: { id: true } });
    for (const t of teams) {
      await publish({ type: 'assignments_updated', teamId: t.id });
      await publish({ type: 'positions_updated', teamId: t.id });
    }
  } catch {}
  return NextResponse.json(snap, { status: 201 });
}

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const now = new Date();
  const list = await prisma.historySnapshot.findMany({ where: { eventId: id, ttlAt: { gt: now } }, orderBy: { createdAt: 'desc' } });
  return NextResponse.json(list);
} 
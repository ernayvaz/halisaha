import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { publish } from '@/lib/realtime';
import { rateLimit } from '@/lib/rateLimit';
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

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const teams = await prisma.team.findMany({ where: { eventId: id }, orderBy: { index: 'asc' } });
  return NextResponse.json(teams);
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const ip = req.headers.get('x-forwarded-for') || 'local';
  if (!rateLimit(`team:${ip}`, 30, 60_000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  const { id } = await context.params;
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return NextResponse.json({ error: 'event not found' }, { status: 404 });
  if (event.rosterLocked) return NextResponse.json({ error: 'roster_locked' }, { status: 403 });
  if (!(await ensureOwner(id))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { index, name, color, formation } = (await req.json()) as { index: number; name: string; color?: string; formation?: string };
  if (index !== 1 && index !== 2) return NextResponse.json({ error: 'index must be 1 or 2' }, { status: 400 });
  const defaultColors = ['#dc2626', '#f59e0b']; // dark red, sunset yellow
  const defaultColor = color || defaultColors[(index-1) % defaultColors.length];
  const created = await prisma.team.upsert({
    where: { eventId_index: { eventId: id, index } },
    update: { name, color: color || undefined, formation: formation || undefined },
    create: { eventId: id, index, name, color: defaultColor, formation: formation || '1-2-2-1' },
  });
  await publish({ type: 'teams_updated', eventId: id });
  return NextResponse.json(created, { status: 201 });
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  // reserved for possible future partial updates
  return NextResponse.json({ ok: true });
}



import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rateLimit';

function shortCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || 'local';
  if (!rateLimit(`event:${ip}`, 5, 60_000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  const { name, date, startTime, durationMinutes } = (await req.json()) as {
    name?: string;
    date?: string;
    startTime?: string;
    durationMinutes?: number;
  };

  let code = shortCode();
  // retry a few times on collision
  for (let i = 0; i < 5; i++) {
    const exists = await prisma.event.findUnique({ where: { code } });
    if (!exists) break;
    code = shortCode();
  }

  const event = await prisma.event.create({
    data: {
      code,
      name: name || null,
      date: date ? new Date(date) : null,
      startTime: startTime || null,
      durationMinutes: durationMinutes ?? null,
    },
  });
  return NextResponse.json(event, { status: 201 });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 });
  const event = await prisma.event.findUnique({ where: { code } });
  if (!event) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(event);
}



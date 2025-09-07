import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rateLimit';

function randomToken(len = 32) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || 'local';
  if (!rateLimit(`anon:${ip}`, 10, 60_000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  const { handle, displayName } = (await req.json()) as { handle: string; displayName?: string };
  if (!handle) return NextResponse.json({ error: 'handle required' }, { status: 400 });

  const cookieStore = await cookies();
  let deviceToken = cookieStore.get('device_token')?.value;

  const existing = await prisma.user.findUnique({ where: { handle } });
  if (existing) {
    // Allow binding only if this device is already associated with that user
    if (!deviceToken) {
      return NextResponse.json({ error: 'handle_taken' }, { status: 409 });
    }
    const device = await prisma.device.findUnique({ where: { deviceToken } });
    if (!device || device.userId !== existing.id) {
      return NextResponse.json({ error: 'handle_taken' }, { status: 409 });
    }
    return NextResponse.json(existing);
  }

  const user = await prisma.user.create({
    data: {
      handle,
      displayName: displayName || handle,
      // Initialize neutral stats to avoid misleading defaults like 1
      pace: 3,
      shoot: 3,
      pass: 3,
      defend: 3,
      foot: 'R',
    },
  });

  if (!deviceToken) {
    deviceToken = randomToken(40);
    cookieStore.set('device_token', deviceToken, { httpOnly: true, sameSite: 'lax', maxAge: 31536000, secure: process.env.NODE_ENV === 'production' });
  }
  await prisma.device.upsert({
    where: { deviceToken },
    update: { userId: user.id },
    create: { deviceToken, userId: user.id },
  });

  return NextResponse.json(user, { status: 201 });
}



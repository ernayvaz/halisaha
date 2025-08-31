import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { endpoint, keys, userId, deviceToken } = body as { endpoint: string; keys: { p256dh: string; auth: string }; userId?: string; deviceToken?: string };
  if (!endpoint || !keys?.p256dh || !keys?.auth) return NextResponse.json({ error: 'invalid' }, { status: 400 });
  const sub = await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId: userId || null, deviceToken: deviceToken || null, p256dh: keys.p256dh, auth: keys.auth },
    create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, userId: userId || null, deviceToken: deviceToken || null },
  });
  return NextResponse.json({ id: sub.id });
}



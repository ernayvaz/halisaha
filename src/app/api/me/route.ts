import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';

export async function GET(_req: NextRequest) {
  const cookieStore = await cookies();
  const deviceToken = cookieStore.get('device_token')?.value;
  if (!deviceToken) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const device = await prisma.device.findUnique({ where: { deviceToken }, select: { userId: true } });
  if (!device?.userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: device.userId }, include: { badges: true } });
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({
    id: user.id,
    handle: user.handle,
    displayName: user.displayName,
    foot: user.foot,
    pace: user.pace,
    shoot: user.shoot,
    pass: user.pass,
    defend: user.defend,
    badges: user.badges.map(b=>({ id: b.id, type: b.type, level: b.level, count: b.count })),
  });
}



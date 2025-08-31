import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rateLimit';

function isValidHandle(handle: string): boolean {
  if (!/^[a-z0-9_]{3,20}$/.test(handle)) return false;
  return true;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || 'local';
  if (!rateLimit(`nick:${ip}`, 20, 60_000)) {
    return NextResponse.json({ available: false, reason: 'rate_limited' }, { status: 429 });
  }
  const { handle } = (await req.json()) as { handle?: string };
  if (!handle || !isValidHandle(handle)) {
    return NextResponse.json({ available: false, reason: 'invalid' }, { status: 400 });
  }
  const exists = await prisma.user.findUnique({ where: { handle } });
  return NextResponse.json({ available: !exists });
}



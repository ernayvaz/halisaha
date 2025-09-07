import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function POST(_req: NextRequest) {
  try {
    const code = 'D' + Math.random().toString(36).slice(2, 8).toUpperCase();
    const ev = await prisma.event.create({ data: { code, name: 'Debug', durationMinutes: 60 } });
    return NextResponse.json({ ok: true, ev }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}



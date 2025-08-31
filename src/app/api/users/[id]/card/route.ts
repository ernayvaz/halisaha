import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type Foot = 'L' | 'R';
type StatsValidated = {
  ok: true;
  pace: number;
  shoot: number;
  pass: number;
  defend: number;
  foot: Foot;
} | { ok: false; error: string };

function toInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string') {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function validateStats(input: unknown): StatsValidated {
  if (typeof input !== 'object' || input === null) return { ok: false, error: 'Geçersiz gövde' };
  const obj = input as Record<string, unknown>;
  const pace = toInt(obj.pace);
  const shoot = toInt(obj.shoot);
  const pass = toInt(obj.pass);
  const defend = toInt(obj.defend);
  const footRaw = obj.foot;
  const inRange = (x: number | null) => x !== null && Number.isInteger(x) && x >= 1 && x <= 5;
  if (!inRange(pace) || !inRange(shoot) || !inRange(pass) || !inRange(defend)) {
    return { ok: false, error: 'Stats 1-5 arasında olmalı' };
  }
  if (footRaw !== 'L' && footRaw !== 'R') {
    return { ok: false, error: 'Ayak L veya R olmalı' };
  }
  return { ok: true, pace: pace!, shoot: shoot!, pass: pass!, defend: defend!, foot: footRaw };
}

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, foot: true, pace: true, shoot: true, pass: true, defend: true } });
  if (!user) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(user);
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await req.json();
  const v = validateStats(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const user = await prisma.user.update({
    where: { id },
    data: { foot: v.foot, pace: v.pace, shoot: v.shoot, pass: v.pass, defend: v.defend },
    select: { id: true, foot: true, pace: true, shoot: true, pass: true, defend: true },
  });
  return NextResponse.json(user);
}



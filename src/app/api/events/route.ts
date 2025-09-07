import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rateLimit';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

function shortCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function isValidTimeHHMM(value: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function parseDateDdMmYyyy(input: string): Date | null {
  // dd-mm-YYYY
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(input);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  // Construct as UTC midnight to avoid TZ shifts
  const iso = `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T00:00:00.000Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // Extra guard to ensure components match
  if (d.getUTCFullYear() !== year || (d.getUTCMonth() + 1) !== month || d.getUTCDate() !== day) return null;
  return d;
}

function parseDateLoose(input?: string): Date | null {
  if (!input) return null;
  // Try dd-mm-YYYY first
  const ddmmyyyy = parseDateDdMmYyyy(input);
  if (ddmmyyyy) return ddmmyyyy;
  // Fallback: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const d = new Date(`${input}T00:00:00.000Z`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  // Last resort: Date parser
  const any = new Date(input);
  return Number.isNaN(any.getTime()) ? null : any;
}

export async function POST(req: NextRequest) {
  try {
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

    // Validation
    const errors: Record<string, string> = {};
    if (!name || name.trim().length < 2) errors.name = 'Event name is required';
    if (!date) errors.date = 'Date (dd-mm-YYYY) is required';
    const dateObj = parseDateLoose(date);
    if (date && !dateObj) errors.date = 'Date must be in dd-mm-YYYY format';
    if (!startTime || !isValidTimeHHMM(startTime)) errors.startTime = 'Start time (HH:MM 24h) is required';
    const dur = typeof durationMinutes === 'number' ? durationMinutes : Number(durationMinutes);
    if (!Number.isFinite(dur) || dur <= 0 || dur > 300) errors.durationMinutes = 'Duration (minutes) must be between 1 and 300';
    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ error: 'validation_error', details: errors }, { status: 400 });
    }

    let code = shortCode();
    // retry a few times on collision
    for (let i = 0; i < 5; i++) {
      const exists = await prisma.event.findUnique({ where: { code } });
      if (!exists) break;
      code = shortCode();
    }

    // Get current user to set as owner
    const cookieStore = await cookies();
    const deviceToken = cookieStore.get('device_token')?.value;
    let ownerId: string | null = null;
    
    if (deviceToken) {
      const device = await prisma.device.findUnique({ 
        where: { deviceToken }, 
        select: { userId: true } 
      });
      ownerId = device?.userId || null;
    }

    const event = await prisma.event.create({
      data: {
        code,
        name: name || null,
        date: dateObj!,
        startTime: startTime || null,
        durationMinutes: dur,
      },
    });

    // If we have an owner, create a participant record immediately
    if (ownerId) {
      await prisma.participant.create({
        data: {
          eventId: event.id,
          userId: ownerId,
          role: 'owner',
          isGuest: false,
        },
      });
    }

    return NextResponse.json(event, { status: 201 });
  } catch (err: any) {
    console.error('POST /api/events error', err);
    const msg = process.env.NODE_ENV !== 'production' ? (err?.message || String(err)) : 'internal_error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 });
  const event = await prisma.event.findUnique({ where: { code } });
  if (!event) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(event);
}



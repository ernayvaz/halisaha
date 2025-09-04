import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rateLimit';
import { publish } from '@/lib/realtime';

function getTeamColor(index: number) {
  // Default colors: dark red and sunset yellow
  const colors = ['#dc2626', '#f59e0b']; // dark red, sunset yellow
  return colors[(index - 1) % colors.length];
}

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const participants = await prisma.participant.findMany({
    where: { eventId: id },
    include: { user: { select: { id: true, handle: true, displayName: true, badges: { where: { type: 'MVP' }, select: { level: true, count: true } } } } },
    orderBy: { joinedAt: 'asc' },
  });
  return NextResponse.json(participants);
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const ip = req.headers.get('x-forwarded-for') || 'local';
  if (!rateLimit(`join:${ip}`, 20, 60_000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const { userId, guestName, mode } = (await req.json()) as {
    userId?: string;
    guestName?: string;
    mode: 'join' | 'view';
  };

  const { id } = await context.params;
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return NextResponse.json({ error: 'event not found' }, { status: 404 });

  if (mode === 'view') {
    return NextResponse.json({ ok: true });
  }

  if (event.rosterLocked) {
    return NextResponse.json({ error: 'roster_locked' }, { status: 403 });
  }

  // Handle existing user
  if (userId) {
    const exists = await prisma.participant.findFirst({ where: { eventId: id, userId } });
    if (exists) return NextResponse.json(exists);
  }

  // Check if there's already an owner for this event
  const existingOwner = await prisma.participant.findFirst({ 
    where: { eventId: id, role: 'owner' } 
  });
  const role = existingOwner ? 'player' : 'owner';

  // Generate guest name if creating a guest
  let finalGuestName: string | null = null;
  if (!userId) {
    if (guestName) {
      finalGuestName = guestName;
    } else {
      // Generate unique sequential Guest N within this event
      const existing = await prisma.participant.findMany({
        where: { eventId: id, isGuest: true },
        select: { guestName: true },
      });
      const taken = new Set<string>(
        (existing.map((e) => e.guestName || '').filter(Boolean)) as string[]
      );
      // Extract max N from names shaped like "Guest N"
      let maxN = 0;
      for (const name of taken) {
        const m = /^Guest\s+(\d+)$/.exec(name);
        if (m) {
          const n = parseInt(m[1], 10);
          if (!isNaN(n)) maxN = Math.max(maxN, n);
        }
      }
      // Start from maxN+1 and ensure uniqueness
      let candidate = maxN + 1;
      let name = `Guest ${candidate}`;
      while (taken.has(name)) {
        candidate += 1;
        name = `Guest ${candidate}`;
      }
      finalGuestName = name;
    }
  }

  const participant = await prisma.participant.create({
    data: {
      eventId: id,
      userId: userId || null,
      guestName: userId ? null : finalGuestName,
      isGuest: !userId,
      role,
    },
  });

  // Keep publish for participants
  await publish({ type: 'participants_updated', eventId: id });

  return NextResponse.json(participant, { status: 201 });
}



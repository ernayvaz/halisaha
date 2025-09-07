import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rateLimit';
import { ensureOwner } from '@/lib/auth';

export const runtime = 'nodejs';

type SnapshotData = {
  event: {
    id: string;
    code: string;
    name?: string | null;
    date?: Date | null;
    startTime?: string | null;
    durationMinutes?: number | null;
    status: string;
  };
  participants: Array<{
    id: string;
    role: string;
    joinedAt: Date;
    user?: {
      id: string;
      handle: string;
      displayName: string;
      pace?: number | null;
      shoot?: number | null;
      pass?: number | null;
      defend?: number | null;
      foot?: string | null;
    } | null;
    isGuest: boolean;
    guestName?: string | null;
  }>;
  teams: Array<{
    id: string;
    index: number;
    name: string;
    color: string;
    formation: string;
    assignments: Array<{
      participantId: string;
      participant: {
        id: string;
        user?: {
          handle: string;
          displayName: string;
        } | null;
        isGuest: boolean;
        guestName?: string | null;
      };
    }>;
    positions: Array<{
      participantId: string;
      x: number;
      y: number;
    }>;
  }>;
  metadata: {
    snapshotAt: Date;
    note?: string;
  };
};

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await context.params;

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) {
    return NextResponse.json({ error: 'event not found' }, { status: 404 });
  }

  // Get all snapshots for this event, ordered by creation date (newest first)
  const snapshots = await prisma.historySnapshot.findMany({
    where: { eventId },
    orderBy: { createdAt: 'desc' },
    take: 50 // Limit to last 50 snapshots
  });

  return NextResponse.json(snapshots);
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const ip = req.headers.get('x-forwarded-for') || 'local';
  if (!rateLimit(`snapshot:${ip}`, 5, 60_000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const { id: eventId } = await context.params;

  // Check if user is owner (only owners can create snapshots)
  if (!(await ensureOwner(eventId))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { note } = (await req.json().catch(() => ({}))) as { note?: string };

  // Get complete event data for snapshot
  const eventData = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      participants: {
        include: {
          user: {
            select: {
              id: true,
              handle: true,
              displayName: true,
              pace: true,
              shoot: true,
              pass: true,
              defend: true,
              foot: true
            }
          }
        },
        orderBy: { joinedAt: 'asc' }
      },
      teams: {
        include: {
          assignments: {
            include: {
              participant: {
                include: {
                  user: {
                    select: {
                      handle: true,
                      displayName: true
                    }
                  }
                }
              }
            }
          },
          positions: true
        },
        orderBy: { index: 'asc' }
      }
    }
  });

  if (!eventData) {
    return NextResponse.json({ error: 'event not found' }, { status: 404 });
  }

  // Create snapshot data
  const snapshotData: SnapshotData = {
    event: {
      id: eventData.id,
      code: eventData.code,
      name: eventData.name,
      date: eventData.date,
      startTime: eventData.startTime,
      durationMinutes: eventData.durationMinutes,
      status: eventData.status
    },
    participants: eventData.participants.map(p => ({
      id: p.id,
      role: p.role,
      joinedAt: p.joinedAt,
      user: p.user,
      isGuest: p.isGuest,
      guestName: p.guestName
    })),
    teams: eventData.teams.map(t => ({
      id: t.id,
      index: t.index,
      name: t.name,
      color: t.color,
      formation: t.formation,
      assignments: t.assignments.map(a => ({
        participantId: a.participantId,
        participant: {
          id: a.participant.id,
          user: a.participant.user,
          isGuest: a.participant.isGuest,
          guestName: a.participant.guestName
        }
      })),
      positions: t.positions.map(p => ({
        participantId: p.participantId,
        x: p.x,
        y: p.y
      }))
    })),
    metadata: {
      snapshotAt: new Date(),
      note
    }
  };

  // Calculate TTL (90 days from now)
  const ttlAt = new Date();
  ttlAt.setDate(ttlAt.getDate() + 90);

  // Save snapshot
  const snapshot = await prisma.historySnapshot.create({
    data: {
      eventId,
      snapshot: snapshotData as any,
      ttlAt
    }
  });

  return NextResponse.json({
    id: snapshot.id,
    createdAt: snapshot.createdAt,
    ttlAt: snapshot.ttlAt,
    note
  }, { status: 201 });
}

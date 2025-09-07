import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import webpush from 'web-push';

function getEventTimes(e: { date: Date|null; startTime: string|null; durationMinutes: number|null }) {
  if (!e.date || !e.startTime) return null;
  const [h,m] = (e.startTime||'00:00').split(':').map(Number);
  const start = new Date(e.date); start.setHours(h||0, m||0, 0, 0);
  const end = new Date(start.getTime() + (e.durationMinutes??60) * 60 * 1000);
  return { start, end };
}

export async function POST() {
  const now = new Date();
  // Also perform snapshot cleanup to avoid needing a separate cron
  await prisma.historySnapshot.deleteMany({ where: { ttlAt: { lte: now } } });
  const events = await prisma.event.findMany({ where: { status: 'open' } });
  let pushed = 0;
  for (const e of events) {
    const t = getEventTimes({ date: e.date, startTime: e.startTime, durationMinutes: e.durationMinutes });
    if (!t) continue;

    // Pre-game reminders at T-3h/2h/1h
    const diffMs = t.start.getTime() - now.getTime();
    const hoursAhead = Math.ceil(diffMs / (60*60*1000));
    const should3 = hoursAhead===3 && !e.preNotify3hSent;
    const should2 = hoursAhead===2 && !e.preNotify2hSent;
    const should1 = hoursAhead===1 && !e.preNotify1hSent;
    if (should3 || should2 || should1) {
      const title = 'Match reminder';
      const body = `Match starts in ${hoursAhead} hour${hoursAhead>1?'s':''}`;
      await pushAll(title, body);
      await prisma.event.update({ where: { id: e.id }, data: { preNotify3hSent: should3?true:e.preNotify3hSent, preNotify2hSent: should2?true:e.preNotify2hSent, preNotify1hSent: should1?true:e.preNotify1hSent } });
      pushed++;
    }

    // Mark event finished at scheduled end time
    if (now >= t.end && e.status === 'open') {
      await prisma.event.update({ where: { id: e.id }, data: { status: 'finished' } });
    }

    // MVP open at end+10m (also handled for finished events below)
    const mvpOpen = new Date(t.end.getTime() + 10*60*1000);
    if (now >= mvpOpen) {
      const poll = await prisma.mVPPoll.upsert({ where: { eventId: e.id }, update: {}, create: { eventId: e.id, startsAt: mvpOpen, endsAt: new Date(mvpOpen.getTime()+30*60*1000) } });
      if (!poll.finalized && !poll.notifSent) {
        await pushAll('MVP voting started', 'Open the link to vote your MVP');
        await prisma.mVPPoll.update({ where: { id: poll.id }, data: { notifSent: true } });
        pushed++;
      }
    }
  }
  // Process finished events: ensure MVP poll opens at end+10m and auto-reset after poll finalized+grace
  const finished = await prisma.event.findMany({ where: { status: 'finished' } });
  let resets = 0;
  const GRACE_MINUTES = 60; // configurable grace window after poll end
  for (const e of finished) {
    const t = getEventTimes({ date: e.date, startTime: e.startTime, durationMinutes: e.durationMinutes });
    if (t) {
      const mvpOpen = new Date(t.end.getTime() + 10*60*1000);
      if (now >= mvpOpen) {
        const poll = await prisma.mVPPoll.upsert({ where: { eventId: e.id }, update: {}, create: { eventId: e.id, startsAt: mvpOpen, endsAt: new Date(mvpOpen.getTime()+30*60*1000) } });
        if (!poll.finalized && !poll.notifSent) {
          await pushAll('MVP voting started', 'Open the link to vote your MVP');
          await prisma.mVPPoll.update({ where: { id: poll.id }, data: { notifSent: true } });
          pushed++;
        }
      }
    }
    const poll = await prisma.mVPPoll.findUnique({ where: { eventId: e.id } });
    if (!poll || !poll.finalized || !poll.endsAt) continue;
    const graceAt = new Date(poll.endsAt.getTime() + GRACE_MINUTES * 60 * 1000);
    if (now < graceAt) continue;
    // Reset event: clear teams/assignments/positions/participants/poll; keep users and history snapshots
    const teams = await prisma.team.findMany({ where: { eventId: e.id }, select: { id: true } });
    const teamIds = teams.map(t => t.id);
    await prisma.$transaction([
      prisma.lineupPosition.deleteMany({ where: { teamId: { in: teamIds } } }),
      prisma.assignment.deleteMany({ where: { teamId: { in: teamIds } } }),
      prisma.team.deleteMany({ where: { eventId: e.id } }),
      prisma.participant.deleteMany({ where: { eventId: e.id } }),
      prisma.mVPPoll.deleteMany({ where: { eventId: e.id } }),
      prisma.event.update({ where: { id: e.id }, data: { status: 'open', rosterLocked: false, lineupLocked: false, preNotify1hSent: false, preNotify2hSent: false, preNotify3hSent: false } })
    ]);
    resets++;
  }
  return NextResponse.json({ pushed, resets });
}

// Some Vercel plans/UI only create GET cron jobs. Mirror logic for GET.
export async function GET(_req: NextRequest) {
  return POST();
}

async function pushAll(title: string, body: string) {
  const subs = await prisma.pushSubscription.findMany();
  const vapidPublic = process.env.VAPID_PUBLIC_KEY; const vapidPrivate = process.env.VAPID_PRIVATE_KEY; const vapidEmail = process.env.VAPID_EMAIL || 'mailto:admin@example.com';
  if (!vapidPublic || !vapidPrivate) return;
  webpush.setVapidDetails(vapidEmail, vapidPublic, vapidPrivate);
  const payload = JSON.stringify({ title, body });
  await Promise.all(subs.map(async (s)=>{ try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } } as any, payload); } catch {} }));
}



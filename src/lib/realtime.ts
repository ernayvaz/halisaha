import PusherServer from 'pusher';
import type { RealtimeEvent } from '@/types/realtime';

export function getPusherServer() {
  const { PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER } = process.env as Record<string,string|undefined>;
  if (!PUSHER_APP_ID || !PUSHER_KEY || !PUSHER_SECRET || !PUSHER_CLUSTER) return null;
  return new PusherServer({ appId: PUSHER_APP_ID, key: PUSHER_KEY, secret: PUSHER_SECRET, cluster: PUSHER_CLUSTER, useTLS: true });
}

export function getPusherClient() {
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY; const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
  if (!key || !cluster) return null as unknown as PusherClient;
  return new PusherClient(key, { cluster, forceTLS: true });
}

export async function publish(evt: RealtimeEvent) {
  const p = getPusherServer(); if (!p) return;
  const channel = channelFor(evt);
  await p.trigger(channel, 'update', evt);
}

export function subscribe(eventIdOrTeamId: string, onMessage: (evt: RealtimeEvent)=>void) {
  const c = getPusherClient(); if (!c) return () => {};
  const ch = c.subscribe(`ev-${eventIdOrTeamId}`);
  const cb = (data: RealtimeEvent) => onMessage(data);
  ch.bind('update', cb);
  return () => { ch.unbind('update', cb); c.unsubscribe(`ev-${eventIdOrTeamId}`); };
}

function channelFor(evt: RealtimeEvent) {
  if (evt.type==='assignments_updated' || evt.type==='positions_updated') return `ev-${evt.teamId}`;
  return `ev-${('eventId' in evt)? evt.eventId : ''}`;
}



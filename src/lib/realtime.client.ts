"use client";

import PusherClient from 'pusher-js';
import type { RealtimeEvent } from './realtime';

function getClient(): PusherClient | null {
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER as string | undefined;
  if (!key || !cluster) return null;
  return new PusherClient(key, { cluster, forceTLS: true });
}

export function subscribe(eventIdOrTeamId: string, onMessage: (evt: RealtimeEvent) => void) {
  const c = getClient();
  if (!c) return () => {};
  const ch = c.subscribe(`ev-${eventIdOrTeamId}`);
  const cb = (data: RealtimeEvent) => onMessage(data);
  ch.bind('update', cb);
  return () => { ch.unbind('update', cb); c.unsubscribe(`ev-${eventIdOrTeamId}`); };
}



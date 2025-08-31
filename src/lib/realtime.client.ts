"use client";

import type { RealtimeEvent } from './realtime';

let cachedClient: any | null | undefined;

async function getClient() {
  if (cachedClient !== undefined) return cachedClient;
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY; const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER as string | undefined;
  if (!key || !cluster) { cachedClient = null; return cachedClient; }
  try {
    const mod = await import('pusher-js');
    cachedClient = new mod.default(key, { cluster, forceTLS: true });
  } catch {
    cachedClient = null;
  }
  return cachedClient;
}

export function subscribe(eventIdOrTeamId: string, onMessage: (evt: RealtimeEvent) => void) {
  let unsub = () => {};
  (async () => {
    const c = await getClient();
    if (!c) return;
    const ch = c.subscribe(`ev-${eventIdOrTeamId}`);
    const cb = (data: RealtimeEvent) => onMessage(data);
    ch.bind('update', cb);
    unsub = () => { ch.unbind('update', cb); c.unsubscribe(`ev-${eventIdOrTeamId}`); };
  })();
  return () => unsub();
}



"use client";

import { useEffect, useState } from "react";

export default function MePage() {
  const [me, setMe] = useState<any>(null);
  const [history, setHistory] = useState<any>(null);

  useEffect(() => {
    const run = async () => {
      const m = await fetch('/api/me').then(r=>r.json());
      if (m?.error) return;
      setMe(m);
      const h = await fetch('/api/me/history').then(r=>r.json());
      setHistory(h);
    };
    run();
  }, []);

  if (!me) return <main className="p-6 max-w-3xl mx-auto">Loading…</main>;

  const initial = (me.displayName || me.handle || '?').slice(0,1).toUpperCase();

  return (
    <main className="p-6 max-w-3xl mx-auto space-y-6">
      <header className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-green-600 text-white flex items-center justify-center text-lg font-bold" aria-label="Profile avatar">{initial}</div>
        <div>
          <h1 className="text-xl font-semibold">{me.displayName} <span className="text-sm text-gray-500">@{me.handle}</span></h1>
          <div className="text-sm text-gray-600">Foot: {me.foot || '-'} • Pace {me.pace??'-'} • Shoot {me.shoot??'-'} • Pass {me.pass??'-'} • Defend {me.defend??'-'}</div>
        </div>
      </header>

      <section className="space-y-2">
        <h2 className="font-medium">Badges</h2>
        <div className="flex flex-wrap gap-2">
          {(me.badges||[]).length===0 && <span className="text-sm text-gray-500">No badges yet</span>}
          {(me.badges||[]).map((b:any)=>(
            <span key={b.id} className="inline-flex items-center gap-1 border rounded px-2 py-1 text-sm">🏅 MVP x{b.count} (Lv{b.level})</span>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Recent matches</h2>
        {!history?.joined?.length && <p className="text-sm text-gray-500">No joined events yet</p>}
        <ul className="divide-y border rounded">
          {(history?.joined||[]).map((p:any)=>(
            <li key={p.id} className="p-2 text-sm flex items-center justify-between">
              <div>
                <div className="font-medium">{p.event?.name || 'Pickup Game'} <span className="text-gray-500">({p.event?.code})</span></div>
                <div className="text-gray-500">{p.event?.date || ''} {p.event?.startTime || ''}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Recent snapshots</h2>
        {!history?.snapshots?.length && <p className="text-sm text-gray-500">No snapshots yet</p>}
        <ul className="divide-y border rounded">
          {(history?.snapshots||[]).map((s:any)=>(
            <li key={s.id} className="p-2 text-sm">Event: {s.eventId} • {new Date(s.createdAt).toLocaleString()}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}



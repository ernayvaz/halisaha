"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { subscribe } from '@/lib/realtime.client';
import type { RealtimeEvent } from '@/lib/realtime';

type Participant = { id: string; isGuest: boolean; guestName: string|null; role?: string; user?: { id: string; handle: string; displayName: string } };

export default function Lobby() {
  const params = useParams<{ code: string }>();
  const [eventId, setEventId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [selected, setSelected] = useState<Participant | null>(null);

  useEffect(() => {
    const code = params?.code as string;
    if (!code) return;
    const run = async () => {
      const r = await fetch(`/api/events?code=${encodeURIComponent(code)}`);
      if (!r.ok) return;
      const e = await r.json();
      setEventId(e.id);
      const plist = await fetch(`/api/events/${e.id}/participants`).then(x=>x.json());
      setParticipants(plist);
    };
    run();
    let unsub = () => {};
    (async () => {
      const e = await fetch(`/api/events?code=${encodeURIComponent(code)}`).then(x=>x.json());
      unsub = subscribe(e.id, (evt: RealtimeEvent)=>{
        if (evt.type==='participants_updated' || evt.type==='flags_updated') {
          fetch(`/api/events/${e.id}/participants`).then(x=>x.json()).then(setParticipants);
        }
      });
    })();
    return () => unsub();
  }, [params?.code]);

  const addGuest = async (name: string) => {
    if (!eventId || !name) return;
    const r = await fetch(`/api/events/${eventId}/participants`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'join', guestName: name }) });
    if (r.ok) {
      const plist = await fetch(`/api/events/${eventId}/participants`).then(x=>x.json());
      setParticipants(plist);
    }
  };

  return (
    <main className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-semibold">Lobby</h1>
      <p className="text-sm text-gray-500">Join to edit teams and lineup. Viewers can only see participants.</p>
      <section className="space-y-3">
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="block text-sm">Add guest</label>
            <input id="guestName" className="border rounded p-2 w-full" placeholder="Guest name" />
          </div>
          <button onClick={()=>{const v=(document.getElementById('guestName') as HTMLInputElement).value; addGuest(v); (document.getElementById('guestName') as HTMLInputElement).value='';}} className="border px-3 py-2 rounded">Add</button>
        </div>
        <ul className="divide-y border rounded">
          {participants.map((p)=> (
            <li key={p.id} className="p-2 flex justify-between items-center">
              <button onClick={()=>setSelected(p)} className={`text-left ${p.role==='owner'?'font-bold text-gray-900':''}`}>
                {p.isGuest ? (p.guestName || 'Guest') : (p.user?.displayName || p.user?.handle)}
                {p.role==='owner' && <span className="ml-1 text-xs text-gray-500">(owner)</span>}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center" onClick={()=>setSelected(null)}>
          <div className="bg-white text-black rounded p-4 w-80" onClick={(e)=>e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-2">Player Card</h2>
            <p className="text-sm">{selected.isGuest ? (selected.guestName||'Guest') : (selected.user?.displayName || selected.user?.handle)}</p>
            <button className="mt-4 border px-3 py-1 rounded" onClick={()=>setSelected(null)}>Close</button>
          </div>
        </div>
      )}
    </main>
  );
}



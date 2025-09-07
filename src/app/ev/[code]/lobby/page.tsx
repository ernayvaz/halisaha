"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { subscribe, type RealtimeEvent } from '@/lib/realtime';

type Participant = { id: string; isGuest: boolean; guestName: string|null; role?: string; user?: { id: string; handle: string; displayName: string; badges?: { level: number; count: number }[] } };
type UserCard = { id: string; foot: "L"|"R"|null; pace: number|null; shoot: number|null; pass: number|null; defend: number|null };

export default function Lobby() {
  const params = useParams<{ code: string }>();
  const [eventId, setEventId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [selected, setSelected] = useState<Participant | null>(null);
  const [selectedCard, setSelectedCard] = useState<UserCard | null>(null);

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

  useEffect(() => {
    const loadCard = async () => {
      setSelectedCard(null);
      if (!selected?.user?.id) return;
      const r = await fetch(`/api/users/${selected.user.id}/card`);
      if (r.ok) setSelectedCard(await r.json());
    };
    loadCard();
  }, [selected?.user?.id]);

  const MVPBadge = ({ p }: { p: Participant }) => {
    const b = p.user?.badges && p.user.badges[0];
    if (!b) return null;
    return <span title={`MVP Lv${b.level}`} className="ml-2 text-xs inline-flex items-center">🏅 Lv{b.level}</span>;
  };

  return (
    <main className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-semibold">Lobby</h1>
      <p className="text-sm text-gray-500">Join to edit teams and lineup. Viewers can only see participants.</p>
      <section className="space-y-3">
        <ul className="divide-y border rounded">
          {participants.map((p)=> (
            <li key={p.id} className="p-2 flex justify-between items-center">
              <button onClick={()=>setSelected(p)} className={`text-left ${p.role==='owner'?'font-bold text-gray-900':''}`}>
                {p.isGuest ? (p.guestName || 'Guest Player') : (p.user?.displayName || p.user?.handle)}
                <MVPBadge p={p} />
                {p.role==='owner' && <span className="ml-1 text-xs text-gray-500">(owner)</span>}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center" onClick={()=>setSelected(null)}>
          <div className="bg-white text-black rounded p-4 w-80" onClick={(e)=>e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-2">Player Profile Card</h2>
            <p className="text-sm mb-2">{selected.isGuest ? (selected.guestName||'Guest Player') : (selected.user?.displayName || selected.user?.handle)}</p>
            {!selected.isGuest && selectedCard && (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-gray-500">Foot:</span> {selectedCard.foot || '-'}</div>
                <div><span className="text-gray-500">Pace:</span> {selectedCard.pace ?? '-'}</div>
                <div><span className="text-gray-500">Shoot:</span> {selectedCard.shoot ?? '-'}</div>
                <div><span className="text-gray-500">Pass:</span> {selectedCard.pass ?? '-'}</div>
                <div><span className="text-gray-500">Defend:</span> {selectedCard.defend ?? '-'}</div>
              </div>
            )}
            <button className="mt-4 border px-3 py-1 rounded" onClick={()=>setSelected(null)}>Close</button>
          </div>
        </div>
      )}
    </main>
  );
}



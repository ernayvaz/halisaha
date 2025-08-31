"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { subscribe } from '@/lib/realtime.client';
import type { RealtimeEvent } from '@/types/realtime';

type Event = { id: string; code: string; name?: string|null; rosterLocked?: boolean };
type Participant = { id: string; isGuest: boolean; guestName: string|null; user?: { id: string; handle: string; displayName: string } };
type Team = { id: string; eventId: string; index: 1|2; name: string; color: string; formation: string };

export default function TeamsPage() {
  const params = useParams<{ code: string }>();
  const [eventData, setEventData] = useState<Event | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const code = params?.code as string;
    if (!code) return;
    const run = async () => {
      const e = await fetch(`/api/events?code=${encodeURIComponent(code)}`).then(r=>r.json());
      setEventData(e);
      const [plist, tlist] = await Promise.all([
        fetch(`/api/events/${e.id}/participants`).then((r)=>r.json()),
        fetch(`/api/events/${e.id}/teams`).then((r)=>r.json()),
      ]);
      setParticipants(plist); setTeams(tlist);
    };
    run();
    let unsub = () => {};
    (async () => {
      const e = await fetch(`/api/events?code=${encodeURIComponent(code)}`).then(x=>x.json());
      unsub = subscribe(e.id, (evt: RealtimeEvent)=>{
        if (evt.type==='teams_updated' || evt.type==='assignments_updated' || evt.type==='flags_updated') {
          Promise.all([
            fetch(`/api/events/${e.id}/participants`).then((r)=>r.json()).then(setParticipants),
            fetch(`/api/events/${e.id}/teams`).then((r)=>r.json()).then(setTeams),
          ]);
        }
      });
    })();
    return () => unsub();
  }, [params?.code]);

  const team = (idx: 1|2) => teams.find(t=>t.index===idx) as Team | undefined;

  const upsertTeam = async (index: 1|2, partial: Partial<Pick<Team,'name'|'color'|'formation'>>) => {
    if (!eventData) return;
    setBusy(true);
    const body = { index, name: partial.name ?? team(index)?.name ?? `Team ${index}`, color: partial.color ?? team(index)?.color, formation: partial.formation ?? team(index)?.formation };
    const r = await fetch(`/api/events/${eventData.id}/teams`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const t = await r.json();
    const other = teams.filter(x=>x.index!==index);
    setTeams([...other, t].sort((a,b)=>a.index-b.index));
    setBusy(false);
  };

  const assign = async (idx: 1|2, participantId: string) => {
    const t = team(idx);
    if (!t) return;
    await fetch(`/api/teams/${t.id}/assignments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ participantId }) });
  };

  const toggleRosterLock = async () => {
    if (!eventData) return;
    const r = await fetch(`/api/events/${eventData.id}/flags`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rosterLocked: !eventData.rosterLocked }) });
    if (r.ok) {
      const d = await r.json();
      setEventData({ ...eventData, rosterLocked: d.rosterLocked });
    }
  };

  const team1 = team(1);
  const team2 = team(2);

  if (!eventData) return <main className="p-6 max-w-4xl mx-auto">Loading…</main>;

  return (
    <main className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Teams</h1>
        <button onClick={toggleRosterLock} className="border px-3 py-1 rounded">Roster Lock: {eventData.rosterLocked? 'On':'Off'}</button>
      </div>
      <p className="text-sm text-gray-500">Assign players via → buttons or use Auto-balance. Roster lock prevents changes.</p>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded p-3 space-y-2">
          <h2 className="font-medium">Team 1</h2>
          <input className="border rounded p-2 w-full" placeholder="Team name" defaultValue={team1?.name||''} onBlur={(e)=>upsertTeam(1,{name:e.target.value||'Team 1'})} />
          <div className="flex items-center gap-2">
            <label className="text-sm">Color</label>
            <input type="color" defaultValue={team1?.color||'#16a34a'} onChange={(e)=>upsertTeam(1,{color:e.target.value})} />
          </div>
          <select className="border rounded p-2 w-full" defaultValue={team1?.formation||'1-2-2-1'} onChange={(e)=>upsertTeam(1,{formation:e.target.value})}>
            <option value="1-2-1-1">5v5: 1-2-1-1</option>
            <option value="1-1-2-1">5v5: 1-1-2-1</option>
            <option value="1-2-2-1">6v6: 1-2-2-1</option>
            <option value="1-2-2-2">7v7: 1-2-2-2</option>
          </select>
        </div>
        <div className="border rounded p-3 space-y-2">
          <h2 className="font-medium">Team 2</h2>
          <input className="border rounded p-2 w-full" placeholder="Team name" defaultValue={team2?.name||''} onBlur={(e)=>upsertTeam(2,{name:e.target.value||'Team 2'})} />
          <div className="flex items-center gap-2">
            <label className="text-sm">Color</label>
            <input type="color" defaultValue={team2?.color||'#16a34a'} onChange={(e)=>upsertTeam(2,{color:e.target.value})} />
          </div>
          <select className="border rounded p-2 w-full" defaultValue={team2?.formation||'1-2-2-1'} onChange={(e)=>upsertTeam(2,{formation:e.target.value})}>
            <option value="1-2-1-1">5v5: 1-2-1-1</option>
            <option value="1-1-2-1">5v5: 1-1-2-1</option>
            <option value="1-2-2-1">6v6: 1-2-2-1</option>
            <option value="1-2-2-2">7v7: 1-2-2-2</option>
          </select>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded p-3">
          <h3 className="font-medium mb-2">Players</h3>
          <ul className="divide-y">
            {participants.map((p)=> (
              <li key={p.id} className="py-2 flex justify-between items-center">
                <span>{p.isGuest ? (p.guestName || 'Guest') : (p.user?.displayName || p.user?.handle)}</span>
                <div className="flex gap-2">
                  <button disabled={!team1 || eventData.rosterLocked} onClick={()=>assign(1,p.id)} className="text-xs border rounded px-2 py-1">→ 1</button>
                  <button disabled={!team2 || eventData.rosterLocked} onClick={()=>assign(2,p.id)} className="text-xs border rounded px-2 py-1">→ 2</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="border rounded p-3 space-y-2">
          <h3 className="font-medium">Auto-balance</h3>
          <AutoBalance eventId={eventData.id} />
        </div>
      </section>
      {busy && <p className="text-sm text-gray-500">Saving…</p>}
    </main>
  );
}

function AutoBalance({ eventId }: { eventId: string }) {
  const [method, setMethod] = useState<'greedy'|'snake'>('greedy');
  const [preview, setPreview] = useState<{ team1: string[]; team2: string[]; scoreA: number; scoreB: number } | null>(null);

  const run = async (apply: boolean) => {
    const r = await fetch(`/api/events/${eventId}/autobalance`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method, apply }) });
    const d = await r.json();
    setPreview({ team1: d.team1, team2: d.team2, scoreA: d.scoreA, scoreB: d.scoreB });
  };

  return (
    <div className="space-y-2">
      <select className="border rounded p-2" value={method} onChange={(e)=>setMethod(e.target.value as 'greedy'|'snake')}>
        <option value="greedy">Greedy</option>
        <option value="snake">Snake</option>
      </select>
      <div className="flex gap-2">
        <button onClick={()=>run(false)} className="border px-3 py-2 rounded">Preview</button>
        <button onClick={()=>run(true)} className="bg-green-600 text-white px-3 py-2 rounded">Apply</button>
      </div>
      {preview && <p className="text-sm text-gray-600">Score A: {preview.scoreA} • Score B: {preview.scoreB}</p>}
    </div>
  );
}



"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { subscribe, type RealtimeEvent } from '@/lib/realtime';

type Team = { id: string; index: 1|2; name: string; color: string };
type Assignment = { id: string; teamId: string; participantId: string; participant: { isGuest: boolean; guestName: string|null; user?: { displayName: string; handle: string } } };
type Position = { id: string; teamId: string; participantId: string; x: number; y: number };
type Event = { id: string; code: string; lineupLocked?: boolean };

export default function LineupPage() {
  const params = useParams<{ code: string }>();
  const [eventData, setEventData] = useState<Event | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [selectedTeamIdx, setSelectedTeamIdx] = useState<1|2>(1);
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef<{ id: string } | null>(null);

  useEffect(() => {
    const code = params?.code as string;
    if (!code) return;
    const run = async () => {
      const e = await fetch(`/api/events?code=${encodeURIComponent(code)}`).then(r=>r.json());
      setEventData(e);
      const tlist: Team[] = await fetch(`/api/events/${e.id}/teams`).then(r=>r.json());
      setTeams(tlist);
      const t = tlist.find(x=>x.index===selectedTeamIdx);
      if (t) {
        const [asg, pos] = await Promise.all([
          fetch(`/api/teams/${t.id}/assignments`).then(r=>r.json()),
          fetch(`/api/teams/${t.id}/positions`).then(r=>r.json()),
        ]);
        setAssignments(asg); setPositions(pos);
      }
    };
    run();
    let unsub = () => {};
    (async () => {
      const e = await fetch(`/api/events?code=${encodeURIComponent(code)}`).then(x=>x.json());
      unsub = subscribe(e.id, (evt: RealtimeEvent)=>{
        if (evt.type==='positions_updated' || evt.type==='flags_updated') {
          const t = teams.find(x=>x.index===selectedTeamIdx);
          if (t) {
            fetch(`/api/teams/${t.id}/positions`).then(r=>r.json()).then(setPositions);
          }
        }
      });
    })();
    return () => unsub();
  }, [params?.code, selectedTeamIdx]);

  const team = teams.find(x=>x.index===selectedTeamIdx);
  const tokenFor = (pid: string) => positions.find(p=>p.participantId===pid);
  const getDefault = (i: number) => { const cols=4; const row=Math.floor(i/cols); const col=i%cols; return { x:(col+1)/(cols+1), y:(row+1)/(cols+1) }; };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>, pid: string) => {
    if (!fieldRef.current || eventData?.lineupLocked) return;
    draggingRef.current = { id: pid };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!fieldRef.current || !draggingRef.current) return;
    const rect = fieldRef.current.getBoundingClientRect();
    const x = Math.min(Math.max((e.clientX - rect.left)/rect.width,0),1);
    const y = Math.min(Math.max((e.clientY - rect.top)/rect.height,0),1);
    const id = draggingRef.current.id;
    setPositions(prev=>{
      const idx = prev.findIndex(p=>p.participantId===id);
      if (idx>=0){ const copy=[...prev]; copy[idx] = { ...copy[idx], x, y }; return copy; }
      if (!team) return prev; return [...prev, { id: `tmp-${id}`, teamId: team.id, participantId: id, x, y }];
    });
  };
  const onPointerUp = async () => {
    if (!draggingRef.current || !team) return;
    const id = draggingRef.current.id; draggingRef.current = null;
    const pos = positions.find(p=>p.participantId===id); if (!pos) return;
    await fetch(`/api/teams/${team.id}/positions`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ participantId:id, x: pos.x, y: pos.y }) });
    const fresh = await fetch(`/api/teams/${team.id}/positions`).then(r=>r.json()); setPositions(fresh);
  };

  const toggleLineupLock = async () => {
    if (!eventData) return;
    const r = await fetch(`/api/events/${eventData.id}/flags`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ lineupLocked: !eventData.lineupLocked }) });
    if (r.ok){ const d=await r.json(); setEventData({ ...eventData, lineupLocked:d.lineupLocked }); }
  };

  if (!team || !eventData) return <main className="p-6 max-w-4xl mx-auto">Loading…</main>;

  return (
    <main className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button onClick={()=>setSelectedTeamIdx(1)} className={`px-3 py-1 rounded border ${selectedTeamIdx===1?'bg-gray-100':''}`}>Team 1</button>
          <button onClick={()=>setSelectedTeamIdx(2)} className={`px-3 py-1 rounded border ${selectedTeamIdx===2?'bg-gray-100':''}`}>Team 2</button>
        </div>
        <button onClick={toggleLineupLock} className="border px-3 py-1 rounded">Lineup Lock: {eventData.lineupLocked? 'On':'Off'}</button>
      </div>
      <p className="text-sm text-gray-500">Drag tokens to set positions. Lineup lock prevents changes.</p>
      <div ref={fieldRef} onPointerMove={onPointerMove} onPointerUp={onPointerUp} className="relative w-full h-80 bg-green-100 rounded overflow-hidden touch-none">
        {/* Minimal pitch grid */}
        <div className="absolute inset-0 grid grid-cols-4 grid-rows-4">
          {Array.from({length:16}).map((_,i)=>(<div key={i} className="border border-green-200"/>))}
        </div>
        {assignments.map((a, idx)=>{
          const pos = tokenFor(a.participantId) || getDefault(idx);
          const label = a.participant.isGuest ? (a.participant.guestName||'Guest') : (a.participant.user?.displayName || a.participant.user?.handle || 'Player');
          return (
            <div key={a.id} className="absolute" style={{ left: `${pos.x*100}%`, top: `${pos.y*100}%`, transform:'translate(-50%,-50%)' }} onPointerDown={(e)=>onPointerDown(e, a.participantId)}>
              <div className="w-8 h-8 rounded-full bg-green-600 border-2 border-white shadow" aria-label={`Player ${label}`} />
              <div className="text-[10px] mt-1 text-center max-w-[72px] truncate">{label}</div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2">
        <a href={`/api/events/${eventData.id}/snapshot`} className="hidden" />
      </div>
    </main>
  );
}


